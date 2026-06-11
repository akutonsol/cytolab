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

  // Default roles (legacy user_enum parity: Staff, Authorizer, Superuser, Standard)
  const all = await prisma.permission.findMany();
  const byPrefix = (prefixes: string[], actions?: string[]) =>
    all.filter(
      (p: any) =>
        prefixes.includes(p.code.split(':')[0]) &&
        (!actions || actions.includes(p.code.split(':')[1])),
    );

  const roleDefs: { name: string; description: string; perms: { id: string }[] }[] = [
    { name: 'Superuser', description: 'Full access', perms: [] }, // bypasses checks in guard
    {
      name: 'Authorizer',
      description: 'Pathologist/Cytologist — reviews and authorizes results',
      perms: byPrefix(
        ['patient', 'client', 'record', 'recordstatus', 'requisition', 'resultsheet', 'resultentry', 'codesheet', 'labcode', 'report', 'cabinet'],
      ),
    },
    {
      name: 'Staff',
      description: 'Lab staff — intake, specimens, results entry (no authorization)',
      perms: byPrefix(
        ['patient', 'client', 'record', 'recordstatus', 'requisition', 'resultentry', 'cabinet', 'message', 'notification'],
        ['view', 'create', 'change', 'submit'],
      ),
    },
    {
      name: 'Standard',
      description: 'Read-mostly access',
      perms: byPrefix(['patient', 'client', 'record', 'requisition', 'report'], ['view']),
    },
  ];

  for (const r of roleDefs) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: { name: r.name, description: r.description },
    });
    if (r.perms.length) {
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await prisma.rolePermission.createMany({
        data: r.perms.map((p: any) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
    }
  }
  console.log(`Seeded ${roleDefs.length} roles`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
