// Knowledge Base client — types + thin fetchers over the shared api instance.
import { api } from './api';

export type KbStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface KbCategory {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  _count?: { articles: number };
}

export interface KbArticleSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  status: KbStatus;
  isPinned: boolean;
  viewCount: number;
  tags: string[];
  categoryId: string;
  category?: { id: string; name: string; icon: string | null };
  publishedAt: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface KbArticle extends KbArticleSummary {
  content: string;
  authorId: string;
  authorName: string | null;
  lastEditedById: string | null;
  attachments: { id: string; fileName: string; fileUrl: string; fileSize: number }[];
  related: { id: string; slug: string; title: string; excerpt: string | null }[];
}

export interface KbSearchResult {
  id: string;
  slug: string;
  title: string;
  tags: string[];
  category: { id: string; name: string } | null;
  excerpt: string;
}

export interface KbStats {
  totalArticles: number;
  published: number;
  drafts: number;
  totalViews: number;
  mostViewed: { id: string; slug: string; title: string; viewCount: number }[];
  recent: { id: string; slug: string; title: string; publishedAt: string | null }[];
}

// ─── Categories ─────────────────────────────────────────────────────────────
export const listCategories = () =>
  api.get('/knowledge-base/categories').then((r) => r.data as KbCategory[]);
export const createCategory = (body: Partial<KbCategory>) =>
  api.post('/knowledge-base/categories', body).then((r) => r.data as KbCategory);
export const updateCategory = (id: string, body: Partial<KbCategory>) =>
  api.patch(`/knowledge-base/categories/${id}`, body).then((r) => r.data as KbCategory);
export const deleteCategory = (id: string) =>
  api.delete(`/knowledge-base/categories/${id}`).then((r) => r.data);

// ─── Articles ───────────────────────────────────────────────────────────────
export interface ArticleFilters {
  categoryId?: string;
  status?: KbStatus;
  tags?: string;
  search?: string;
  isPinned?: boolean;
}
export const listArticles = (filters: ArticleFilters = {}) =>
  api.get('/knowledge-base/articles', { params: filters }).then((r) => r.data as KbArticleSummary[]);
export const getArticle = (slug: string) =>
  api.get(`/knowledge-base/articles/${slug}`).then((r) => r.data as KbArticle);
export const createArticle = (body: {
  title: string; categoryId: string; content: string; excerpt?: string; tags?: string[]; isPinned?: boolean; status?: KbStatus;
}) => api.post('/knowledge-base/articles', body).then((r) => r.data as KbArticleSummary);
export const updateArticle = (slug: string, body: {
  title?: string; categoryId?: string; content?: string; excerpt?: string; tags?: string[]; isPinned?: boolean;
}) => api.patch(`/knowledge-base/articles/${slug}`, body).then((r) => r.data as KbArticleSummary);
export const publishArticle = (slug: string) =>
  api.patch(`/knowledge-base/articles/${slug}/publish`).then((r) => r.data as KbArticleSummary);
export const archiveArticle = (slug: string) =>
  api.patch(`/knowledge-base/articles/${slug}/archive`).then((r) => r.data as KbArticleSummary);
export const submitFeedback = (slug: string, body: { helpful: boolean; comment?: string }) =>
  api.post(`/knowledge-base/articles/${slug}/feedback`, body).then((r) => r.data);

// ─── Search + stats ─────────────────────────────────────────────────────────
export const searchKb = (q: string) =>
  api.get('/knowledge-base/search', { params: { q } }).then((r) => r.data as { query: string; results: KbSearchResult[] });
export const getStats = () =>
  api.get('/knowledge-base/stats').then((r) => r.data as KbStats);
