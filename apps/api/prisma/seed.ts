/**
 * Seed: the legacy permission matrix (28 objects x actions) and default roles.
 * Run: npx prisma db seed   (configured in package.json)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// The FULL legacy permission catalog (REQUIREMENTS_BASELINE.md §4). Seeded in
// full — including objects whose 2.0 modules aren't built yet — so roles can be
// pre-configured and the data migration maps legacy role->permission 1:1.
//
// Consolidations kept as-is (no legacy-line equivalent to map): requisitionline,
// billline are managed via their parent (requisition/bill); paymentline is gone
// in 2.0 (Payment settles a Bill directly).
const STANDARD_OBJECTS = [
  'account', 'appointment', 'bill', 'cabinet', 'client', 'clienttype',
  'clinicalformitem', 'clinicalitemgroup', 'codefinding', 'codesheet', 'deduction',
  'department', 'earning', 'employee', 'employeedetails', 'formprintgroup',
  'labcode', 'message', 'patient', 'payadvice', 'payment', 'payroll', 'permission',
  'record', 'recordstatus', 'report', 'requisition', 'resultentry', 'resultsheet',
  'role', 'service', 'specimen', 'tax', 'therapy', 'user', 'workspace',
  // F4 AI-assisted reporting: aidraft:create gates generation (Authorizer roles).
  'aidraft',
];
const STANDARD_ACTIONS = ['view', 'create', 'change', 'delete'];
// Extra actions on standard-CRUD objects.
const STANDARD_EXTRA: Record<string, string[]> = {
  record: ['submit'],
  resultsheet: ['authorize'],
  // Messaging: view threads vs. send a message (Phase 6).
  message: ['send'],
  // Appointments: a single write-gate for create/update/delete (Phase 6).
  appointment: ['manage'],
};
// Objects with a non-CRUD action set.
const SPECIAL_OBJECTS: Record<string, string[]> = {
  // System-generated in-app notifications: view + mark-read (change) + delete.
  notification: ['view', 'change', 'delete'],
  applicationprefs: ['view', 'change', 'reports', 'dashboard'],
  accountprefs: ['view', 'change'],
  // Internal System Health dashboard + Security Center — intentionally assigned
  // to NO default role, so only super roles (which bypass the permission guard)
  // can reach them.
  system: ['health', 'security'],
  // Form Setup (clinical-feature UI config). Lab-admin territory — assigned to no
  // default staff role; super roles reach it via the guard bypass.
  formconfig: ['view', 'manage'],
  // Knowledge Base authoring (view is open to all authed users; managing/editing
  // articles is gated). Assigned to no default role — super roles reach it.
  kb: ['manage'],
  // P2-7B — Audit Query API read gates. Independent dimensions: read = own-lab ledger read;
  // read_system = SYSTEM/CROSS_LAB + explicit lab selection; read_phi = patientRef + PHI projection.
  // Assigned to NO default role (byPrefix below never selects 'audit'); super roles reach them via
  // the guard bypass, matching the Security Center. NOT a reuse of system:security.
  audit: ['read', 'read_system', 'read_phi'],
  // P5-5B — digital-pathology viewing. Gates delivery-session issuance (authenticated slide viewing).
  // Assigned to NO default role (byPrefix below never selects 'wsi'); super roles reach it via the guard
  // bypass. Granting wsi:view to specific staff roles is an explicit, separate role-configuration decision.
  wsi: ['view'],
};

async function main() {
  const codes: { code: string; label: string }[] = [];
  for (const obj of STANDARD_OBJECTS) {
    for (const action of [...STANDARD_ACTIONS, ...(STANDARD_EXTRA[obj] ?? [])]) {
      codes.push({ code: `${obj}:${action}`, label: `${action} ${obj}` });
    }
  }
  for (const [obj, actions] of Object.entries(SPECIAL_OBJECTS)) {
    for (const action of actions) codes.push({ code: `${obj}:${action}`, label: `${action} ${obj}` });
  }

  for (const c of codes) {
    await prisma.permission.upsert({ where: { code: c.code }, update: { label: c.label }, create: c });
  }
  // Remove any permission not in the authoritative catalog (e.g. the retired
  // applicationprefs:create/delete, notification:create/change). Cascades their
  // RolePermission rows.
  const keep = codes.map((c) => c.code);
  const removed = await prisma.permission.deleteMany({ where: { code: { notIn: keep } } });
  console.log(`Seeded ${codes.length} permissions (removed ${removed.count} stale)`);

  // Default roles aligned to the REAL legacy role set seen in the app
  // (Pathologist, Receptionist, Lab Technician, Authorizers, Superuser).
  //
  // NOTE: "Clients" is intentionally NOT seeded as a staff role. In 2.0 a client
  // is the PORTAL identity (a structurally client-scoped PortalUser), not a
  // permission-coded staff role — see the F2 portal design. The permission guard
  // has no bearing on portal access.
  //
  // Super roles bypass the permission guard via the isSuperRole flag (not a
  // hardcoded name), so a lab can add its own named super roles later.
  const all = await prisma.permission.findMany();
  const byPrefix = (prefixes: string[], actions?: string[]) =>
    all.filter(
      (p: any) =>
        prefixes.includes(p.code.split(':')[0]) &&
        (!actions || actions.includes(p.code.split(':')[1])),
    );

  const roleDefs: { name: string; description: string; isSuperRole?: boolean; perms: { id: string }[] }[] = [
    { name: 'Superuser', description: 'Full access', isSuperRole: true, perms: [] }, // bypasses via isSuperRole
    {
      name: 'Authorizers',
      description: 'Reviews and authorizes result sheets (holds resultsheet:authorize)',
      perms: byPrefix(
        ['patient', 'client', 'record', 'recordstatus', 'requisition', 'resultsheet', 'resultentry', 'codesheet', 'labcode', 'report', 'cabinet', 'aidraft'],
      ),
    },
    {
      name: 'Pathologist',
      description: 'Authorizer (Pathologist/Cytologist) who signs off and authorizes reports',
      perms: [
        ...byPrefix(
          ['patient', 'client', 'record', 'recordstatus', 'requisition', 'resultsheet', 'resultentry', 'codesheet', 'labcode', 'report', 'cabinet', 'aidraft'],
        ),
        ...byPrefix(['workspace'], ['view', 'create', 'change']),
      ],
    },
    {
      name: 'Lab Technician',
      description: 'Intake, specimens and results entry (no authorization)',
      perms: [
        ...byPrefix(
          ['patient', 'client', 'record', 'recordstatus', 'requisition', 'resultentry', 'cabinet', 'message', 'notification', 'appointment'],
          ['view', 'create', 'change', 'submit'],
        ),
        // Appointment writes gate on appointment:manage (the catalog's single write-gate); grant it so
        // Lab Technicians retain their existing scheduling capability after the record:change → manage fix.
        ...byPrefix(['appointment'], ['manage']),
        ...byPrefix(['workspace'], ['view', 'create', 'change']),
      ],
    },
    {
      name: 'Receptionist',
      description: 'Front desk — patient/client/requisition registration, appointments and billing view',
      perms: [
        ...byPrefix(['patient', 'client', 'requisition'], ['view', 'create']),
        ...byPrefix(['appointment'], ['view', 'manage']),
        ...byPrefix(['bill'], ['view']),
      ],
    },
  ];

  for (const r of roleDefs) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description, isSuperRole: r.isSuperRole ?? false },
      create: { name: r.name, description: r.description, isSuperRole: r.isSuperRole ?? false },
    });
    if (r.perms.length) {
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await prisma.rolePermission.createMany({
        data: r.perms.map((p: any) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
    }
  }
  // Drop retired default roles from earlier seeds: 'Standard' (removed) and the
  // pre-rename 'Authorizer'/'Staff' (now 'Authorizers'/'Lab Technician').
  // Cascades any UserRole rows on those defaults.
  await prisma.role.deleteMany({ where: { name: { in: ['Standard', 'Authorizer', 'Staff'] } } });
  console.log(`Seeded ${roleDefs.length} roles`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
