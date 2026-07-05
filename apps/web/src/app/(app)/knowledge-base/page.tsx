'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Book, ChevronRight, Clock, FileText, Loader2, Pin, Search } from 'lucide-react';
import { KbSearchResult, listArticles, listCategories, searchKb } from '@/lib/knowledge-base';
import { useAuth } from '@/lib/auth';

const CARD = 'rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)]';

export default function KnowledgeBaseHome() {
  const router = useRouter();
  const { can } = useAuth();
  const canManage = can('kb:manage');

  // ── Debounced live search ──
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  const { data: search, isFetching: searching } = useQuery({
    queryKey: ['kb-search', debounced],
    queryFn: () => searchKb(debounced),
    enabled: debounced.length >= 2,
  });

  const { data: categories } = useQuery({ queryKey: ['kb-categories'], queryFn: listCategories });
  const { data: pinned } = useQuery({ queryKey: ['kb-pinned'], queryFn: () => listArticles({ isPinned: true }) });
  const { data: recent } = useQuery({ queryKey: ['kb-recent'], queryFn: () => listArticles({ status: 'PUBLISHED' }) });

  const recentFive = useMemo(() => (recent ?? []).slice(0, 5), [recent]);
  const showResults = debounced.length >= 2;

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-[26px] font-bold tracking-tight text-[#0F172A]">
            <Book size={24} className="text-[#4F46E5]" /> Knowledge Base
          </h1>
          <p className="mt-1.5 text-[15px] text-[#6B7280]">Guides, references and answers for the whole lab.</p>
        </div>
        {canManage && (
          <button onClick={() => router.push('/knowledge-base/articles/new')}
            className="flex h-10 items-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-[14px] font-semibold text-white hover:bg-[#4338CA]">
            <FileText size={15} /> New Article
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mx-auto mb-8 max-w-3xl">
        <Search size={20} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[#475569]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search knowledge base..."
          className="h-14 w-full rounded-full border border-[#E2E8F0] bg-white pl-14 pr-14 text-[16px] text-[#0F172A] shadow-[0_4px_24px_rgba(0,0,0,0.04)] outline-none focus:border-[#4F46E5]"
        />
        {searching && <Loader2 size={18} className="absolute right-5 top-1/2 -translate-y-1/2 animate-spin text-[#4F46E5]" />}

        {showResults && (
          <div className={`${CARD} absolute z-20 mt-2 max-h-[420px] w-full overflow-y-auto p-2`}>
            {!search?.results.length ? (
              <div className="px-4 py-6 text-center text-[14px] text-[#475569]">
                {searching ? 'Searching…' : `No results for "${debounced}"`}
              </div>
            ) : (
              search.results.map((r: KbSearchResult) => (
                <button key={r.id} onClick={() => router.push(`/knowledge-base/articles/${r.slug}`)}
                  className="block w-full rounded-lg px-4 py-3 text-left transition-colors hover:bg-[#F5F7FF]">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-[#0F172A]">{r.title}</span>
                    {r.category && <span className="rounded-md bg-[#EEF3FF] px-1.5 py-0.5 text-[11px] font-medium text-[#4F46E5]">{r.category.name}</span>}
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-[13px] text-[#475569]">{r.excerpt}</div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Category grid */}
      <h2 className="mb-3 text-[15px] font-semibold uppercase tracking-wide text-[#475569]">Browse by category</h2>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {!categories?.length ? (
          <div className={`${CARD} col-span-full p-8 text-center text-[14px] text-[#475569]`}>No categories yet.</div>
        ) : (
          categories.map((c) => (
            <button key={c.id} onClick={() => router.push(`/knowledge-base/articles?category=${c.id}`)}
              className={`${CARD} group flex items-start gap-3 p-5 text-left transition-shadow hover:shadow-[0_8px_30px_rgba(79,70,229,0.12)]`}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#EEF3FF] text-[#4F46E5]"><Book size={20} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-[15px] font-semibold text-[#0F172A]">{c.name}<ChevronRight size={15} className="text-[#CBD5E1] transition-transform group-hover:translate-x-0.5" /></div>
                {c.description && <div className="mt-0.5 line-clamp-2 text-[13px] text-[#475569]">{c.description}</div>}
                <div className="mt-2 text-[12px] font-medium text-[#475569]">{c._count?.articles ?? 0} article{(c._count?.articles ?? 0) === 1 ? '' : 's'}</div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Pinned */}
      {!!pinned?.length && (
        <div className="mb-8">
          <h2 className="mb-3 flex items-center gap-1.5 text-[15px] font-semibold uppercase tracking-wide text-[#475569]"><Pin size={14} /> Pinned</h2>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {pinned.map((a) => (
              <button key={a.id} onClick={() => router.push(`/knowledge-base/articles/${a.slug}`)}
                className={`${CARD} w-72 shrink-0 p-5 text-left transition-shadow hover:shadow-[0_8px_30px_rgba(79,70,229,0.12)]`}>
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#4F46E5]"><Pin size={12} /> {a.category?.name ?? 'General'}</div>
                <div className="mt-1.5 line-clamp-2 text-[15px] font-semibold text-[#0F172A]">{a.title}</div>
                {a.excerpt && <div className="mt-1 line-clamp-2 text-[13px] text-[#475569]">{a.excerpt}</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent */}
      <div>
        <h2 className="mb-3 flex items-center gap-1.5 text-[15px] font-semibold uppercase tracking-wide text-[#475569]"><Clock size={14} /> Recently published</h2>
        <div className={`${CARD} divide-y divide-[#F1F5F9]`}>
          {!recentFive.length ? (
            <div className="p-8 text-center text-[14px] text-[#475569]">No published articles yet.</div>
          ) : (
            recentFive.map((a) => (
              <button key={a.id} onClick={() => router.push(`/knowledge-base/articles/${a.slug}`)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-[#F8FAFC]">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-[#0F172A]">{a.title}</div>
                  <div className="mt-0.5 text-[12px] text-[#475569]">{a.category?.name ?? 'General'} · {a.viewCount} view{a.viewCount === 1 ? '' : 's'}</div>
                </div>
                <ChevronRight size={16} className="shrink-0 text-[#CBD5E1]" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
