import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CampaignAudienceInput, CampaignInput, CampaignQuery, CampaignSendInput } from '@tk/contracts';
import { Audiences, RequirePermissions } from '../../common/auth/auth-context.js';
import { ApiZodBody, ZodBody, ZodQuery } from '../../common/validation/zod.js';
import { StaffActor } from '../content/request-helpers.js';
import type { ContentActor } from '../content/scope.service.js';
import { CampaignsService } from './campaigns.service.js';

const uuid = () => new ParseUUIDPipe();

/** CMS "Campaigns" (D-075 / audit F-08): notification campaigns to groups of students. */
@ApiTags('admin-campaigns')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin/notification-campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @RequirePermissions('campaigns:send')
  list(@ZodQuery(CampaignQuery) query: CampaignQuery) {
    return this.campaigns.list(query);
  }

  @Post()
  @RequirePermissions('campaigns:send')
  @ApiZodBody(CampaignInput)
  create(@ZodBody(CampaignInput) body: CampaignInput, @StaffActor() a: ContentActor) {
    return this.campaigns.create(body, a);
  }

  /** How many students an audience reaches now. */
  @Post('audience')
  @HttpCode(200)
  @RequirePermissions('campaigns:send')
  @ApiZodBody(CampaignAudienceInput)
  audience(@ZodBody(CampaignAudienceInput) body: CampaignAudienceInput) {
    return this.campaigns.audienceSize(body.audience, body.excludeIos);
  }

  @Get(':id')
  @RequirePermissions('campaigns:send')
  get(@Param('id', uuid()) id: string) {
    return this.campaigns.get(id);
  }

  @Put(':id')
  @RequirePermissions('campaigns:send')
  @ApiZodBody(CampaignInput)
  update(
    @Param('id', uuid()) id: string,
    @ZodBody(CampaignInput) body: CampaignInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.campaigns.update(id, body, a);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('campaigns:send')
  async remove(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.campaigns.remove(id, a);
  }

  /** Send now, or schedule with a later `sendAt`. */
  @Post(':id/send')
  @HttpCode(200)
  @RequirePermissions('campaigns:send')
  @ApiZodBody(CampaignSendInput)
  send(
    @Param('id', uuid()) id: string,
    @ZodBody(CampaignSendInput) body: CampaignSendInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.campaigns.send(id, body.sendAt, a);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions('campaigns:send')
  cancel(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.campaigns.cancel(id, a);
  }
}
