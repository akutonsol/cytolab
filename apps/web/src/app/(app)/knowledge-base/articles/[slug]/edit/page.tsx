'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getArticle } from '@/lib/knowledge-base';
import { ArticleEditor } from '@/components/knowledge-base/ArticleEditor';
import { KbAccessGate } from '@/components/knowledge-base/KbAccessGate';

export default function EditArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: article, isLoading, isError } = useQuery({
    queryKey: ['kb-article-edit', slug],
    queryFn: () => getArticle(slug),
    enabled: !!slug,
  });

  return (
    <KbAccessGate>
      {isLoading ? (
        <div className="p-10 text-center text-[14px] text-[#475569]" style={{ background: '#F8FAFC' }}>Loading…</div>
      ) : isError || !article ? (
        <div className="p-10 text-center text-[14px] text-[#475569]" style={{ background: '#F8FAFC' }}>Article not found.</div>
      ) : (
        <ArticleEditor article={article} />
      )}
    </KbAccessGate>
  );
}
