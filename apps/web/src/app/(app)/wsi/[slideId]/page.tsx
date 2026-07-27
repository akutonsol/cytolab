'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ClipboardCheck, Columns2, MapPin, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';
import { WSIViewer } from '@/components/WSIViewer';
import { SlideTray } from '@/components/wsi/SlideTray';
import { CompareViewer } from '@/components/wsi/CompareViewer';
import { RelatedResources } from '@/components/wsi/RelatedResources';
import { SlideReviewDrawer } from '@/components/wsi/SlideReviewDrawer';
import { shortDate, type DigitalSlide } from '@/lib/wsi';
import { useAuth } from '@/lib/auth';
import { notify } from '@/lib/notify';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-[13px]">
      <span className="text-[#475569]">{label}</span>
      <span className="font-semibold text-[#E2E8F0]">{value}</span>
    </div>
  );
}

export default function SlideViewerPage() {
  const { slideId } = useParams<{ slideId: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const qc = useQueryClient();
  const { isEnabled } = useFeatures();
  const { can } = useAuth();
  const canEdit = can('record:change');
  const canReview = can('wsi:review');
  const [addSignal, setAddSignal] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);

  // P5-6: the ACTIVE slide (initialised from the route). Switching keys the viewer, its delivery session,
  // annotations, and review off this id — each slide remains individually authoritative.
  const [activeId, setActiveId] = useState(slideId);
  // P5-6 Part B: when set, the main area shows the active slide side-by-side with this compare slide.
  const [compareId, setCompareId] = useState<string | null>(null);

  const { data: slide, isLoading } = useQuery<DigitalSlide>({
    queryKey: ['wsi-slide', activeId],
    queryFn: () => api.get(`/wsi/${activeId}`).then((r) => r.data),
    enabled: isEnabled('WSI_VIEWER'),
  });

  // P5-6: record-scoped orchestration set via the P5-5 discovery API. Metadata only (no image bytes).
  const recordId = slide?.recordId;
  const { data: setResult } = useQuery<Paginated<DigitalSlide>>({
    queryKey: ['wsi-set', recordId],
    queryFn: () => api.get('/wsi', { params: { recordId, pageSize: 200, sort: 'oldest' } }).then((r) => r.data),
    enabled: isEnabled('WSI_VIEWER') && !!recordId,
  });
  const slides = setResult?.data ?? [];

  function selectActive(id: string) {
    if (id === activeId) return;
    setActiveId(id);
    router.replace(`/wsi/${id}`); // keep the URL deep-linkable; local state remains the source of truth
  }

  // Deep-link ?annotate=1 → enter add mode once loaded.
  useEffect(() => { if (slide && canEdit && search.get('annotate')) setAddSignal((s) => s + 1); }, [slide, canEdit, search]);

  const addAnn = useMutation({
    mutationFn: (v: { x: number; y: number; color: string }) => api.post(`/wsi/${activeId}/annotations`, { x: v.x, y: v.y, color: v.color, label: `Annotation ${(slide?.annotations.length ?? 0) + 1}` }).then((r) => r.data),
    onSuccess: () => { notify.success('Annotation added'); qc.invalidateQueries({ queryKey: ['wsi-slide', activeId] }); qc.invalidateQueries({ queryKey: ['wsi-summary'] }); },
    onError: () => notify.error('Could not add annotation'),
  });
  const delAnn = useMutation({
    mutationFn: (id: string) => api.delete(`/wsi/annotations/${id}`),
    onSuccess: () => { notify.success('Annotation removed'); qc.invalidateQueries({ queryKey: ['wsi-slide', activeId] }); qc.invalidateQueries({ queryKey: ['wsi-summary'] }); },
    onError: () => notify.error('Could not remove annotation'),
  });

  if (!isEnabled('WSI_VIEWER')) {
    return <div className="grid h-screen place-items-center bg-[#0F172A] text-slate-300">Whole Slide Imaging is disabled for this lab.</div>;
  }

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col bg-black">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 py-2.5">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-slate-200 hover:bg-white/10">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="ml-1">
          <div className="text-[14px] font-bold text-white">{slide ? slide.patientName : 'Loading…'}</div>
          <div className="text-[12px] text-slate-500">{slide ? `${slide.labNo}${slide.record?.formType ? ` · ${slide.record.formType}` : ''}` : ''}</div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {/* P5-6 Part B: enter side-by-side compare with another slide FROM THIS RECORD only. */}
          {slides.length > 1 && !compareId && (
            <button
              data-testid="wsi-compare-enter"
              onClick={() => { const other = slides.find((s) => s.id !== activeId); if (other) setCompareId(other.id); }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-slate-200 hover:bg-white/10"
            >
              <Columns2 size={16} /> Compare
            </button>
          )}
          {canReview && (
            <button onClick={() => setReviewOpen(true)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-slate-200 hover:bg-white/10">
              <ClipboardCheck size={16} /> Clinical Review
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left sidebar (active slide) */}
        <aside className="flex w-[240px] shrink-0 flex-col border-r border-slate-800 bg-slate-900 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Slide Info</div>
          <div className="mt-1">
            <InfoRow label="Stain" value={slide?.stain ?? '—'} />
            <InfoRow label="Magnification" value={slide?.magnification ?? '—'} />
            <InfoRow label="Scanner" value={slide?.scanner ?? '—'} />
            <InfoRow label="Format" value={(slide?.tileSourceType ?? slide?.format ?? '—').toUpperCase()} />
            <InfoRow label="Uploaded" value={slide ? shortDate(slide.uploadedAt) : '—'} />
          </div>

          <div className="mt-5 flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Annotations ({slide?.annotations.length ?? 0})</div>
            {canEdit && (
              <button onClick={() => setAddSignal((s) => s + 1)} className="flex items-center gap-1 rounded-lg bg-[#4F46E5] px-2 py-1 text-[12px] font-semibold text-white">
                <Plus size={13} /> Add
              </button>
            )}
          </div>
          <div className="mt-2 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
            {(slide?.annotations ?? []).length === 0 ? (
              <div className="py-3 text-[12px] text-slate-500">No annotations yet.</div>
            ) : (slide?.annotations ?? []).map((a) => (
              <div key={a.id} className="group flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-2">
                <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/20" style={{ background: a.color }} />
                <MapPin size={12} className="shrink-0 text-slate-500" />
                <span className="flex-1 truncate text-[12px] text-slate-200">{a.label}</span>
                {canEdit && (
                  <button onClick={() => delAnn.mutate(a.id)} className="shrink-0 text-slate-500 opacity-0 transition-opacity hover:text-[#F87171] group-hover:opacity-100"><Trash2 size={13} /></button>
                )}
              </div>
            ))}
          </div>

          {/* P5-8 — contextual asset-graph navigation (record ↔ specimen ↔ slide, sibling + generation summary) */}
          <RelatedResources slideId={activeId} />

          {slide?.record && (
            <button onClick={() => router.push(`/records/${slide.record!.id}`)} className="mt-3 rounded-lg border border-slate-700 px-3 py-2 text-[12px] font-semibold text-slate-300 hover:bg-white/5">
              Open record →
            </button>
          )}
        </aside>

        {/* Main viewing area — single active slide, or side-by-side compare (Part B) */}
        <main className="min-w-0 flex-1">
          {compareId ? (
            <CompareViewer
              primaryId={activeId}
              compareId={compareId}
              slides={slides}
              onChangePrimary={selectActive}
              onChangeCompare={setCompareId}
              onExit={() => setCompareId(null)}
            />
          ) : isLoading || !slide ? (
            <div className="grid h-full place-items-center bg-black text-slate-500">Loading slide…</div>
          ) : (
            <WSIViewer
              slideId={activeId}
              annotations={slide.annotations}
              readOnly={!canEdit}
              enterAddSignal={addSignal}
              onAddAnnotation={(x, y, color) => addAnn.mutate({ x, y, color })}
            />
          )}
        </main>
      </div>

      {/* P5-6 Part A — case-aware slide tray (record-scoped orchestration set). Hidden in compare mode. */}
      {slides.length > 1 && !compareId && <SlideTray slides={slides} activeId={activeId} onSelect={selectActive} />}

      {canReview && (
        <SlideReviewDrawer
          slideId={activeId}
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          patientName={slide?.patientName}
        />
      )}
    </div>
  );
}
