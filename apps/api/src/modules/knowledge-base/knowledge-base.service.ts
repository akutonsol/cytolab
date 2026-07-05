import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { KbArticleStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  ArticleQueryDto,
  CreateArticleDto,
  CreateCategoryDto,
  FeedbackDto,
  SearchQueryDto,
  UpdateArticleDto,
  UpdateCategoryDto,
} from './dto/kb.dto';

@Injectable()
export class KnowledgeBaseService {
  constructor(private readonly prisma: PrismaService) {}

  /** Managers (kb:manage / super roles) see every status; everyone else only PUBLISHED. */
  private canManage(user: AuthUser): boolean {
    return user.isSuperRole === true || (user.permissions ?? []).includes('kb:manage');
  }

  private slugify(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'article';
  }

  /** Plain-text snippet (~160 chars) centred on the first match of `q`. */
  private snippet(content: string, q: string): string {
    const plain = content.replace(/[#*_`>[\]!]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!q) return plain.slice(0, 160);
    const idx = plain.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return plain.slice(0, 160);
    const start = Math.max(0, idx - 60);
    const end = Math.min(plain.length, idx + q.length + 100);
    return `${start > 0 ? '…' : ''}${plain.slice(start, end).trim()}${end < plain.length ? '…' : ''}`;
  }

  // ─── Categories ───────────────────────────────────────────────────────────

  createCategory(dto: CreateCategoryDto) {
    // labId omitted → stamped by the tenancy guard from the request scope.
    return this.prisma.kbCategory.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        icon: dto.icon ?? null,
        sortOrder: dto.sortOrder ?? 0,
      } as Prisma.KbCategoryUncheckedCreateInput,
    });
  }

  /** Active categories with their PUBLISHED article count, for the browse grid. */
  listCategories() {
    return this.prisma.kbCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { articles: { where: { status: 'PUBLISHED' } } } } },
    });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.kbCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');
    return this.prisma.kbCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.icon !== undefined && { icon: dto.icon }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  /** Soft delete — hide the category, keep its articles intact. */
  async deleteCategory(id: string) {
    const existing = await this.prisma.kbCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');
    return this.prisma.kbCategory.update({ where: { id }, data: { isActive: false } });
  }

  // ─── Articles ─────────────────────────────────────────────────────────────

  async createArticle(user: AuthUser, dto: CreateArticleDto) {
    const category = await this.prisma.kbCategory.findUnique({ where: { id: dto.categoryId }, select: { id: true } });
    if (!category) throw new BadRequestException('Unknown category');

    const status = dto.status ?? KbArticleStatus.DRAFT;
    const base = this.slugify(dto.title);
    // slug is unique per lab — retry with a numeric suffix on collision.
    for (let attempt = 0; attempt < 20; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      try {
        return await this.prisma.kbArticle.create({
          data: {
            categoryId: dto.categoryId,
            title: dto.title,
            slug,
            content: dto.content,
            excerpt: dto.excerpt ?? null,
            tags: dto.tags ?? [],
            isPinned: dto.isPinned ?? false,
            status,
            authorId: user.userId,
            lastEditedById: user.userId,
            publishedAt: status === KbArticleStatus.PUBLISHED ? new Date() : null,
          } as Prisma.KbArticleUncheckedCreateInput,
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
    }
    throw new BadRequestException('Could not allocate a unique slug, please adjust the title');
  }

  async listArticles(user: AuthUser, query: ArticleQueryDto) {
    const manage = this.canManage(user);
    const where: Prisma.KbArticleWhereInput = {
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.isPinned !== undefined && { isPinned: query.isPinned }),
      ...(query.tags && { tags: { hasSome: query.tags.split(',').map((t) => t.trim()).filter(Boolean) } }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { content: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      // Non-managers only ever see PUBLISHED; managers can filter by any status.
      ...(manage
        ? query.status && { status: query.status }
        : { status: KbArticleStatus.PUBLISHED }),
    };
    return this.prisma.kbArticle.findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }, { updatedAt: 'desc' }],
      include: { category: { select: { id: true, name: true, icon: true } } },
    });
  }

  async getArticleBySlug(user: AuthUser, slug: string) {
    const article = await this.prisma.kbArticle.findFirst({
      where: { slug },
      include: {
        category: { select: { id: true, name: true, icon: true } },
        attachments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!article) throw new NotFoundException('Article not found');
    // Drafts/archived are visible only to managers.
    if (article.status !== KbArticleStatus.PUBLISHED && !this.canManage(user)) {
      throw new NotFoundException('Article not found');
    }
    // Best-effort view counter — never fail the read over it.
    const updated = await this.prisma.kbArticle
      .update({ where: { id: article.id }, data: { viewCount: { increment: 1 } } })
      .catch(() => null);

    // Related: same category or overlapping tags, published, excluding self.
    const related = await this.prisma.kbArticle.findMany({
      where: {
        id: { not: article.id },
        status: KbArticleStatus.PUBLISHED,
        OR: [{ categoryId: article.categoryId }, ...(article.tags.length ? [{ tags: { hasSome: article.tags } }] : [])],
      },
      select: { id: true, slug: true, title: true, excerpt: true },
      orderBy: { viewCount: 'desc' },
      take: 5,
    });

    // Best-effort author display name (lab-scoped user lookup, no PHI).
    const author = await this.prisma.user
      .findUnique({ where: { id: article.authorId }, select: { firstName: true, lastName: true, email: true } })
      .catch(() => null);
    const authorName = author
      ? `${author.firstName ?? ''} ${author.lastName ?? ''}`.trim() || author.email
      : null;

    return { ...article, viewCount: updated?.viewCount ?? article.viewCount, related, authorName };
  }

  async updateArticle(user: AuthUser, slug: string, dto: UpdateArticleDto) {
    const article = await this.prisma.kbArticle.findFirst({ where: { slug }, select: { id: true } });
    if (!article) throw new NotFoundException('Article not found');
    if (dto.categoryId) {
      const category = await this.prisma.kbCategory.findUnique({ where: { id: dto.categoryId }, select: { id: true } });
      if (!category) throw new BadRequestException('Unknown category');
    }
    return this.prisma.kbArticle.update({
      where: { id: article.id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.excerpt !== undefined && { excerpt: dto.excerpt }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.isPinned !== undefined && { isPinned: dto.isPinned }),
        lastEditedById: user.userId,
      },
    });
  }

  async publishArticle(slug: string) {
    const article = await this.prisma.kbArticle.findFirst({ where: { slug }, select: { id: true, publishedAt: true } });
    if (!article) throw new NotFoundException('Article not found');
    return this.prisma.kbArticle.update({
      where: { id: article.id },
      // Keep the original publishedAt if it was already published once.
      data: { status: KbArticleStatus.PUBLISHED, publishedAt: article.publishedAt ?? new Date() },
    });
  }

  async archiveArticle(slug: string) {
    const article = await this.prisma.kbArticle.findFirst({ where: { slug }, select: { id: true } });
    if (!article) throw new NotFoundException('Article not found');
    return this.prisma.kbArticle.update({ where: { id: article.id }, data: { status: KbArticleStatus.ARCHIVED } });
  }

  async submitFeedback(user: AuthUser, slug: string, dto: FeedbackDto) {
    // findFirst is lab-scoped, so we can only attach feedback to our lab's article.
    const article = await this.prisma.kbArticle.findFirst({ where: { slug }, select: { id: true } });
    if (!article) throw new NotFoundException('Article not found');
    return this.prisma.kbFeedback.create({
      data: {
        articleId: article.id,
        userId: user.userId,
        helpful: dto.helpful,
        comment: dto.comment ?? null,
      },
    });
  }

  // ─── Search ───────────────────────────────────────────────────────────────

  async search(query: SearchQueryDto) {
    const q = query.q?.trim();
    if (!q) return { query: '', results: [] as unknown[] };
    const results = await this.prisma.kbArticle.findMany({
      where: {
        status: KbArticleStatus.PUBLISHED,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { content: { contains: q, mode: 'insensitive' } },
          { tags: { has: q } },
        ],
      },
      orderBy: [{ isPinned: 'desc' }, { viewCount: 'desc' }],
      take: 10,
      include: { category: { select: { id: true, name: true } } },
    });
    return {
      query: q,
      results: results.map((a) => ({
        id: a.id,
        slug: a.slug,
        title: a.title,
        tags: a.tags,
        category: a.category,
        excerpt: this.snippet(a.content, q),
      })),
    };
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  async stats() {
    const [total, published, drafts, views, mostViewed, recent] = await Promise.all([
      this.prisma.kbArticle.count(),
      this.prisma.kbArticle.count({ where: { status: KbArticleStatus.PUBLISHED } }),
      this.prisma.kbArticle.count({ where: { status: KbArticleStatus.DRAFT } }),
      this.prisma.kbArticle.aggregate({ _sum: { viewCount: true } }),
      this.prisma.kbArticle.findMany({
        where: { status: KbArticleStatus.PUBLISHED },
        orderBy: { viewCount: 'desc' },
        take: 5,
        select: { id: true, slug: true, title: true, viewCount: true },
      }),
      this.prisma.kbArticle.findMany({
        where: { status: KbArticleStatus.PUBLISHED },
        orderBy: { publishedAt: 'desc' },
        take: 5,
        select: { id: true, slug: true, title: true, publishedAt: true },
      }),
    ]);
    return {
      totalArticles: total,
      published,
      drafts,
      totalViews: views._sum.viewCount ?? 0,
      mostViewed,
      recent,
    };
  }
}
