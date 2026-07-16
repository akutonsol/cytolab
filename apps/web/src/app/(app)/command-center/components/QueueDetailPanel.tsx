'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, Inbox, Lock } from 'lucide-react';
import { Button, EmptyState, SkeletonRows, Td, Th, Tr } from '@/components/ui';
import { getEnterpriseQueueDetail } from '../enterprise-api';

const PAGE_SIZE = 50; // matches the E2 default; owner enforces the max (100)

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

/**
 * Detail panel — GET /enterprise/queues/:queue for the selected queue. Renders
 * ONLY the allowlisted row fields; owner pagination/ordering are used verbatim
 * (no local sort/filter/paginate/recount). Row click navigates via ownerPath
 * only. The five section states render distinctly; error/forbidden/deferred are
 * never shown as empty. Independent loading boundary.
 */
export function QueueDetailPanel({ queue }: { queue: string | null }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1); // reset to page 1 when the selected queue changes
  }, [queue]);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['enterprise-queue', queue, page],
    queryFn: () => getEnterpriseQueueDetail(queue as string, page, PAGE_SIZE),
    enabled: !!queue,
  });

  if (!queue) {
    return <EmptyState icon={<Inbox size={28} />} title="Select a queue" description="Choose a queue from the rail to view its records." />;
  }
  if (isLoading) {
    return <SkeletonRows rows={8} columns={9} />;
  }
  if (isError || !data) {
    return (
      <EmptyState
        tone="danger"
        icon={<AlertTriangle size={28} />}
        title="This queue could not be loaded."
        action={<Button variant="secondary" size="sm" onClick={() => refetch()}>Retry</Button>}
      />
    );
  }

  const section = data.section;
  if (section.status === 'forbidden') {
    return <EmptyState icon={<Lock size={28} />} title="Restricted" description="You do not have access to this queue." />;
  }
  if (section.status === 'error') {
    return (
      <EmptyState
        tone="danger"
        icon={<AlertTriangle size={28} />}
        title="This queue could not be loaded."
        description={section.reason}
        action={<Button variant="secondary" size="sm" onClick={() => refetch()}>Retry</Button>}
      />
    );
  }
  if (section.status === 'deferred') {
    return <EmptyState icon={<Clock size={28} />} title="Not available" description={section.reason ?? 'This queue is deferred.'} />;
  }
  if (section.status === 'empty' || !section.data || section.data.items.length === 0) {
    return <EmptyState icon={<Inbox size={28} />} title="No records" description="This queue has no records." />;
  }

  const d = section.data;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <Th>Patient</Th>
              <Th>Identifier</Th>
              <Th>Lab #</Th>
              <Th>Form</Th>
              <Th>Status</Th>
              <Th>Urgent</Th>
              <Th>Assigned</Th>
              <Th>Created</Th>
              <Th>Status changed</Th>
            </tr>
          </thead>
          <tbody>
            {d.items.map((r, i) => (
              <Tr key={r.id} interactive index={i} onClick={() => router.push(r.ownerPath)}>
                <Td>{r.patientDisplayName ?? '—'}</Td>
                <Td>{r.identifier ?? '—'}</Td>
                <Td>{r.labNumber ?? '—'}</Td>
                <Td>{r.formType ?? '—'}</Td>
                <Td>{r.status}</Td>
                <Td>{r.urgent ? 'Urgent' : '—'}</Td>
                <Td>{r.assignedToName ?? '—'}</Td>
                <Td>{fmtDate(r.createdAt)}</Td>
                <Td>{fmtDate(r.statusChangedAt)}</Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
        <span className="tabular-nums">
          {d.total} record{d.total === 1 ? '' : 's'} · page {d.page}/{d.totalPages}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={d.page <= 1 || isFetching} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Prev
          </Button>
          <Button variant="secondary" size="sm" disabled={d.page >= d.totalPages || isFetching} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
