/**
 * One-off: seed 5 demo in-app notifications for the demo lab's superuser so the
 * bell badge and /notifications page have content. Idempotent — clears this
 * user's existing notifications first.
 * Run:  npx ts-node prisma/add-notifications.ts
 */
import { NotificationType, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DEMO_LAB = 'a0cded2b-cd81-4db8-ac8c-65315185c944';
const DEMO_EMAIL = 'william.brooks@cytolab.demo';

async function main() {
  const user = await prisma.user.findFirst({ where: { labId: DEMO_LAB, email: DEMO_EMAIL }, select: { id: true } });
  if (!user) throw new Error(`Demo superuser ${DEMO_EMAIL} not found in lab ${DEMO_LAB}`);

  await prisma.notification.deleteMany({ where: { userId: user.id } });

  const base = { labId: DEMO_LAB, userId: user.id };
  const now = Date.now();
  const min = 60_000;
  const data = [
    { ...base, type: NotificationType.AUTHORIZATION_NEEDED, title: 'Authorization needed', body: 'DM26-07-907 is ready for authorization.', link: '/authorizer', entityType: 'record', read: false, createdAt: new Date(now - 8 * min) },
    { ...base, type: NotificationType.CHANGE_REQUEST_RECEIVED, title: 'New client request', body: 'Dr Brown sent: "Question about my record"', link: '/change-requests', entityType: 'changerequest', read: false, createdAt: new Date(now - 40 * min) },
    { ...base, type: NotificationType.RECORD_APPROVED, title: 'Record authorized', body: 'CBL26-06-007 has been authorized.', link: '/records', entityType: 'record', read: true, readAt: new Date(now - 2 * 60 * min), createdAt: new Date(now - 3 * 60 * min) },
    { ...base, type: NotificationType.PAYMENT_RECEIVED, title: 'Payment received', body: '$50.00 received for DM-BILL-87.', link: '/billing', entityType: 'payment', read: true, readAt: new Date(now - 5 * 60 * min), createdAt: new Date(now - 6 * 60 * min) },
    { ...base, type: NotificationType.SYSTEM_ALERT, title: 'System', body: 'Maintenance completed successfully.', link: '/system', entityType: 'system', read: false, createdAt: new Date(now - 24 * 60 * min) },
  ];

  await prisma.notification.createMany({ data });
  const unread = data.filter((d) => !d.read).length;
  console.log(`Seeded ${data.length} notifications for ${DEMO_EMAIL} (${unread} unread).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
