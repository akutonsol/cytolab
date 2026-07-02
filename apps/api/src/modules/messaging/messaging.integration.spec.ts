import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { MessagingService } from './messaging.service';

/**
 * Messaging aggregation from real data: thread listing (preview + participant
 * gating), chronological message ordering, and updatedAt touch on send. Gated on
 * DATABASE_URL.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('MessagingService (integration)', () => {
  const raw = new PrismaClient();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const service = new MessagingService(prisma, labContext);

  const tag = `msg-${Date.now().toString(36)}`;
  let labId: string;
  let userA: string;
  let userB: string;
  const run = <T>(fn: () => Promise<T>) => labContext.run({ labId }, fn);

  beforeAll(async () => {
    const lab = await raw.lab.create({ data: { name: `Msg ${tag}`, slug: `msg-${tag}` } });
    labId = lab.id;
    const account = await raw.account.create({ data: { labId, name: `Acct ${tag}` } });
    const a = await raw.user.create({ data: { labId, accountId: account.id, email: `${tag}-a@ex.com`, passwordHash: 'x', firstName: 'Alice', lastName: 'A' } });
    const b = await raw.user.create({ data: { labId, accountId: account.id, email: `${tag}-b@ex.com`, passwordHash: 'x', firstName: 'Bob', lastName: 'B' } });
    userA = a.id; userB = b.id;
  });

  afterAll(async () => {
    await raw.message.deleteMany({ where: { thread: { labId } } });
    await raw.threadParticipant.deleteMany({ where: { thread: { labId } } });
    await raw.thread.deleteMany({ where: { labId } });
    await raw.user.deleteMany({ where: { labId } });
    await raw.account.deleteMany({ where: { labId } });
    await raw.lab.deleteMany({ where: { id: labId } });
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('creates a thread, sends alternating messages, lists with preview and reads in order', () =>
    run(async () => {
      const thread = await service.createThread(userA, { subject: 'Case review', type: 'INTERNAL', userIds: [userB] });
      expect(thread.participants).toHaveLength(2);

      await service.sendMessage(userA, thread.id, { body: 'First from Alice' });
      await new Promise((r) => setTimeout(r, 5));
      await service.sendMessage(userB, thread.id, { body: 'Reply from Bob' });

      // listThreads for Alice: one thread, preview = the latest message (Bob's),
      // marked unread because the last author is not Alice.
      const listA = await service.listThreads(userA, { page: 1, pageSize: 20 });
      expect(listA.total).toBe(1);
      const row = listA.data[0];
      expect(row.id).toBe(thread.id);
      expect(row.lastMessage?.body).toBe('Reply from Bob');
      expect(row.unread).toBe(true);
      expect(row.participants).toHaveLength(2);

      // Bob authored the last message → not unread for Bob.
      const listB = await service.listThreads(userB, { page: 1, pageSize: 20 });
      expect(listB.data[0].unread).toBe(false);

      // getThread returns both messages in chronological order.
      const full = await service.getThread(userA, thread.id);
      expect(full.messages.map((m: any) => m.body)).toEqual(['First from Alice', 'Reply from Bob']);
      expect(full.messages[0].authorUser?.firstName).toBe('Alice');
    }));

  it('rejects getThread / sendMessage for a non-participant', () =>
    run(async () => {
      const thread = await service.createThread(userA, { subject: 'Private', type: 'INTERNAL', userIds: [] });
      await expect(service.getThread(userB, thread.id)).rejects.toThrow();
      await expect(service.sendMessage(userB, thread.id, { body: 'sneaky' })).rejects.toThrow();
    }));
});
