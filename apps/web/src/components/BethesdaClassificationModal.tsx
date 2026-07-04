'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Loader2, X } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  GENERAL_LABEL, GLANDULAR_LABEL, NON_NEOPLASTIC_OPTIONS, ORGANISM_OPTIONS, RECOMMENDATION_LABEL, SQUAMOUS_LABEL,
  deriveShortCode, generateNarrative,
  type BethesdaRecommendation, type BethesdaResult, type BethesdaSelections, type GeneralCategory,
  type GlandularCategory, type HPVResult, type SquamousCategory,
} from '@/lib/bethesda';
import { DictationButton } from './DictationButton';

interface Props {
  open: boolean;
  onClose: () => void;
  recordId: string;
  /** Push the generated narrative back into the report workflow. */
  onApply?: (narrative: string, shortCode: string | null) => void;
}

const empty: BethesdaSelections = { specimenAdequacy: 'Satisfactory', organisms: [], otherNonNeoplastic: [] };

export function BethesdaClassificationModal({ open, onClose, recordId, onApply }: Props) {
  const [s, setS] = useState<BethesdaSelections>({ ...empty });
  const [toast, setToast] = useState<string | null>(null);
  const set = <K extends keyof BethesdaSelections>(k: K, v: BethesdaSelections[K]) => setS((p) => ({ ...p, [k]: v }));
  // Append dictated text to a free-text field (functional update avoids stale reads on rapid chunks).
  const dictate = (k: 'unsatisfactoryReason' | 'glandularSubtype' | 'otherMalignancy' | 'recommendationNotes', text: string) =>
    setS((p) => { const cur = ((p[k] as string) ?? ''); return { ...p, [k]: cur && !/\s$/.test(cur) ? `${cur} ${text}` : `${cur}${text}` }; });
  const toggle = (k: 'organisms' | 'otherNonNeoplastic', v: string) =>
    setS((p) => { const arr = p[k] ?? []; return { ...p, [k]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] }; });

  const { data: existing, isLoading } = useQuery({
    queryKey: ['bethesda', recordId],
    queryFn: () => api.get<BethesdaResult | null>(`/bethesda/record/${recordId}`).then((r) => r.data),
    enabled: open && !!recordId,
  });
  useEffect(() => {
    if (!open) return;
    if (existing) setS({
      specimenAdequacy: existing.specimenAdequacy, unsatisfactoryReason: existing.unsatisfactoryReason ?? '',
      generalCategory: existing.generalCategory ?? null, organisms: existing.organisms ?? [], otherNonNeoplastic: existing.otherNonNeoplastic ?? [],
      squamousCategory: existing.squamousCategory ?? null, ascSubtype: existing.ascSubtype ?? null,
      glandularCategory: existing.glandularCategory ?? null, glandularSubtype: existing.glandularSubtype ?? '',
      otherMalignancy: existing.otherMalignancy ?? '', hpvResult: existing.hpvResult ?? null, hpvGenotype: existing.hpvGenotype ?? '',
      recommendation: existing.recommendation ?? null, recommendationNotes: existing.recommendationNotes ?? '',
    });
    else setS({ ...empty });
  }, [existing, open]);

  const narrative = useMemo(() => generateNarrative(s), [s]);
  const shortCode = useMemo(() => deriveShortCode(s), [s]);
  const sat = s.specimenAdequacy === 'Satisfactory';
  const valid = !sat || !!s.generalCategory;

  const save = useMutation({
    mutationFn: () => api.put<BethesdaResult>(`/bethesda/record/${recordId}`, {
      specimenAdequacy: s.specimenAdequacy,
      unsatisfactoryReason: s.unsatisfactoryReason || undefined,
      generalCategory: s.generalCategory || undefined,
      organisms: s.organisms, otherNonNeoplastic: s.otherNonNeoplastic,
      squamousCategory: s.squamousCategory || undefined, ascSubtype: s.ascSubtype || undefined,
      glandularCategory: s.glandularCategory || undefined, glandularSubtype: s.glandularSubtype || undefined,
      otherMalignancy: s.otherMalignancy || undefined,
      hpvResult: s.hpvResult || undefined, hpvGenotype: s.hpvGenotype || undefined,
      recommendation: s.recommendation || undefined, recommendationNotes: s.recommendationNotes || undefined,
    }).then((r) => r.data),
  });

  const doSave = async (apply: boolean) => {
    const res = await save.mutateAsync();
    if (apply && onApply) { onApply(res.generatedNarrative ?? narrative, res.shortCode); onClose(); return; }
    setToast('Classification saved'); setTimeout(() => setToast(null), 2500);
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 2000, background: 'rgba(15,23,42,0.6)' }} onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-[940px] flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 p-5 pb-4">
          <div className="flex items-center gap-3">
            <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">Bethesda Classification</h3>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">TBS 2014</span>
            {shortCode && <span className="rounded-md bg-indigo-100 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-700">{shortCode}</span>}
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-slate-100"><X size={16} /></button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Form */}
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {isLoading ? <div className="py-10 text-center font-body-sm text-body-sm text-secondary">Loading…</div> : (
              <div className="flex flex-col gap-5">
                <Field label="Specimen Adequacy" required>
                  <Pills value={s.specimenAdequacy} onChange={(v) => set('specimenAdequacy', v as any)}
                    options={[['Satisfactory', 'Satisfactory for evaluation'], ['Unsatisfactory', 'Unsatisfactory']]} />
                  {!sat && (
                    <div className="relative mt-2">
                      <input value={s.unsatisfactoryReason ?? ''} onChange={(e) => set('unsatisfactoryReason', e.target.value)} placeholder="Reason (e.g. insufficient squamous cellularity)" className={`${inp} pr-10`} />
                      <div className="absolute right-1 top-1/2 -translate-y-1/2"><DictationButton size="sm" onTranscript={(t) => dictate('unsatisfactoryReason', t)} /></div>
                    </div>
                  )}
                </Field>

                {sat && (
                  <Field label="General Categorization" required>
                    <Pills value={s.generalCategory ?? ''} onChange={(v) => set('generalCategory', (v || null) as GeneralCategory | null)}
                      options={(Object.keys(GENERAL_LABEL) as GeneralCategory[]).map((k) => [k, GENERAL_LABEL[k]])} />
                  </Field>
                )}

                {sat && s.generalCategory === 'NILM' && (
                  <>
                    <Field label="Organisms"><CheckList options={ORGANISM_OPTIONS} value={s.organisms ?? []} onToggle={(v) => toggle('organisms', v)} /></Field>
                    <Field label="Other Non-Neoplastic Findings"><CheckList options={NON_NEOPLASTIC_OPTIONS} value={s.otherNonNeoplastic ?? []} onToggle={(v) => toggle('otherNonNeoplastic', v)} /></Field>
                  </>
                )}

                {sat && s.generalCategory === 'EpithelialAbnormality' && (
                  <>
                    <Field label="Squamous Cell Abnormality">
                      <Pills value={s.squamousCategory ?? ''} onChange={(v) => set('squamousCategory', (v || null) as SquamousCategory | null)}
                        options={[['', 'None'], ...(Object.keys(SQUAMOUS_LABEL) as SquamousCategory[]).map((k) => [k, SQUAMOUS_LABEL[k]] as [string, string])]} />
                      {s.squamousCategory === 'ASC' && (
                        <div className="mt-2"><Pills value={s.ascSubtype ?? 'ASCUS'} onChange={(v) => set('ascSubtype', v as any)} options={[['ASCUS', 'ASC-US (undetermined)'], ['ASCH', 'ASC-H (cannot exclude HSIL)']]} /></div>
                      )}
                    </Field>
                    <Field label="Glandular Cell Abnormality">
                      <Pills value={s.glandularCategory ?? ''} onChange={(v) => set('glandularCategory', (v || null) as GlandularCategory | null)}
                        options={[['', 'None'], ...(Object.keys(GLANDULAR_LABEL) as GlandularCategory[]).map((k) => [k, GLANDULAR_LABEL[k]] as [string, string])]} />
                      {s.glandularCategory === 'Other' && (
                        <div className="relative mt-2">
                          <input value={s.glandularSubtype ?? ''} onChange={(e) => set('glandularSubtype', e.target.value)} placeholder="Describe glandular finding…" className={`${inp} pr-10`} />
                          <div className="absolute right-1 top-1/2 -translate-y-1/2"><DictationButton size="sm" onTranscript={(t) => dictate('glandularSubtype', t)} /></div>
                        </div>
                      )}
                    </Field>
                  </>
                )}

                {sat && s.generalCategory === 'OtherMalignancy' && (
                  <Field label="Other Malignancy">
                    <div className="relative">
                      <textarea value={s.otherMalignancy ?? ''} onChange={(e) => set('otherMalignancy', e.target.value)} rows={2} placeholder="Describe…" className={`${inp} h-auto py-2.5 pr-10`} />
                      <div className="absolute right-1 top-1.5"><DictationButton size="sm" onTranscript={(t) => dictate('otherMalignancy', t)} /></div>
                    </div>
                  </Field>
                )}

                <div className="border-t border-slate-100 pt-4">
                  <Field label="HPV Testing">
                    <Pills value={s.hpvResult ?? ''} onChange={(v) => set('hpvResult', (v || null) as HPVResult | null)}
                      options={[['', 'Not set'], ['Positive', 'Positive'], ['Negative', 'Negative'], ['NotPerformed', 'Not performed']]} />
                    {s.hpvResult === 'Positive' && <input value={s.hpvGenotype ?? ''} onChange={(e) => set('hpvGenotype', e.target.value)} placeholder="Genotype (e.g. 16, 18, other HR)" className={`${inp} mt-2`} />}
                  </Field>
                </div>

                <Field label="Recommendation">
                  <select value={s.recommendation ?? ''} onChange={(e) => set('recommendation', (e.target.value || null) as BethesdaRecommendation | null)} className={inp}>
                    <option value="">— Select —</option>
                    {(Object.keys(RECOMMENDATION_LABEL) as BethesdaRecommendation[]).map((k) => <option key={k} value={k}>{RECOMMENDATION_LABEL[k]}</option>)}
                  </select>
                  <div className="relative mt-2">
                    <input value={s.recommendationNotes ?? ''} onChange={(e) => set('recommendationNotes', e.target.value)} placeholder="Additional notes…" className={`${inp} pr-10`} />
                    <div className="absolute right-1 top-1/2 -translate-y-1/2"><DictationButton size="sm" onTranscript={(t) => dictate('recommendationNotes', t)} /></div>
                  </div>
                </Field>
              </div>
            )}
          </div>

          {/* Live narrative preview */}
          <div className="flex w-[340px] shrink-0 flex-col border-l border-slate-200 bg-surface-container-low/40">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="inline-flex items-center gap-1.5 font-label-sm text-label-sm font-semibold uppercase tracking-wider text-secondary"><FileText size={13} /> Generated Narrative</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <pre className="whitespace-pre-wrap font-body-sm text-[13px] leading-relaxed text-on-surface" style={{ fontFamily: 'inherit' }}>{narrative}</pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 p-4">
          <div className="font-label-sm text-label-sm text-secondary">{existing ? `Last reported ${new Date(existing.reportedAt).toLocaleDateString()}` : 'New classification'}</div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-secondary" disabled={!valid || save.isPending} style={{ opacity: !valid || save.isPending ? 0.5 : 1 }} onClick={() => doSave(false)}>{save.isPending ? <Loader2 size={14} className="animate-spin" /> : null} Save</button>
            {onApply && <button className="btn-primary" disabled={!valid || save.isPending} style={{ opacity: !valid || save.isPending ? 0.5 : 1 }} onClick={() => doSave(true)}>Save &amp; Apply to Report</button>}
          </div>
        </div>
      </div>

      {toast && <div className="fixed bottom-6 right-6 z-[2200] rounded-xl px-4 py-3 text-[14px] font-semibold text-white shadow-lg" style={{ background: '#16A34A' }}>{toast}</div>}
    </div>,
    document.body,
  );
}

const inp = 'h-10 w-full rounded-xl border border-outline-variant/40 bg-white px-3 font-body-sm text-body-sm text-on-surface outline-none focus:border-primary';
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block font-label-md text-label-md font-semibold text-on-surface">{label}{required && <span className="text-error"> *</span>}</label>
      {children}
    </div>
  );
}
function Pills({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`rounded-full px-3 py-1.5 font-label-sm text-label-sm font-semibold transition-colors ${value === v ? 'bg-primary text-on-primary' : 'bg-slate-100 text-secondary hover:bg-slate-200'}`}>{label}</button>
      ))}
    </div>
  );
}
function CheckList({ options, value, onToggle }: { options: string[]; value: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((o) => (
        <label key={o} className="flex cursor-pointer items-center gap-2.5">
          <input type="checkbox" checked={value.includes(o)} onChange={() => onToggle(o)} style={{ accentColor: '#4F46E5', width: 15, height: 15 }} />
          <span className="font-body-sm text-body-sm text-on-surface">{o}</span>
        </label>
      ))}
    </div>
  );
}
