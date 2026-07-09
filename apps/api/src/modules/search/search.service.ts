import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface SearchHit {
  id: string;
  type: 'patient' | 'record' | 'client' | 'bill';
  title: string;
  subtitle: string;
  status?: string;
  urgent?: boolean;
  link: string;
  createdAt: string;
}
export interface SearchResults {
  patients: SearchHit[];
  records: SearchHit[];
  clients: SearchHit[];
  bills: SearchHit[];
  total: number;
}

const EMPTY: SearchResults = { patients: [], records: [], clients: [], bills: [], total: 0 };

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  /**
   * Cross-entity global search. Every query is lab-scoped by the tenancy guard;
   * the explicit labId keeps the intent obvious and the queries index-friendly.
   */
  async search(query: string, labId: string): Promise<SearchResults> {
    if (!query || query.trim().length < 2) return EMPTY;
    const q = query.trim();
    const ci = (v: string) => ({ contains: v, mode: 'insensitive' as const });

    // Tokenize so a multi-word query matches ACROSS name fields: "nia ca" must
    // match firstName "Nia" AND lastName "Campbell". Each token has to hit one of
    // the entity's searchable fields (AND across tokens, OR across fields), so
    // "nia ca", "ca nia", and "nia" all find Nia Campbell.
    const tokens = q.split(/\s+/).filter(Boolean);
    const allTokens = (fields: (tok: string) => object[]) => ({
      AND: tokens.map((tok) => ({ OR: fields(tok) })),
    });

    const [patients, records, clients, bills] = await Promise.all([
      this.prisma.patient.findMany({
        where: { labId, ...allTokens((t) => [{ firstName: ci(t) }, { lastName: ci(t) }, { registrationNo: ci(t) }]) },
        select: { id: true, firstName: true, lastName: true, registrationNo: true, createdAt: true },
        take: 5,
      }),
      this.prisma.record.findMany({
        where: {
          labId,
          ...allTokens((t) => [
            { labNumber: ci(t) },
            { identifier: ci(t) },
            { patient: { firstName: ci(t) } },
            { patient: { lastName: ci(t) } },
          ]),
        },
        select: {
          id: true, labNumber: true, identifier: true, status: true, formType: true, urgent: true,
          patient: { select: { firstName: true, lastName: true } },
          client: { select: { officeName: true } },
          createdAt: true,
        },
        take: 5,
      }),
      this.prisma.client.findMany({
        where: { labId, ...allTokens((t) => [{ officeName: ci(t) }, { accountNo: ci(t) }, { firstName: ci(t) }, { lastName: ci(t) }]) },
        select: { id: true, firstName: true, lastName: true, officeName: true, accountNo: true },
        take: 5,
      }),
      this.prisma.bill.findMany({
        where: { labId, ...allTokens((t) => [{ referenceNo: ci(t) }]) },
        select: { id: true, referenceNo: true, status: true, total: true, client: { select: { officeName: true } } },
        take: 5,
      }),
    ]);

    return {
      patients: patients.map((p) => ({
        id: p.id,
        type: 'patient' as const,
        title: `${p.firstName} ${p.lastName}`.trim(),
        subtitle: `Reg: ${p.registrationNo ?? '—'}`,
        link: `/patients/${p.id}`,
        createdAt: p.createdAt.toISOString(),
      })),
      records: records.map((r) => ({
        id: r.id,
        type: 'record' as const,
        title: r.labNumber ?? r.identifier,
        subtitle:
          `${r.patient?.firstName ?? ''} ${r.patient?.lastName ?? ''}`.trim() +
          (r.client?.officeName ? ` · ${r.client.officeName}` : ''),
        status: r.status,
        urgent: r.urgent,
        link: `/records/${r.id}`,
        createdAt: r.createdAt.toISOString(),
      })),
      clients: clients.map((c) => ({
        id: c.id,
        type: 'client' as const,
        title: c.officeName || `${c.firstName} ${c.lastName}`.trim(),
        subtitle: c.accountNo ?? '—',
        link: `/clients`,
        createdAt: new Date().toISOString(),
      })),
      bills: bills.map((b) => ({
        id: b.id,
        type: 'bill' as const,
        title: b.referenceNo,
        subtitle: b.client?.officeName ?? '—',
        status: b.status,
        link: `/billing`,
        createdAt: new Date().toISOString(),
      })),
      total: patients.length + records.length + clients.length + bills.length,
    };
  }
}
