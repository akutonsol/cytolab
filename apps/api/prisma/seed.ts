/**
 * Seed: the legacy permission matrix (28 objects x actions) and default roles.
 * Run: npx prisma db seed   (configured in package.json)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// From REQUIREMENTS_BASELINE.md §4 — objects guarded in the legacy system
const OBJECTS = [
  'account', 'applicationprefs', 'bill', 'cabinet', 'client', 'clinicalitemgroup',
  'codesheet', 'department', 'employee', 'formprintgroup', 'labcode', 'message',
  'notification', 'patient', 'payadvice', 'payment', 'payroll', 'permission',
  'record', 'recordstatus', 'report', 'requisition', 'resultentry', 'resultsheet',
  'role', 'service', 'tax', 'user',
];
const ACTIONS = ['view', 'create', 'change', 'delete'];
const EXTRA: Record<string, string[]> = {
  record: ['submit'],
  resultsheet: ['authorize'],
  applicationprefs: ['reports'],
};

async function main() {
  const codes: { code: string; label: string }[] = [];
  for (const obj of OBJECTS) {
    for (const action of [...ACTIONS, ...(EXTRA[obj] ?? [])]) {
      codes.push({ code: `${obj}:${action}`, label: `${action} ${obj}` });
    }
  }

  for (const c of codes) {
    await prisma.permission.upsert({ where: { code: c.code }, update: {}, create: c });
  }
  console.log(`Seeded ${codes.length} permissions`);

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
        ['patient', 'client', 'record', 'recordstatus', 'requisition', 'resultsheet', 'resultentry', 'codesheet', 'labcode', 'report', 'cabinet'],
      ),
    },
    {
      name: 'Pathologist',
      description: 'Authorizer (Pathologist/Cytologist) who signs off and authorizes reports',
      perms: byPrefix(
        ['patient', 'client', 'record', 'recordstatus', 'requisition', 'resultsheet', 'resultentry', 'codesheet', 'labcode', 'report', 'cabinet'],
      ),
    },
    {
      name: 'Lab Technician',
      description: 'Intake, specimens and results entry (no authorization)',
      perms: byPrefix(
        ['patient', 'client', 'record', 'recordstatus', 'requisition', 'resultentry', 'cabinet', 'message', 'notification'],
        ['view', 'create', 'change', 'submit'],
      ),
    },
    {
      name: 'Receptionist',
      description: 'Front desk — patient/client/requisition registration and billing view',
      perms: [
        ...byPrefix(['patient', 'client', 'requisition'], ['view', 'create']),
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
