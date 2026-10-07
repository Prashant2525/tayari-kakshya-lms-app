import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AdminArticleQuery,
  ArticleCategoryInput,
  ArticleInput,
  ArticleKind,
  ArticleQuery,
  ArticleStatusInput,
} from '@tk/contracts';
import { z } from 'zod';
import {
  Audiences,
  Public,
  RequireAnyPermission,
  RequirePermissions,
} from '../../common/auth/auth-context.js';
import { ApiZodBody, ZodBody, ZodQuery } from '../../common/validation/zod.js';
import { StaffActor } from '../content/request-helpers.js';
import type { ContentActor } from '../content/scope.service.js';
import { ArticlesService } from './articles.service.js';

const uuid = () => new ParseUUIDPipe();
const CategoryQuery = z.object({ kind: ArticleKind.optional() });

/** Articles for everyone (D-063): the app and the website read these without signing in. */
@ApiTags('articles')
@Public()
@Controller()
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get('articles')
  list(@ZodQuery(ArticleQuery) query: ArticleQuery) {
    return this.articles.list(query);
  }

  @Get('articles/:slug')
  detail(@Param('slug') slug: string) {
    return this.articles.detail(slug);
  }

  @Get('article-categories')
  categories(@ZodQuery(CategoryQuery) query: z.infer<typeof CategoryQuery>) {
    return this.articles.categories(query.kind);
  }
}

@ApiTags('admin-articles')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin')
export class AdminArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get('articles')
  @RequirePermissions('articles:edit')
  list(@ZodQuery(AdminArticleQuery) query: AdminArticleQuery) {
    return this.articles.adminList(query);
  }

  @Post('articles')
  @RequirePermissions('articles:edit')
  @ApiZodBody(ArticleInput)
  create(@ZodBody(ArticleInput) body: ArticleInput, @StaffActor() a: ContentActor) {
    return this.articles.create(body, a);
  }

  @Get('article-quizzes')
  @RequirePermissions('articles:edit')
  quizzes() {
    return this.articles.quizOptions();
  }

  @Get('articles/:id')
  @RequirePermissions('articles:edit')
  detail(@Param('id', uuid()) id: string) {
    return this.articles.adminDetail(id);
  }

  @Put('articles/:id')
  @RequirePermissions('articles:edit')
  @ApiZodBody(ArticleInput)
  update(
    @Param('id', uuid()) id: string,
    @ZodBody(ArticleInput) body: ArticleInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.articles.update(id, body, a);
  }

  @Put('articles/:id/status')
  @RequirePermissions('articles:edit')
  @ApiZodBody(ArticleStatusInput)
  status(
    @Param('id', uuid()) id: string,
    @ZodBody(ArticleStatusInput) body: ArticleStatusInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.articles.setStatus(id, body, a);
  }

  @Delete('articles/:id')
  @HttpCode(204)
  @RequirePermissions('articles:edit')
  async remove(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.articles.remove(id, a);
  }

  @Get('article-categories')
  @RequireAnyPermission('articles:edit', 'articles:publish')
  categories() {
    return this.articles.adminCategories();
  }

  @Post('article-categories')
  @RequirePermissions('articles:publish')
  @ApiZodBody(ArticleCategoryInput)
  createCategory(@ZodBody(ArticleCategoryInput) body: ArticleCategoryInput, @StaffActor() a: ContentActor) {
    return this.articles.saveCategory(null, body, a);
  }

  @Put('article-categories/:id')
  @RequirePermissions('articles:publish')
  @ApiZodBody(ArticleCategoryInput)
  updateCategory(
    @Param('id', uuid()) id: string,
    @ZodBody(ArticleCategoryInput) body: ArticleCategoryInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.articles.saveCategory(id, body, a);
  }
}
