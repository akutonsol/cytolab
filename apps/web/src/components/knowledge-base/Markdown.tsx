'use client';

import { useMemo } from 'react';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: true });

/**
 * Renders trusted Markdown (authored by kb:manage staff) to HTML. Styling is
 * handled by the `.kb-prose` rules in globals.css so the output matches the app.
 */
export function Markdown({ content, className = '' }: { content: string; className?: string }) {
  const html = useMemo(() => marked.parse(content ?? '', { async: false }) as string, [content]);
  return <div className={`kb-prose ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
