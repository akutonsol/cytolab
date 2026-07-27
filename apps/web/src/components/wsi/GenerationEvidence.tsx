'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { Drawer, EmptyState, SkeletonText } from '@/components/ui';
import { api } from '@/lib/api';
import { formatBytes, shortDate } from '@/lib/wsi';
import type { GenerationEvidence as Evidence } from '@/lib/wsi-review';
import { GenerationStatusBadge } from './GenerationStatusBadge';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-[13px]">
      <span className="shrink-0 text-text-secondary">{label}</span>
      <span className="min-w-0 break-words text-right font-medium text-text">{value}</span>
    </div>
  );
}

/**
 * Stacked evidence drawer: the full QC/verification picture for ONE generation. Metadata only — verification
 * reasons, checksums, timestamps, asset roles/sizes/purge state, publication events. It NEVER exposes a
 * storage key, raw artifact URL, or any pixel/delivery path (P5-6b owns candidate visual review).
 */
export function GenerationEvidence({
  slideId,
  generationId,
  onClose,
}: {
  slideId: string;
  generationId: string | null;
  onClose: () => void;
}) {
  const open = generationId != null;
  const { data, isLoading, isError, refetch } = useQuery<Evidence>({
    queryKey: ['wsi-generation-evidence', slideId, generationId],
    queryFn: () => api.get(`/wsi/slides/${slideId}/generations/${generationId}/evidence`).then((r) => r.data),
    enabled: open,
  });

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      width="lg"
      title="Generation evidence"
      description={generationId ? <span className="font-mono text-xs">{generationId}</span> : undefined}
    >
      {isLoading ? (
        <SkeletonText lines={8} />
      ) : isError ? (
        <EmptyState
          icon={<AlertTriangle size={28} />}
          tone="danger"
          announcement="status"
          title="Could not load evidence"
          description="The request failed. Please retry."
          action={<button className="btn-secondary" onClick={() => refetch()}>Retry</button>}
        />
      ) : data ? (
        <div className="space-y-6">
          <section>
            <div className="mb-2 flex items-center gap-2">
              <GenerationStatusBadge status={data.status} />
              {data.sealed && <span className="text-[12px] text-text-secondary">sealed</span>}
              {data.verified && <span className="text-[12px] text-text-secondary">verified</span>}
            </div>
            <Row label="Created" value={shortDate(data.createdAt)} />
            <Row label="Sealed" value={data.sealedAt ? shortDate(data.sealedAt) : '—'} />
            <Row label="Verified" value={data.verifiedAt ? shortDate(data.verifiedAt) : '—'} />
            <Row label="Published" value={data.publishedAt ? shortDate(data.publishedAt) : '—'} />
            <Row label="Superseded" value={data.supersededAt ? shortDate(data.supersededAt) : '—'} />
            <Row label="Tiling" value={`${data.tileSourceType}${data.levelCount != null ? ` · ${data.levelCount} levels` : ''}`} />
            <Row label="Dimensions" value={data.tiledWidth && data.tiledHeight ? `${data.tiledWidth}×${data.tiledHeight}` : '—'} />
            <Row label="Manifest checksum" value={data.derivativeManifestChecksum ? <span className="font-mono text-[11px]">{data.derivativeManifestChecksum}</span> : '—'} />
          </section>

          <section>
            <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-text-secondary">
              Verification history{data.verificationsTruncated ? ' (latest shown)' : ''}
            </h3>
            {data.verifications.length === 0 ? (
              <p className="text-[13px] text-text-secondary">No verification records yet.</p>
            ) : (
              <ul className="space-y-3">
                {data.verifications.map((v) => (
                  <li key={v.verificationId} className="rounded-lg border border-card p-3">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className={`font-semibold ${v.outcome === 'FAILED' ? 'text-danger' : 'text-success'}`}>
                        {v.outcome === 'FAILED' ? 'Failed' : 'Passed'}
                      </span>
                      <span className="text-text-secondary">{shortDate(v.verifiedAt)}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-text-secondary">verifier {v.verifierVersion}</div>
                    {v.reasons.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {v.reasons.map((r, i) => (
                          <li key={i} className="text-[12px]">
                            <span className="font-mono font-semibold text-danger">{r.code}</span>
                            <span className="text-text-secondary"> — {r.detail}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* P5-8 — source lineage: ingestion → processing job → this generation (completes the chain). */}
          {(data.source?.ingestion || data.source?.job) && (
            <section data-testid="gen-source">
              <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-text-secondary">Source lineage</h3>
              <ul className="space-y-1.5">
                {data.source.ingestion && (
                  <li data-testid="gen-source-ingestion" data-ingestion-id={data.source.ingestion.id} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="font-medium text-text">Ingestion · {data.source.ingestion.sourceKind}</span>
                    <span className="text-text-secondary">{data.source.ingestion.status}{data.source.ingestion.originalFilename ? ` · ${data.source.ingestion.originalFilename}` : ''}</span>
                  </li>
                )}
                {data.source.job && (
                  <li data-testid="gen-source-job" data-job-id={data.source.job.id} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="font-medium text-text">Processing job · attempt {data.source.job.attempt}</span>
                    <span className="text-text-secondary">{data.source.job.status}{data.source.job.errorCode ? ` · ${data.source.job.errorCode}` : ''}</span>
                  </li>
                )}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-text-secondary">Assets</h3>
            {data.assets.length === 0 ? (
              <p className="text-[13px] text-text-secondary">No assets recorded.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.assets.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="font-medium text-text">{a.role}</span>
                    <span className="text-text-secondary">
                      {formatBytes(a.sizeBytes)}
                      {a.purgedAt ? ' · purged' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.publicationEvents.length > 0 && (
            <section>
              <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-text-secondary">Publication events</h3>
              <ul className="space-y-1.5">
                {data.publicationEvents.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="font-medium text-text">{p.action === 'PUBLISHED' ? 'Published' : 'Superseded'}</span>
                    <span className="text-text-secondary">{shortDate(p.at)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : null}
    </Drawer>
  );
}
