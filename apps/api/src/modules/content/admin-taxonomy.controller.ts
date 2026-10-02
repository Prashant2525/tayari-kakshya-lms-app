import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ExamNodeInput, PaperInput, PublishStatus } from '@tk/contracts';
import { z } from 'zod';
import { Audiences, RequirePermissions } from '../../common/auth/auth-context.js';
import { ApiZodBody, ZodBody } from '../../common/validation/zod.js';
import { StaffActor } from './request-helpers.js';
import type { ContentActor } from './scope.service.js';
import { TaxonomyService } from './taxonomy.service.js';

const StatusInput = z.object({ status: PublishStatus });
const NodeOrderInput = z.object({ parentId: z.uuid().nullable(), ids: z.array(z.uuid()).min(1).max(1000) });
const actor = (a: ContentActor) => ({ userId: a.userId, client: a.client });

@ApiTags('admin-taxonomy')
@ApiBearerAuth()
@Audiences('staff')
@RequirePermissions('taxonomy:manage')
@Controller('admin')
export class AdminTaxonomyController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Get('exam-nodes')
  tree(@Query('includeDeleted') includeDeleted?: string) {
    return this.taxonomy.adminTree(includeDeleted === 'true');
  }

  @Post('exam-nodes')
  @ApiZodBody(ExamNodeInput)
  createNode(@ZodBody(ExamNodeInput) body: ExamNodeInput, @StaffActor() a: ContentActor) {
    return this.taxonomy.createNode(body, actor(a));
  }

  @Put('exam-nodes/order')
  @HttpCode(204)
  @ApiZodBody(NodeOrderInput)
  async reorder(
    @ZodBody(NodeOrderInput) body: z.infer<typeof NodeOrderInput>,
    @StaffActor() a: ContentActor,
  ) {
    await this.taxonomy.reorderNodes(body.parentId, body.ids, actor(a));
  }

  @Put('exam-nodes/:id')
  @ApiZodBody(ExamNodeInput)
  updateNode(
    @Param('id', new ParseUUIDPipe()) id: string,
    @ZodBody(ExamNodeInput) body: ExamNodeInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.taxonomy.updateNode(id, body, actor(a));
  }

  @Put('exam-nodes/:id/status')
  @HttpCode(204)
  @ApiZodBody(StatusInput)
  async nodeStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @ZodBody(StatusInput) body: z.infer<typeof StatusInput>,
    @StaffActor() a: ContentActor,
  ) {
    await this.taxonomy.setNodeStatus(id, body.status, actor(a));
  }

  @Delete('exam-nodes/:id')
  @HttpCode(204)
  async removeNode(@Param('id', new ParseUUIDPipe()) id: string, @StaffActor() a: ContentActor) {
    await this.taxonomy.removeNode(id, actor(a));
  }

  @Post('exam-nodes/:id/restore')
  @HttpCode(204)
  async restoreNode(@Param('id', new ParseUUIDPipe()) id: string, @StaffActor() a: ContentActor) {
    await this.taxonomy.restoreNode(id, actor(a));
  }

  @Get('papers')
  papers(@Query('includeDeleted') includeDeleted?: string) {
    return this.taxonomy.listPapers(includeDeleted === 'true');
  }

  @Post('papers')
  @ApiZodBody(PaperInput)
  createPaper(@ZodBody(PaperInput) body: PaperInput, @StaffActor() a: ContentActor) {
    return this.taxonomy.createPaper(body, actor(a));
  }

  @Put('papers/:id')
  @ApiZodBody(PaperInput)
  updatePaper(
    @Param('id', new ParseUUIDPipe()) id: string,
    @ZodBody(PaperInput) body: PaperInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.taxonomy.updatePaper(id, body, actor(a));
  }

  @Put('papers/:id/status')
  @HttpCode(204)
  @ApiZodBody(StatusInput)
  async paperStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @ZodBody(StatusInput) body: z.infer<typeof StatusInput>,
    @StaffActor() a: ContentActor,
  ) {
    await this.taxonomy.setPaperStatus(id, body.status, actor(a));
  }

  @Delete('papers/:id')
  @HttpCode(204)
  async removePaper(@Param('id', new ParseUUIDPipe()) id: string, @StaffActor() a: ContentActor) {
    await this.taxonomy.removePaper(id, actor(a));
  }
}
