import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BannerInput, BannerQuery } from '@tk/contracts';
import { Audiences, Public, RequirePermissions } from '../../common/auth/auth-context.js';
import { ApiZodBody, ZodBody, ZodQuery } from '../../common/validation/zod.js';
import type { Platform } from '../../generated/prisma/client.js';
import { ClientPlatform, StaffActor } from '../content/request-helpers.js';
import type { ContentActor } from '../content/scope.service.js';
import { BannersService } from './banners.service.js';

const uuid = () => new ParseUUIDPipe();

/** Banners for the app's Home and the website's home page (D-064), for everyone. */
@ApiTags('banners')
@Public()
@Controller('banners')
export class BannersController {
  constructor(private readonly banners: BannersService) {}

  @Get()
  live(@ZodQuery(BannerQuery) query: BannerQuery, @ClientPlatform() platform: Platform) {
    return this.banners.live(query, platform);
  }
}

@ApiTags('admin-banners')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin/banners')
export class AdminBannersController {
  constructor(private readonly banners: BannersService) {}

  @Get()
  @RequirePermissions('banners:manage')
  list() {
    return this.banners.adminList();
  }

  @Post()
  @RequirePermissions('banners:manage')
  @ApiZodBody(BannerInput)
  create(@ZodBody(BannerInput) body: BannerInput, @StaffActor() a: ContentActor) {
    return this.banners.save(null, body, a);
  }

  @Put(':id')
  @RequirePermissions('banners:manage')
  @ApiZodBody(BannerInput)
  update(
    @Param('id', uuid()) id: string,
    @ZodBody(BannerInput) body: BannerInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.banners.save(id, body, a);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('banners:manage')
  async remove(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.banners.remove(id, a);
  }
}
