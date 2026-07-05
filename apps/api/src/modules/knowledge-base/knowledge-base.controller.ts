import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { KnowledgeBaseService } from './knowledge-base.service';
import {
  ArticleQueryDto,
  CreateArticleDto,
  CreateCategoryDto,
  FeedbackDto,
  SearchQueryDto,
  UpdateArticleDto,
  UpdateCategoryDto,
} from './dto/kb.dto';

@ApiTags('knowledge-base')
@ApiBearerAuth()
@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly kb: KnowledgeBaseService) {}

  // ─── Categories ───────────────────────────────────────────────────────────

  @Post('categories')
  @RequirePermissions('kb:manage')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.kb.createCategory(dto);
  }

  @Get('categories')
  listCategories() {
    return this.kb.listCategories();
  }

  @Patch('categories/:id')
  @RequirePermissions('kb:manage')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.kb.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @RequirePermissions('kb:manage')
  deleteCategory(@Param('id') id: string) {
    return this.kb.deleteCategory(id);
  }

  // ─── Search + stats (declared before :slug to avoid route capture) ──────────

  @Get('search')
  search(@Query() query: SearchQueryDto) {
    return this.kb.search(query);
  }

  @Get('stats')
  @RequirePermissions('kb:manage')
  stats() {
    return this.kb.stats();
  }

  // ─── Articles ─────────────────────────────────────────────────────────────

  @Post('articles')
  @RequirePermissions('kb:manage')
  createArticle(@CurrentUser() user: AuthUser, @Body() dto: CreateArticleDto) {
    return this.kb.createArticle(user, dto);
  }

  @Get('articles')
  listArticles(@CurrentUser() user: AuthUser, @Query() query: ArticleQueryDto) {
    return this.kb.listArticles(user, query);
  }

  @Get('articles/:slug')
  getArticle(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.kb.getArticleBySlug(user, slug);
  }

  @Patch('articles/:slug')
  @RequirePermissions('kb:manage')
  updateArticle(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Body() dto: UpdateArticleDto) {
    return this.kb.updateArticle(user, slug, dto);
  }

  @Patch('articles/:slug/publish')
  @RequirePermissions('kb:manage')
  publishArticle(@Param('slug') slug: string) {
    return this.kb.publishArticle(slug);
  }

  @Patch('articles/:slug/archive')
  @RequirePermissions('kb:manage')
  archiveArticle(@Param('slug') slug: string) {
    return this.kb.archiveArticle(slug);
  }

  @Post('articles/:slug/feedback')
  submitFeedback(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Body() dto: FeedbackDto) {
    return this.kb.submitFeedback(user, slug, dto);
  }
}
