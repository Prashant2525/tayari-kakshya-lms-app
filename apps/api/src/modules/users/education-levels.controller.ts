import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EducationLevelInput, ReorderInput } from '@tk/contracts';
import {
  Audiences,
  Client,
  CurrentAuth,
  Public,
  RequirePermissions,
  type AuthContext,
  type ClientInfo,
} from '../../common/auth/auth-context.js';
import { ApiZodBody, ZodBody } from '../../common/validation/zod.js';
import { EducationLevelsService } from './education-levels.service.js';

@ApiTags('education-levels')
@Controller('education-levels')
export class EducationLevelsController {
  constructor(private readonly levels: EducationLevelsService) {}

  /** Options for the profile picker (active only). */
  @Public()
  @Get()
  list() {
    return this.levels.listActive();
  }
}

@ApiTags('admin-education-levels')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin/education-levels')
export class AdminEducationLevelsController {
  constructor(private readonly levels: EducationLevelsService) {}

  @Get()
  @RequirePermissions('education_levels:manage')
  list() {
    return this.levels.listAll();
  }

  @Post()
  @RequirePermissions('education_levels:manage')
  @ApiZodBody(EducationLevelInput)
  create(
    @ZodBody(EducationLevelInput) body: EducationLevelInput,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ) {
    return this.levels.create(body, auth.userId, client);
  }

  @Put('order')
  @RequirePermissions('education_levels:manage')
  @ApiZodBody(ReorderInput)
  reorder(
    @ZodBody(ReorderInput) body: ReorderInput,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ) {
    return this.levels.reorder(body.ids, auth.userId, client);
  }

  @Put(':id')
  @RequirePermissions('education_levels:manage')
  @ApiZodBody(EducationLevelInput)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @ZodBody(EducationLevelInput) body: EducationLevelInput,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ) {
    return this.levels.update(id, body, auth.userId, client);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('education_levels:manage')
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ) {
    await this.levels.remove(id, auth.userId, client);
  }
}
