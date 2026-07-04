'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Search, X } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CATEGORIES, type ResultTemplate } from '@/lib/result-templates';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (template: ResultTemplate) => void;
}

/** Modal for picking a result template from within the result-sheet entry flow. */
export function ResultTemplateSelector({ open, onClose, onSelect }: Props) {
  const [category, setCategory] = useState<'All' | string>('All');
  const [search, setSearch] = useState('');

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['result-templates'],
    queryFn: () => api.get<ResultTemplate[]>('/result-templates').then((r) => r.data),
    enabled: open,
  });

  const use = useMutation({
    mutationFn: (id: string) => api.post<ResultTemplate>(`/result-templates/${id}/use`).then((r) => r.data),
    onSuccess: (t) => { onSelect(t); onClose(); },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) =>
      (category === 'All' || t.category === category) &&
      (!q || t.name.toLowerCase().includes(q) || (t.shortCode ?? '').toLowerCase().includes(q) || (t.interpretation ?? '').toLowerCase().includes(q)));
  }, [templates, category, search]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 2000, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-[760px] flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 p-5 pb-4">
          <div>
            <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">Choose a Result Template</h3>
            <p className="mt-0.5 font-body-sm text-body-sm text-secondary">Applying a template pre-fills the report narrative — review before signing.</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-slate-100"><X size={16} /></button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-3">
          <div className="flex flex-wrap gap-1.5">
            {(['All', ...CATEGORIES] as const).map((c) => (
              <button key={c} onClick={() => setCategory(c)}
                className={`rounded-full px-3 py-1 font-label-sm text-label-sm font-semibold transition-colors ${category === c ? 'bg-primary text-on-primary' : 'bg-slate-100 text-secondary hover:bg-slate-200'}`}>{c}</button>
            ))}
          </div>
          <div className="relative ml-auto" style={{ minWidth: 200 }}>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
              className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 font-body-sm text-body-sm text-on-surface outline-none focus:border-primary" />
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 gap-3 overflow-y-auto p-5 pt-2 sm:grid-cols-2">
          {isLoading ? (
            <div className="col-span-2 py-10 text-center font-body-sm text-body-sm text-secondary">Loading templates…</div>
          ) : filtered.length === 0 ? (
            <div className="col-span-2 py-10 text-center font-body-sm text-body-sm text-secondary">No templates match.</div>
          ) : filtered.map((t) => (
            <button key={t.id} onClick={() => !use.isPending && use.mutate(t.id)} disabled={use.isPending}
              className="flex flex-col rounded-xl border border-slate-200 p-4 text-left transition-all hover:border-primary/40 hover:shadow-sm disabled:opacity-60">
              <div className="flex items-center gap-2">
                {t.shortCode && <span className="rounded-md bg-indigo-100 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-700">{t.shortCode}</span>}
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{t.category}</span>
                {use.isPending && use.variables === t.id && <Loader2 size={14} className="ml-auto animate-spin text-primary" />}
              </div>
              <div className="mt-2 font-body-sm text-body-sm font-semibold text-charcoal-heading">{t.name}</div>
              <div className="mt-1 line-clamp-2 font-label-sm text-label-sm text-secondary">{t.interpretation ?? t.description ?? ''}</div>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
