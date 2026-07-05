'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CATEGORIES, type ResultTemplate, type TemplateCategory } from '@/lib/result-templates';

const blank = {
  name: '', shortCode: '', category: 'Cervical' as TemplateCategory, description: '', isActive: true,
  specimenAdequacy: '', generalCategory: '', interpretation: '', recommendation: '', additionalNotes: '',
};

export default function ResultTemplateEditPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const id = String(useParams().id);
  const isNew = id === 'new';
  const [f, setF] = useState({ ...blank });
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3200); };
  const set = (k: keyof typeof f, v: any) => setF((p) => ({ ...p, [k]: v }));

  const { data: existing } = useQuery({
    queryKey: ['result-template', id],
    queryFn: () => api.get<ResultTemplate>(`/result-templates/${id}`).then((r) => r.data),
    enabled: !isNew,
  });
  useEffect(() => {
    if (existing) setF({
      name: existing.name, shortCode: existing.shortCode ?? '', category: existing.category, description: existing.description ?? '', isActive: existing.isActive,
      specimenAdequacy: existing.specimenAdequacy ?? '', generalCategory: existing.generalCategory ?? '', interpretation: existing.interpretation ?? '',
      recommendation: existing.recommendation ?? '', additionalNotes: existing.additionalNotes ?? '',
    });
  }, [existing]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name.trim(), shortCode: f.shortCode.trim() || undefined, category: f.category, description: f.description.trim() || undefined, isActive: f.isActive,
        specimenAdequacy: f.specimenAdequacy.trim() || undefined, generalCategory: f.generalCategory.trim() || undefined,
        interpretation: f.interpretation.trim() || undefined, recommendation: f.recommendation.trim() || undefined, additionalNotes: f.additionalNotes.trim() || undefined,
      };
      return isNew ? api.post('/result-templates', body) : api.patch(`/result-templates/${id}`, body);
    },
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['result-templates'] });
      notify('ok', isNew ? 'Template created' : 'Template saved');
      if (isNew) router.replace(`/result-templates/${r.data.id}`);
    },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Save failed'),
  });

  const del = useMutation({
    mutationFn: () => api.delete(`/result-templates/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['result-templates'] }); router.push('/result-templates'); },
    onError: () => notify('err', 'Delete failed'),
  });

  const canSave = !!f.name.trim() && !save.isPending;

  return (
    <div className="min-h-full" style={{ background: '#F8FAFC' }}>
      <div className="py-8">
        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-1.5 font-body-sm text-body-sm text-secondary">
          <Link href="/result-templates" className="hover:text-primary">Result Templates</Link>
          <ChevronRight size={14} />
          <span className="text-charcoal-heading">{isNew ? 'New Template' : f.name || 'Template'}</span>
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-charcoal-heading">{isNew ? 'New Template' : 'Edit Template'}</h1>
          <div className="flex items-center gap-2">
            {!isNew && <button className="btn-secondary !text-error" onClick={() => del.mutate()} disabled={del.isPending}><Trash2 size={15} /> Delete</button>}
            <button className="btn-primary" disabled={!canSave} style={{ opacity: canSave ? 1 : 0.5 }} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save Template'}</button>
          </div>
        </div>

        <div className="mx-auto flex max-w-[860px] flex-col gap-5">
          {/* Section 1: Identity */}
          <Section title="Identity">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="md:col-span-2"><Field label="Name" required><input autoFocus value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. NILM - Normal" className={inp} /></Field></div>
              <Field label="Short Code"><input value={f.shortCode} onChange={(e) => set('shortCode', e.target.value)} placeholder="NILM" className={`${inp} font-mono uppercase`} /></Field>
              <Field label="Category">
                <select value={f.category} onChange={(e) => set('category', e.target.value)} className={inp}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <div className="md:col-span-2"><Field label="Description (internal)"><input value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="When to use this template…" className={inp} /></Field></div>
            </div>
            <label className="mt-4 flex items-center gap-2.5">
              <input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} style={{ accentColor: '#4F46E5', width: 16, height: 16 }} />
              <span className="font-body-sm text-body-sm text-on-surface">Active <span className="text-secondary">(available for selection)</span></span>
            </label>
          </Section>

          {/* Section 2: Specimen */}
          <Section title="Specimen">
            <Field label="Specimen Adequacy"><input value={f.specimenAdequacy} onChange={(e) => set('specimenAdequacy', e.target.value)} placeholder="Satisfactory for evaluation" className={inp} /></Field>
          </Section>

          {/* Section 3: Findings */}
          <Section title="Findings">
            <Field label="General Categorization"><input value={f.generalCategory} onChange={(e) => set('generalCategory', e.target.value)} placeholder="Negative for Intraepithelial Lesion or Malignancy" className={inp} /></Field>
            <div className="mt-4"><Field label="Interpretation"><textarea value={f.interpretation} onChange={(e) => set('interpretation', e.target.value)} rows={6} placeholder="Main findings text…" className={`${inp} h-auto py-2.5`} /></Field></div>
          </Section>

          {/* Section 4: Recommendation */}
          <Section title="Recommendation">
            <Field label="Recommendation"><textarea value={f.recommendation} onChange={(e) => set('recommendation', e.target.value)} rows={3} placeholder="e.g. Routine screening in 3 years." className={`${inp} h-auto py-2.5`} /></Field>
            <div className="mt-4"><Field label="Additional Notes"><textarea value={f.additionalNotes} onChange={(e) => set('additionalNotes', e.target.value)} rows={2} placeholder="Optional notes…" className={`${inp} h-auto py-2.5`} /></Field></div>
          </Section>
        </div>
      </div>

      {toast && <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 text-[14px] font-semibold text-white shadow-lg" style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>{toast.msg}</div>}
    </div>
  );
}

const inp = 'h-11 w-full rounded-xl border border-outline-variant/40 bg-white px-3.5 font-body-sm text-body-sm text-on-surface outline-none transition-colors focus:border-primary';
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="mb-4 font-headline-sm text-headline-sm text-charcoal-heading">{title}</div>
      {children}
    </div>
  );
}
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block font-label-md text-label-md text-on-surface">{label}{required && <span className="text-error"> *</span>}</label>
      {children}
    </div>
  );
}
