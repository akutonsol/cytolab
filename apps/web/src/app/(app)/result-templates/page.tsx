'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ClipboardList, Copy, Layers, Pencil, Plus, Search, TrendingUp } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CATEGORIES, composeNarrative, type ResultTemplate } from '@/lib/result-templates';
import { Button } from '@/components/ui';

export default function ResultTemplatesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [category, setCategory] = useState<'All' | string>('All');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3200); };

  const { data: templates = [] } = useQuery({
    queryKey: ['result-templates'],
    queryFn: () => api.get<ResultTemplate[]>('/result-templates').then((r) => r.data),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/result-templates/${id}`, { isActive }),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['result-templates'] }); notify('ok', v.isActive ? 'Template activated' : 'Template deactivated'); },
    onError: () => notify('err', 'Update failed'),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) =>
      (category === 'All' || t.category === category) &&
      (!q || t.name.toLowerCase().includes(q) || (t.shortCode ?? '').toLowerCase().includes(q) || (t.interpretation ?? '').toLowerCase().includes(q)));
  }, [templates, category, search]);

  const mostUsed = useMemo(() => templates.reduce<ResultTemplate | null>((m, t) => (!m || t.usageCount > m.usageCount ? t : m), null), [templates]);
  const distinctCats = useMemo(() => new Set(templates.map((t) => t.category)).size, [templates]);

  const copyTemplate = async (t: ResultTemplate) => {
    try { await navigator.clipboard.writeText(composeNarrative(t)); notify('ok', `“${t.name}” copied to clipboard`); }
    catch { notify('err', 'Copy failed'); }
  };

  return (
    <div className="min-h-full" style={{ background: '#F8FAFC' }}>
      <div className="py-8">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-charcoal-heading">Result Templates</h1>
            <p className="mt-1 font-body-sm text-body-sm text-secondary">Reusable cytology report templates that pre-fill result sheets.</p>
          </div>
          <Button onClick={() => router.push('/result-templates/new')}><Plus size={16} /> New Template</Button>
        </div>

        {/* KPI strip */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Kpi icon={ClipboardList} color="#4F46E5" label="Total Templates" value={String(templates.length)} sub="Active templates" />
          <Kpi icon={TrendingUp} color="#16A34A" label="Most Used" value={mostUsed?.shortCode ?? mostUsed?.name ?? '—'} sub={mostUsed ? `Used ${mostUsed.usageCount} time${mostUsed.usageCount === 1 ? '' : 's'}` : 'No usage yet'} />
          <Kpi icon={Layers} color="#0284C7" label="Categories" value={String(distinctCats)} sub="Distinct categories" />
        </div>

        {/* Category tabs + search */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {(['All', ...CATEGORIES] as const).map((c) => (
              <button key={c} onClick={() => setCategory(c)}
                className={`rounded-full px-3.5 py-1.5 font-label-sm text-label-sm font-semibold transition-colors ${category === c ? 'bg-primary text-on-primary' : 'bg-white text-secondary hover:bg-surface-container-low'}`}>{c}</button>
            ))}
          </div>
          <div className="relative ml-auto" style={{ minWidth: 240 }}>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates…"
              className="h-10 w-full rounded-xl border border-outline-variant/40 bg-white pl-9 pr-3 font-body-sm text-body-sm text-on-surface outline-none focus:border-primary" />
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="glass-card flex flex-col items-center justify-center gap-3 rounded-2xl py-20 text-center">
            <ClipboardList size={48} className="text-[#E2E8F0]" />
            <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">No templates found</h3>
            <p className="max-w-xs font-body-sm text-body-sm text-secondary">Try a different category or search, or create a new template.</p>
            <Button className="mt-1" onClick={() => router.push('/result-templates/new')}><Plus size={16} /> New Template</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((t) => (
              <div key={t.id} className="glass-card flex flex-col rounded-2xl p-6 transition-shadow hover:shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {t.shortCode && <span className="rounded-md bg-indigo-100 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-700">{t.shortCode}</span>}
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{t.category}</span>
                  </div>
                  <label className="flex cursor-pointer items-center gap-1.5" title={t.isActive ? 'Active' : 'Inactive'}>
                    <input type="checkbox" checked={t.isActive} onChange={(e) => toggleActive.mutate({ id: t.id, isActive: e.target.checked })} style={{ accentColor: '#4F46E5', width: 15, height: 15 }} />
                  </label>
                </div>

                <Link href={`/result-templates/${t.id}`} className="mt-3 font-headline-sm text-headline-sm font-semibold text-charcoal-heading hover:text-primary">{t.name}</Link>
                <p className="mt-2 line-clamp-2 flex-1 font-body-sm text-body-sm text-secondary">{t.interpretation ?? t.description ?? 'No interpretation set.'}</p>

                <div className="mt-4 flex items-center justify-between border-t border-[#F1F0EA] pt-4">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-1 font-label-sm text-label-sm text-secondary">
                      {t.usageCount > 10 && <TrendingUp size={13} className="text-status-sage" />} Used {t.usageCount} time{t.usageCount === 1 ? '' : 's'}
                    </div>
                    <div className="truncate font-label-sm text-label-sm text-secondary">{t.createdBy ? `${t.createdBy.firstName} ${t.createdBy.lastName}` : 'System'}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button onClick={() => router.push(`/result-templates/${t.id}`)} title="Edit" className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-surface-container-low hover:text-primary"><Pencil size={15} /></button>
                    <Button onClick={() => copyTemplate(t)} className="!h-8 !px-3 !text-[13px]"><Copy size={13} /> Use</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 text-[14px] font-semibold text-white shadow-lg" style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>{toast.msg}</div>}
    </div>
  );
}

function Kpi({ icon: Icon, color, label, value, sub }: { icon: any; color: string; label: string; value: string; sub: string }) {
  return (
    <div className="glass-card flex items-center gap-3.5 rounded-2xl p-6">
      <span style={{ background: `${color}15`, color }} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"><Icon size={20} /></span>
      <div className="min-w-0">
        <div className="truncate font-display text-[26px] font-bold leading-none text-[#0F172A]">{value}</div>
        <div className="mt-1 font-label-sm text-label-sm uppercase tracking-wider text-secondary">{label}</div>
        <div className="font-body-sm text-body-sm text-secondary">{sub}</div>
      </div>
    </div>
  );
}
