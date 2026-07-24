'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { Badge, Button, Drawer, EmptyState, SkeletonText } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { notify, errorMessage } from '@/lib/notify';
import { shortDate } from '@/lib/wsi';
import type { GenerationReviewRow, PublishResponse, SlideReviewSummary } from '@/lib/wsi-review';
import { GenerationStatusBadge } from './GenerationStatusBadge';
import { GenerationEvidence } from './GenerationEvidence';
import { PublicationHistory } from './PublicationHistory';
import { PublishConfirm } from './PublishConfirm';

/**
 * P5-6.4 — the clinical review surface for one slide, over the FROZEN 6.1–6.3 APIs. Lists the slide's
 * generations with QC status, opens per-generation evidence, shows the publication timeline, and drives the
 * deliberate publish action. Authorization is server-authoritative: `can('wsi:publish')` only decides whether
 * the affordance is enabled/explained — the API enforces (a forced call is rejected 403). If the slide's
 * publication state is DIVERGENT, publishing is locked out across the whole surface (UX safety guard).
 */
export function SlideReviewDrawer({
  slideId,
  open,
  onOpenChange,
  patientName,
}: {
  slideId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientName?: string;
}) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canPublish = can('wsi:publish');

  const [evidenceGen, setEvidenceGen] = useState<string | null>(null);
  const [confirmGen, setConfirmGen] = useState<GenerationReviewRow | null>(null);

  const { data: review, isLoading, isError, refetch } = useQuery<SlideReviewSummary>({
    queryKey: ['wsi-review', slideId],
    queryFn: () => api.get(`/wsi/slides/${slideId}/review`).then((r) => r.data),
    enabled: open,
  });

  const divergent = review?.publicationIntegrity === 'DIVERGENT';
  const publishBlockedReason = divergent
    ? 'Publication state is inconsistent — publishing is unavailable.'
    : !canPublish
      ? 'You do not have permission to publish (wsi:publish).'
      : null;

  const publishMut = useMutation({
    mutationFn: (vars: { generationId: string }) =>
      api.post(`/wsi/slides/${slideId}/generations/${vars.generationId}/publish`).then((r) => r.data as PublishResponse),
    onSuccess: async (data, vars) => {
      // Refinement 2 — invalidate every surface whose lifecycle metadata the publication changed, including
      // both the target and (on replacement) the superseded generation's evidence.
      const keys: unknown[][] = [
        ['wsi-review', slideId],
        ['wsi-publications', slideId],
        ['wsi-slide', slideId],
        ['wsi-generation-evidence', slideId, vars.generationId],
      ];
      if (data.outcome === 'PUBLISHED' && data.supersededGenerationId) {
        keys.push(['wsi-generation-evidence', slideId, data.supersededGenerationId]);
      }
      await Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));

      if (data.outcome === 'ALREADY_PUBLISHED') notify.info('This generation is already the published one.');
      else notify.success('Generation published.');
      setConfirmGen(null);
    },
    onError: async (e: unknown) => {
      // Refinement — on a 409 the generation's status changed since the drawer loaded; refetch the
      // authoritative review state before showing the message so the list reflects reality.
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 409) await qc.invalidateQueries({ queryKey: ['wsi-review', slideId] });
      notify.error(errorMessage(e));
      setConfirmGen(null);
    },
  });

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        width="xl"
        title="Clinical review"
        description={patientName}
      >
        {isLoading ? (
          <SkeletonText lines={8} />
        ) : isError ? (
          <EmptyState
            icon={<AlertTriangle size={28} />}
            tone="danger"
            announcement="status"
            title="Could not load review"
            description="The request failed. Please retry."
            action={<Button variant="secondary" onClick={() => refetch()}>Retry</Button>}
          />
        ) : review ? (
          <div className="space-y-6">
            {/* Slide publication header */}
            <section className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
              <span className="text-text-secondary">Availability</span>
              <Badge tone={review.availabilityStatus === 'PUBLISHED' ? 'success' : 'neutral'} size="sm">
                {review.availabilityStatus ?? '—'}
              </Badge>
              <span className="text-text-secondary">Published generation</span>
              <span className="font-mono text-[12px] text-text">{review.currentPublishedGenerationId ?? 'None'}</span>
            </section>

            {divergent && (
              <div role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                <span>Publication state is inconsistent. Publishing is unavailable until the slide state is reviewed.</span>
              </div>
            )}

            {/* Generations */}
            <section>
              <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-text-secondary">
                Generations{review.generationsTruncated ? ' (latest shown)' : ''}
              </h3>
              {review.generations.length === 0 ? (
                <EmptyState bare title="No generations yet" description="This slide has no derivative generations to review." />
              ) : (
                <ul className="space-y-2">
                  {review.generations.map((g) => (
                    <li key={g.generationId} className="rounded-lg border border-card p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <GenerationStatusBadge status={g.status} />
                          {g.isCurrentPublished && <Badge tone="primary" size="xs" dot>Live</Badge>}
                        </div>
                        <span className="truncate font-mono text-[11px] text-text-secondary">{g.generationId}</span>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2 text-[12px] text-text-secondary">
                        <span>{g.verifiedAt ? `Verified ${shortDate(g.verifiedAt)}` : `Created ${shortDate(g.createdAt)}`}</span>
                        {g.latestVerification && (
                          <span className={g.latestVerification.outcome === 'FAILED' ? 'font-semibold text-danger' : ''}>
                            QC {g.latestVerification.outcome === 'FAILED' ? `Failed (${g.latestVerification.reasonCount})` : 'Passed'}
                          </span>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setEvidenceGen(g.generationId)}>
                          Evidence
                        </Button>
                        {g.status === 'READY' && (
                          <>
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={!!publishBlockedReason}
                              title={publishBlockedReason ?? undefined}
                              onClick={() => setConfirmGen(g)}
                            >
                              Publish
                            </Button>
                            {publishBlockedReason && (
                              <span className="text-[11px] text-text-secondary">{publishBlockedReason}</span>
                            )}
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Publication history */}
            <section>
              <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-text-secondary">Publication history</h3>
              <PublicationHistory slideId={slideId} enabled={open} />
            </section>
          </div>
        ) : null}
      </Drawer>

      {/* Stacked evidence drawer */}
      <GenerationEvidence slideId={slideId} generationId={evidenceGen} onClose={() => setEvidenceGen(null)} />

      {/* Deliberate publish confirmation */}
      <PublishConfirm
        open={confirmGen != null}
        generationId={confirmGen?.generationId ?? null}
        currentLiveGenerationId={review?.currentPublishedGenerationId ?? null}
        loading={publishMut.isPending}
        onConfirm={() => confirmGen && publishMut.mutate({ generationId: confirmGen.generationId })}
        onCancel={() => setConfirmGen(null)}
      />
    </>
  );
}
