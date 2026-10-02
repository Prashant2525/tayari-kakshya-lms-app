import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AdminListQuery,
  ChapterInput,
  LearningItemInput,
  PublishStatus,
  ReorderIdsInput,
  StatusChangeInput,
  SubjectInput,
  TopicInput,
} from '@tk/contracts';
import { z } from 'zod';
import { Audiences, RequireAnyPermission, RequirePermissions } from '../../common/auth/auth-context.js';
import { ApiZodBody, ZodBody, ZodQuery } from '../../common/validation/zod.js';
import { ContentService } from './content.service.js';
import { LearningItemsService } from './learning-items.service.js';
import { StaffActor } from './request-helpers.js';
import type { ContentActor } from './scope.service.js';

const StatusInput = z.object({ status: PublishStatus });
type Ids = z.infer<typeof ReorderIdsInput>;
const uuid = () => new ParseUUIDPipe();

/** Subjects → chapters → topics → learning items. Editing needs content:edit; publishing checks happen in services. */
@ApiTags('admin-content')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin')
export class AdminContentController {
  constructor(
    private readonly content: ContentService,
    private readonly items: LearningItemsService,
  ) {}

  // ───────────── Subjects ─────────────

  @Get('subjects')
  @RequireAnyPermission(
    'content:edit',
    'content:publish',
    'courses:edit',
    'questions:edit',
    'assessments:edit',
  )
  subjects(@ZodQuery(AdminListQuery) query: AdminListQuery, @StaffActor() a: ContentActor) {
    return this.content.listSubjects(query, a);
  }

  @Post('subjects')
  @RequirePermissions('content:edit')
  @ApiZodBody(SubjectInput)
  createSubject(@ZodBody(SubjectInput) body: SubjectInput, @StaffActor() a: ContentActor) {
    return this.content.createSubject(body, a);
  }

  @Get('subjects/:id/tree')
  @RequireAnyPermission('content:edit', 'content:publish', 'questions:edit', 'assessments:edit')
  tree(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.content.subjectTree(id, a);
  }

  @Put('subjects/:id')
  @HttpCode(204)
  @RequirePermissions('content:edit')
  @ApiZodBody(SubjectInput)
  async updateSubject(
    @Param('id', uuid()) id: string,
    @ZodBody(SubjectInput) body: SubjectInput,
    @StaffActor() a: ContentActor,
  ) {
    await this.content.updateSubject(id, body, a);
  }

  // ───────────── Chapters ─────────────

  @Post('subjects/:id/chapters')
  @RequirePermissions('content:edit')
  @ApiZodBody(ChapterInput)
  createChapter(
    @Param('id', uuid()) subjectId: string,
    @ZodBody(ChapterInput) body: ChapterInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.content.createChapter(subjectId, body, a);
  }

  @Put('subjects/:id/chapters/order')
  @HttpCode(204)
  @RequirePermissions('content:edit')
  @ApiZodBody(ReorderIdsInput)
  async orderChapters(
    @Param('id', uuid()) subjectId: string,
    @ZodBody(ReorderIdsInput) body: Ids,
    @StaffActor() a: ContentActor,
  ) {
    await this.content.reorder('chapter', subjectId, body.ids, a);
  }

  @Put('chapters/:id')
  @HttpCode(204)
  @RequirePermissions('content:edit')
  @ApiZodBody(ChapterInput)
  async updateChapter(
    @Param('id', uuid()) id: string,
    @ZodBody(ChapterInput) body: ChapterInput,
    @StaffActor() a: ContentActor,
  ) {
    await this.content.updateChapter(id, body, a);
  }

  // ───────────── Topics ─────────────

  @Post('chapters/:id/topics')
  @RequirePermissions('content:edit')
  @ApiZodBody(TopicInput)
  createTopic(
    @Param('id', uuid()) chapterId: string,
    @ZodBody(TopicInput) body: TopicInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.content.createTopic(chapterId, body, a);
  }

  @Put('chapters/:id/topics/order')
  @HttpCode(204)
  @RequirePermissions('content:edit')
  @ApiZodBody(ReorderIdsInput)
  async orderTopics(
    @Param('id', uuid()) chapterId: string,
    @ZodBody(ReorderIdsInput) body: Ids,
    @StaffActor() a: ContentActor,
  ) {
    await this.content.reorder('topic', chapterId, body.ids, a);
  }

  @Put('topics/:id')
  @HttpCode(204)
  @RequirePermissions('content:edit')
  @ApiZodBody(TopicInput)
  async updateTopic(
    @Param('id', uuid()) id: string,
    @ZodBody(TopicInput) body: TopicInput,
    @StaffActor() a: ContentActor,
  ) {
    await this.content.updateTopic(id, body, a);
  }

  // ───────────── Status / delete / restore for subjects, chapters, topics ─────────────

  @Put('subjects/:id/status')
  @HttpCode(204)
  @RequirePermissions('content:edit')
  @ApiZodBody(StatusInput)
  async subjectStatus(
    @Param('id', uuid()) id: string,
    @ZodBody(StatusInput) body: z.infer<typeof StatusInput>,
    @StaffActor() a: ContentActor,
  ) {
    await this.content.setStatus('subject', id, body.status, a);
  }

  @Delete('subjects/:id')
  @HttpCode(204)
  @RequirePermissions('content:edit')
  async removeSubject(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.content.remove('subject', id, a);
  }

  @Post('subjects/:id/restore')
  @HttpCode(204)
  @RequirePermissions('content:edit')
  async restoreSubject(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.content.restore('subject', id, a);
  }

  @Put('chapters/:id/status')
  @HttpCode(204)
  @RequirePermissions('content:edit')
  @ApiZodBody(StatusInput)
  async chapterStatus(
    @Param('id', uuid()) id: string,
    @ZodBody(StatusInput) body: z.infer<typeof StatusInput>,
    @StaffActor() a: ContentActor,
  ) {
    await this.content.setStatus('chapter', id, body.status, a);
  }

  @Delete('chapters/:id')
  @HttpCode(204)
  @RequirePermissions('content:edit')
  async removeChapter(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.content.remove('chapter', id, a);
  }

  @Post('chapters/:id/restore')
  @HttpCode(204)
  @RequirePermissions('content:edit')
  async restoreChapter(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.content.restore('chapter', id, a);
  }

  @Put('topics/:id/status')
  @HttpCode(204)
  @RequirePermissions('content:edit')
  @ApiZodBody(StatusInput)
  async topicStatus(
    @Param('id', uuid()) id: string,
    @ZodBody(StatusInput) body: z.infer<typeof StatusInput>,
    @StaffActor() a: ContentActor,
  ) {
    await this.content.setStatus('topic', id, body.status, a);
  }

  @Delete('topics/:id')
  @HttpCode(204)
  @RequirePermissions('content:edit')
  async removeTopic(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.content.remove('topic', id, a);
  }

  @Post('topics/:id/restore')
  @HttpCode(204)
  @RequirePermissions('content:edit')
  async restoreTopic(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.content.restore('topic', id, a);
  }

  // ───────────── Learning items ─────────────

  @Post('topics/:id/items')
  @RequirePermissions('content:edit')
  @ApiZodBody(LearningItemInput)
  createItem(
    @Param('id', uuid()) topicId: string,
    @ZodBody(LearningItemInput) body: LearningItemInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.items.create(topicId, body, a);
  }

  @Put('topics/:id/items/order')
  @HttpCode(204)
  @RequirePermissions('content:edit')
  @ApiZodBody(ReorderIdsInput)
  async orderItems(
    @Param('id', uuid()) topicId: string,
    @ZodBody(ReorderIdsInput) body: Ids,
    @StaffActor() a: ContentActor,
  ) {
    await this.items.reorder(topicId, body.ids, a);
  }

  @Get('learning-items/:id')
  @RequireAnyPermission('content:edit', 'content:publish')
  getItem(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.items.get(id, a);
  }

  @Put('learning-items/:id')
  @RequirePermissions('content:edit')
  @ApiZodBody(LearningItemInput)
  updateItem(
    @Param('id', uuid()) id: string,
    @ZodBody(LearningItemInput) body: LearningItemInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.items.update(id, body, a);
  }

  @Delete('learning-items/:id')
  @HttpCode(204)
  @RequirePermissions('content:edit')
  async removeItem(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.items.remove(id, a);
  }

  @Post('learning-items/:id/restore')
  @HttpCode(204)
  @RequirePermissions('content:edit')
  async restoreItem(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.items.restore(id, a);
  }

  @Put('learning-items/:id/publishing')
  @HttpCode(204)
  @RequirePermissions('content:edit')
  @ApiZodBody(StatusChangeInput)
  async itemStatus(
    @Param('id', uuid()) id: string,
    @ZodBody(StatusChangeInput) body: StatusChangeInput,
    @StaffActor() a: ContentActor,
  ) {
    await this.items.setStatus(id, body, a);
  }
}
