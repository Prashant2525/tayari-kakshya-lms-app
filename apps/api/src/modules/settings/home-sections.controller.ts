import { Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { HomeSections } from '@tk/contracts';
import { Audiences, RequirePermissions } from '../../common/auth/auth-context.js';
import { ApiZodBody, ZodBody } from '../../common/validation/zod.js';
import { StaffActor } from '../content/request-helpers.js';
import type { ContentActor } from '../content/scope.service.js';
import { SettingsService } from './settings.service.js';

/**
 * The CMS "Home screen" page (D-075 / audit F-08): the order and visibility of the app's Home sections. Stored as the
 * `home.sections` setting (audited like every setting) but managed with its own permission, so content staff need no
 * access to the other settings.
 */
@ApiTags('admin-home-sections')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin/home-sections')
export class HomeSectionsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermissions('home:manage')
  get() {
    return this.settings.get('home.sections');
  }

  @Put()
  @RequirePermissions('home:manage')
  @ApiZodBody(HomeSections)
  update(@ZodBody(HomeSections) body: HomeSections, @StaffActor() a: ContentActor) {
    return this.settings.update('home.sections', body, a.userId, a.client);
  }
}
