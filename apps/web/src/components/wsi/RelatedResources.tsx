'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Layers, User, FlaskConical, FileText } from 'lucide-react';
import { api } from '@/lib/api';

/**
 * P5-8 — contextual asset-graph navigation for the active slide. Reads the bounded neighbourhood
 * (`GET /wsi/slides/:id/graph`, record:view tier) and offers deep-links along the PERSISTED edges:
 * slide → case/record, slide → patient, slide → specimen (or explicit unassigned), plus sibling count and
 * a NON-INTERNAL generation summary. It never issues pixels and never exposes generation/asset internals.
 */
export interface SlideGraph {
  node: 'slide';
  slide: { id: string; lifecycle: { state: string; viewable: boolean }; annotationCount: number };
  record: { id: string; labNo: string; formType: string | null } | null;
  patient: { id: string; name: string } | null;
  specimen: { id: string; type: string; label: string | null } | null;
  unassignedSpecimen: boolean;
  siblingSlideCount: number;
  generationSummary: { total: number; hasPublished: boolean };
  links: { record: string | null; recordSlides: string; specimenSlides: string | null; viewer: string };
}

export function RelatedResources({ slideId }: { slideId: string }) {
  const router = useRouter();
  const { data: g } = useQuery<SlideGraph>({
    queryKey: ['wsi-graph', slideId],
    queryFn: () => api.get(`/wsi/slides/${slideId}/graph`).then((r) => r.data),
  });
  if (!g) return null;

  const row = 'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-slate-200 hover:bg-white/5';
  return (
    <div data-testid="wsi-related" data-record-id={g.record?.id ?? ''} data-specimen-id={g.specimen?.id ?? ''} data-unassigned={String(g.unassignedSpecimen)} className="mt-4 border-t border-slate-800 pt-3">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Related</div>

      {g.record && (
        <button data-testid="wsi-related-record" onClick={() => router.push(g.links.record!)} className={row}>
          <FileText size={13} className="shrink-0 text-slate-500" />
          <span className="flex-1 truncate">Case {g.record.labNo}</span>
          <span className="text-slate-500">{g.siblingSlideCount} slide{g.siblingSlideCount === 1 ? '' : 's'}</span>
        </button>
      )}
      {g.patient && (
        <button data-testid="wsi-related-patient" onClick={() => router.push(`/patients/${g.patient!.id}`)} className={row}>
          <User size={13} className="shrink-0 text-slate-500" />
          <span className="flex-1 truncate">{g.patient.name}</span>
        </button>
      )}
      {g.specimen ? (
        <button data-testid="wsi-related-specimen" data-specimen-id={g.specimen.id} onClick={() => g.links.specimenSlides && router.push(g.links.specimenSlides)} className={row}>
          <FlaskConical size={13} className="shrink-0 text-slate-500" />
          <span className="flex-1 truncate">{g.specimen.label?.trim() || g.specimen.type}</span>
          <span className="text-slate-500">slides</span>
        </button>
      ) : (
        <div data-testid="wsi-related-unassigned" className={row}>
          <FlaskConical size={13} className="shrink-0 text-slate-600" />
          <span className="flex-1 truncate text-slate-500">Unassigned (record-level)</span>
        </div>
      )}
      <div data-testid="wsi-related-gens" data-has-published={String(g.generationSummary.hasPublished)} className={row}>
        <Layers size={13} className="shrink-0 text-slate-500" />
        <span className="flex-1 truncate text-slate-400">{g.generationSummary.total} generation{g.generationSummary.total === 1 ? '' : 's'}{g.generationSummary.hasPublished ? ' · published' : ''}</span>
      </div>
    </div>
  );
}
