'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronRight, Eye, Pencil, Printer, ThumbsDown, ThumbsUp } from 'lucide-react';
import { getArticle, submitFeedback } from '@/lib/knowledge-base';
import { Markdown } from '@/components/knowledge-base/Markdown';
import { useAuth } from '@/lib/auth';
import { Card } from '@/components/ui';

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

export default function ArticleViewPage() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const { can } = useAuth();
  const canManage = can('kb:manage');

  const { data: article, isLoading, isError } = useQuery({
    queryKey: ['kb-article', slug],
    queryFn: () => getArticle(slug),
    enabled: !!slug,
  });

  const [comment, setComment] = useState('');
  const [sentHelpful, setSentHelpful] = useState<boolean | null>(null);
  const feedback = useMutation({
    mutationFn: (helpful: boolean) => submitFeedback(slug, { helpful, comment: comment.trim() || undefined }),
    onSuccess: (_d, helpful) => setSentHelpful(helpful),
  });

  if (isLoading) return <div className="p-10 text-center text-[14px] text-[#475569]" style={{ background: '#F8FAFC' }}>Loading…</div>;
  if (isError || !article) {
    return (
      <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}>
        <Card radius="md" elevation="raised" border="hairline" className="mx-auto mt-16 max-w-md p-8 text-center">
          <div className="text-[18px] font-bold text-[#0F172A]">Article not found</div>
          <button onClick={() => router.push('/knowledge-base')} className="mt-3 rounded-lg bg-[#4F46E5] px-4 py-2 text-[13px] font-semibold text-white">Back to Knowledge Base</button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-full pb-12 pt-4" style={{ background: '#F8FAFC' }}>
      {/* Breadcrumb */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5 text-[13px] text-[#475569]">
        <button onClick={() => router.push('/knowledge-base')} className="hover:text-[#4F46E5]">Knowledge Base</button>
        <ChevronRight size={13} />
        <button onClick={() => router.push(`/knowledge-base/articles?category=${article.categoryId}`)} className="hover:text-[#4F46E5]">{article.category?.name ?? 'General'}</button>
        <ChevronRight size={13} />
        <span className="text-[#475569]">{article.title}</span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        {/* Article */}
        <article>
          <Card radius="md" elevation="raised" border="hairline" className="p-8 printable">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-[30px] font-bold leading-tight tracking-tight text-[#0F172A]">{article.title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[#475569]">
                  <span className="rounded-md bg-[#EEF3FF] px-2 py-0.5 font-medium text-[#4F46E5]">{article.category?.name ?? 'General'}</span>
                  {article.status !== 'PUBLISHED' && <span className="rounded-md bg-[#FEF9C3] px-2 py-0.5 font-semibold" style={{ color: '#A16207' }}>{article.status}</span>}
                  <span className="inline-flex items-center gap-1"><Eye size={12} /> {article.viewCount}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 print:hidden">
                {canManage && (
                  <button onClick={() => router.push(`/knowledge-base/articles/${slug}/edit`)}
                    className="flex h-9 items-center gap-1.5 rounded-lg border border-[#4F46E5] px-3 text-[13px] font-semibold text-[#4F46E5] hover:bg-[#EEF3FF]"><Pencil size={14} /> Edit</button>
                )}
                <button onClick={() => window.print()} className="flex h-9 items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 text-[13px] font-semibold text-[#475569] hover:bg-[#F1F5F9]"><Printer size={14} /> Print</button>
              </div>
            </div>

            <Markdown content={article.content} />

            {!!article.tags.length && (
              <div className="mt-6 flex flex-wrap gap-1.5 border-t border-[#F1F5F9] pt-5">
                {article.tags.map((t) => <span key={t} className="rounded-md bg-[#F1F5F9] px-2 py-0.5 text-[12px] text-[#475569]">{t}</span>)}
              </div>
            )}
          </Card>

          {/* Feedback */}
          <Card radius="md" elevation="raised" border="hairline" className="mt-5 p-6 print:hidden">
            {sentHelpful === null ? (
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-[15px] font-semibold text-[#0F172A]">Was this article helpful?</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => feedback.mutate(true)} disabled={feedback.isPending}
                    className="flex items-center gap-1.5 rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-2 text-[13px] font-semibold text-[#16A34A] hover:bg-[#DCFCE7] disabled:opacity-60"><ThumbsUp size={15} /> Yes</button>
                  <button onClick={() => feedback.mutate(false)} disabled={feedback.isPending}
                    className="flex items-center gap-1.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[13px] font-semibold text-[#DC2626] hover:bg-[#FEE2E2] disabled:opacity-60"><ThumbsDown size={15} /> No</button>
                </div>
                <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional comment…"
                  className="h-10 min-w-[200px] flex-1 rounded-lg border border-[#E2E8F0] px-3 text-[14px] outline-none focus:border-[#4F46E5]" />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[15px] font-semibold text-[#16A34A]">
                <ThumbsUp size={16} /> Thanks for your feedback!
              </div>
            )}
          </Card>
        </article>

        {/* Sidebar */}
        <aside className="space-y-4 print:hidden">
          <Card radius="md" elevation="raised" border="hairline" className="p-5">
            <div className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[#475569]">Details</div>
            <dl className="space-y-2.5 text-[13px]">
              <div className="flex justify-between gap-2"><dt className="text-[#475569]">Author</dt><dd className="text-right font-medium text-[#334155]">{article.authorName ?? '—'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[#475569]">Published</dt><dd className="text-right font-medium text-[#334155]">{fmtDate(article.publishedAt)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[#475569]">Updated</dt><dd className="text-right font-medium text-[#334155]">{fmtDate(article.updatedAt)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[#475569]">Views</dt><dd className="text-right font-medium text-[#334155]">{article.viewCount}</dd></div>
            </dl>
          </Card>

          {!!article.related.length && (
            <Card radius="md" elevation="raised" border="hairline" className="p-5">
              <div className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[#475569]">Related articles</div>
              <div className="space-y-1">
                {article.related.map((r) => (
                  <button key={r.id} onClick={() => router.push(`/knowledge-base/articles/${r.slug}`)}
                    className="block w-full rounded-lg px-3 py-2 text-left text-[14px] font-medium text-[#334155] transition-colors hover:bg-[#F5F7FF] hover:text-[#4F46E5]">{r.title}</button>
                ))}
              </div>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
