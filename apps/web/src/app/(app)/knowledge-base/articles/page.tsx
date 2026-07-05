'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Eye, FileText, Pin, Search, Tag } from 'lucide-react';
import { KbStatus, listArticles, listCategories } from '@/lib/knowledge-base';
import { useAuth } from '@/lib/auth';
import { useInfiniteScroll, clientPage } from '@/hooks/useInfiniteScroll';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';

const CARD = 'rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)]';
const STATUS_TINT: Record<KbStatus, string> = { PUBLISHED: '#16A34A', DRAFT: '#A16207', ARCHIVED: '#475569' };

function ArticleListInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useAuth();
  const canManage = can('kb:manage');

  const [categoryId, setCategoryId] = useState(params.get('category') ?? '');
  const [status, setStatus] = useState<KbStatus | ''>('');
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');

  const { data: categories } = useQuery({ queryKey: ['kb-categories'], queryFn: listCategories });
  const { data: articles, isLoading } = useQuery({
    queryKey: ['kb-articles', categoryId, status, search],
    queryFn: () => listArticles({
      categoryId: categoryId || undefined,
      status: canManage && status ? status : undefined,
      search: search.trim() || undefined,
    }),
  });

  const filtered = useMemo(() => (tag ? (articles ?? []).filter((a) => a.tags.includes(tag)) : articles ?? []), [articles, tag]);

  // Infinite scroll over the (client-side filtered) article list. Changing a
  // filter recomputes `filtered` → new fetchFn → reload from the first window.
  const fetchFn = useCallback(
    (p: number, ps: number) => Promise.resolve(clientPage(filtered, p, ps)),
    [filtered],
  );
  const { items: pageArticles, loading, initialLoading, hasMore, sentinelRef } =
    useInfiniteScroll({ fetchFn, pageSize: 20 });

  const tagCloud = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of articles ?? []) for (const t of a.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 24);
  }, [articles]);

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-bold tracking-tight text-[#0F172A]">Articles</h1>
        {canManage && (
          <button onClick={() => router.push('/knowledge-base/articles/new')}
            className="flex h-10 items-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-[14px] font-semibold text-white hover:bg-[#4338CA]">
            <FileText size={15} /> New Article
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_1fr]">
        {/* Sidebar */}
        <aside className="space-y-4">
          <div className={`${CARD} p-4`}>
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#475569]">Categories</div>
            <button onClick={() => setCategoryId('')} className={`block w-full rounded-lg px-3 py-2 text-left text-[14px] ${!categoryId ? 'bg-[#EEF3FF] font-semibold text-[#4F46E5]' : 'text-[#334155] hover:bg-[#F8FAFC]'}`}>All categories</button>
            {categories?.map((c) => (
              <button key={c.id} onClick={() => setCategoryId(c.id)} className={`block w-full rounded-lg px-3 py-2 text-left text-[14px] ${categoryId === c.id ? 'bg-[#EEF3FF] font-semibold text-[#4F46E5]' : 'text-[#334155] hover:bg-[#F8FAFC]'}`}>
                {c.name}<span className="ml-1 text-[12px] text-[#475569]">({c._count?.articles ?? 0})</span>
              </button>
            ))}
          </div>

          {!!tagCloud.length && (
            <div className={`${CARD} p-4`}>
              <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#475569]"><Tag size={12} /> Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {tag && <button onClick={() => setTag('')} className="rounded-full bg-[#EEF3FF] px-2.5 py-1 text-[12px] font-semibold text-[#4F46E5]">clear ✕</button>}
                {tagCloud.map(([t, n]) => (
                  <button key={t} onClick={() => setTag(t === tag ? '' : t)} className={`rounded-full px-2.5 py-1 text-[12px] ${t === tag ? 'bg-[#4F46E5] text-white' : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]'}`}>{t}<span className="ml-1 opacity-60">{n}</span></button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Main */}
        <main>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#475569]" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter articles…"
                className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white pl-9 pr-3 text-[14px] outline-none focus:border-[#4F46E5]" />
            </div>
            {canManage && (
              <select value={status} onChange={(e) => setStatus(e.target.value as KbStatus | '')}
                className="h-10 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[14px] text-[#334155] outline-none focus:border-[#4F46E5]">
                <option value="">All statuses</option>
                <option value="PUBLISHED">Published</option>
                <option value="DRAFT">Draft</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            )}
          </div>

          {isLoading ? (
            <div className={`${CARD} p-10 text-center text-[14px] text-[#475569]`}>Loading…</div>
          ) : !filtered.length ? (
            <div className={`${CARD} p-10 text-center text-[14px] text-[#475569]`}>No articles match your filters.</div>
          ) : (
            <div className="space-y-3">
              {pageArticles.map((a) => (
                <button key={a.id} onClick={() => router.push(`/knowledge-base/articles/${a.slug}`)}
                  className={`${CARD} block w-full p-5 text-left transition-shadow hover:shadow-[0_8px_30px_rgba(79,70,229,0.10)]`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {a.isPinned && <Pin size={13} className="text-[#4F46E5]" />}
                        <span className="text-[16px] font-semibold text-[#0F172A]">{a.title}</span>
                        {canManage && a.status !== 'PUBLISHED' && (
                          <span className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: `${STATUS_TINT[a.status]}1A`, color: STATUS_TINT[a.status] }}>{a.status}</span>
                        )}
                      </div>
                      {a.excerpt && <div className="mt-1 line-clamp-2 text-[14px] text-[#475569]">{a.excerpt}</div>}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {a.category && <span className="rounded-md bg-[#EEF3FF] px-2 py-0.5 text-[12px] font-medium text-[#4F46E5]">{a.category.name}</span>}
                        {a.tags.slice(0, 4).map((t) => <span key={t} className="rounded-md bg-[#F1F5F9] px-2 py-0.5 text-[12px] text-[#475569]">{t}</span>)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 text-[12px] text-[#475569]"><Eye size={13} /> {a.viewCount}</div>
                  </div>
                </button>
              ))}
              {/* Infinite scroll: auto-loads more articles as you scroll. */}
              <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function ArticleListPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-[14px] text-[#475569]">Loading…</div>}>
      <ArticleListInner />
    </Suspense>
  );
}
