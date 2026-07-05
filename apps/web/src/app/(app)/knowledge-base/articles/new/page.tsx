'use client';

import { ArticleEditor } from '@/components/knowledge-base/ArticleEditor';
import { KbAccessGate } from '@/components/knowledge-base/KbAccessGate';

export default function NewArticlePage() {
  return (
    <KbAccessGate>
      <ArticleEditor />
    </KbAccessGate>
  );
}
