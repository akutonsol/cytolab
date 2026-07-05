'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Archive, Eye, Loader2, Save, Send } from 'lucide-react';
import {
  KbArticle, archiveArticle, createArticle, listCategories, publishArticle, updateArticle,
} from '@/lib/knowledge-base';
import { Markdown } from './Markdown';

const CARD = 'rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)]';
const INPUT = 'w-full rounded-lg border border-[#E2E8F0] px-3 py-2.5 text-[14px] text-[#0F172A] outline-none focus:border-[#4F46E5]';
const LABEL = 'mb-1.5 block text-[13px] font-semibold text-[#334155]';

export function ArticleEditor({ article }: { article?: KbArticle }) {
  const router = useRouter();
  const editing = !!article;

  const { data: categories } = useQuery({ queryKey: ['kb-categories'], queryFn: listCategories });

  const [title, setTitle] = useState(article?.title ?? '');
  const [categoryId, setCategoryId] = useState(article?.categoryId ?? '');
  const [tags, setTags] = useState((article?.tags ?? []).join(', '));
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? '');
  const [content, setContent] = useState(article?.content ?? '');
  const [isPinned, setIsPinned] = useState(article?.isPinned ?? false);
  const [error, setError] = useState<string | null>(null);

  const parsedTags = () => tags.split(',').map((t) => t.trim()).filter(Boolean);
  const payload = () => ({ title, categoryId, content, excerpt: excerpt || undefined, tags: parsedTags(), isPinned });

  const validate = (): boolean => {
    if (title.trim().length < 3) return setError('Title must be at least 3 characters'), false;
    if (!categoryId) return setError('Pick a category'), false;
    if (!content.trim()) return setError('Content cannot be empty'), false;
    setError(null);
    return true;
  };

  // Ensure the article exists (create on first save in "new" mode), returning its slug.
  const ensureSaved = async (): Promise<string> => {
    if (editing) {
      await updateArticle(article!.slug, payload());
      return article!.slug;
    }
    const created = await createArticle({ ...payload(), status: 'DRAFT' });
    return created.slug;
  };

  const saveDraft = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error('invalid');
      return ensureSaved();
    },
    onSuccess: (slug) => router.push(`/knowledge-base/articles/${slug}/edit`),
    onError: (e: any) => e?.message !== 'invalid' && setError(e?.response?.data?.message ?? 'Could not save'),
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error('invalid');
      const slug = await ensureSaved();
      await publishArticle(slug);
      return slug;
    },
    onSuccess: (slug) => router.push(`/knowledge-base/articles/${slug}`),
    onError: (e: any) => e?.message !== 'invalid' && setError(e?.response?.data?.message ?? 'Could not publish'),
  });

  const archive = useMutation({
    mutationFn: async () => archiveArticle(article!.slug),
    onSuccess: () => router.push('/knowledge-base/articles'),
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Could not archive'),
  });

  const busy = saveDraft.isPending || publish.isPending || archive.isPending;

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-[#0F172A]">{editing ? 'Edit article' : 'New article'}</h1>
          <p className="mt-1 text-[14px] text-[#6B7280]">Markdown supported — live preview on the right.</p>
        </div>
        <div className="flex items-center gap-2.5">
          {editing && (
            <button onClick={() => archive.mutate()} disabled={busy}
              className="flex h-10 items-center gap-2 rounded-lg border border-[#E2E8F0] px-4 text-[14px] font-semibold text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-60">
              <Archive size={15} /> Archive
            </button>
          )}
          <button onClick={() => saveDraft.mutate()} disabled={busy}
            className="flex h-10 items-center gap-2 rounded-lg border border-[#4F46E5] px-4 text-[14px] font-semibold text-[#4F46E5] hover:bg-[#EEF3FF] disabled:opacity-60">
            {saveDraft.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save draft
          </button>
          <button onClick={() => publish.mutate()} disabled={busy}
            className="flex h-10 items-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-[14px] font-semibold text-white hover:bg-[#4338CA] disabled:opacity-60">
            {publish.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Publish
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-2.5 text-[14px] font-medium text-[#991B1B]">{error}</div>
      )}

      {/* Metadata */}
      <div className={`${CARD} mb-4 p-5`}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={LABEL}>Title</label>
            <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Article title" />
          </div>
          <div>
            <label className={LABEL}>Category</label>
            <select className={INPUT} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Select a category…</option>
              {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Tags <span className="font-normal text-[#475569]">(comma separated)</span></label>
            <input className={INPUT} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="onboarding, billing, faq" />
          </div>
          <div className="flex items-end justify-between gap-4">
            <div className="flex-1">
              <label className={LABEL}>Pinned</label>
              <button onClick={() => setIsPinned((v) => !v)} type="button"
                className={`flex h-10 w-full items-center justify-between rounded-lg border px-3 text-[14px] font-medium ${isPinned ? 'border-[#4F46E5] bg-[#EEF3FF] text-[#4F46E5]' : 'border-[#E2E8F0] text-[#475569]'}`}>
                {isPinned ? 'Pinned to top' : 'Not pinned'}
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${isPinned ? 'bg-[#4F46E5]' : 'bg-[#CBD5E1]'}`} />
              </button>
            </div>
          </div>
          <div className="md:col-span-2">
            <label className={LABEL}>Excerpt <span className="font-normal text-[#475569]">(optional summary)</span></label>
            <textarea className={`${INPUT} resize-none`} rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="Short summary shown in listings and search results" />
          </div>
        </div>
      </div>

      {/* Editor + preview */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={`${CARD} flex flex-col p-5`}>
          <label className={LABEL}>Content (Markdown)</label>
          <textarea className={`${INPUT} min-h-[460px] flex-1 font-mono text-[13px] leading-relaxed`} value={content}
            onChange={(e) => setContent(e.target.value)} placeholder="# Heading&#10;&#10;Write your article in **Markdown**…" />
        </div>
        <div className={`${CARD} p-5`}>
          <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[#334155]"><Eye size={15} className="text-[#4F46E5]" /> Live preview</div>
          {content.trim() ? <Markdown content={content} /> : <div className="py-16 text-center text-[13px] text-[#475569]">Preview appears here as you type.</div>}
        </div>
      </div>
    </div>
  );
}
