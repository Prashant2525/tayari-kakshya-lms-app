import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateStaffInput, PERMISSIONS, RoleInput, SetRolesInput } from '@tk/contracts';
import type { FastifyRequest } from 'fastify';
import {
  Audiences,
  Client,
  CurrentAuth,
  RequirePermissions,
  type AuthContext,
  type ClientInfo,
} from '../../common/auth/auth-context.js';
import { ApiZodBody, ZodBody } from '../../common/validation/zod.js';
import { StaffService, type Actor } from './staff.service.js';

function actorOf(auth: AuthContext, req: FastifyRequest, client: ClientInfo): Actor {
  if (!req.staffAccess) throw new Error('PermissionsGuard did not run');
  return { userId: auth.userId, access: req.staffAccess, client };
}

@ApiTags('admin-access')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin')
export class AdminAccessController {
  constructor(private readonly staff: StaffService) {}

  @Get('permissions')
  @RequirePermissions('roles:manage')
  permissions() {
    return Object.entries(PERMISSIONS).map(([name, description]) => ({ name, description }));
  }

  @Get('roles')
  @RequirePermissions('roles:manage')
  roles() {
    return this.staff.listRoles();
  }

  @Post('roles')
  @RequirePermissions('roles:manage')
  @ApiZodBody(RoleInput)
  createRole(
    @ZodBody(RoleInput) body: RoleInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: FastifyRequest,
    @Client() client: ClientInfo,
  ) {
    return this.staff.createRole(body, actorOf(auth, req, client));
  }

  @Put('roles/:id')
  @RequirePermissions('roles:manage')
  @ApiZodBody(RoleInput)
  updateRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @ZodBody(RoleInput) body: RoleInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: FastifyRequest,
    @Client() client: ClientInfo,
  ) {
    return this.staff.updateRole(id, body, actorOf(auth, req, client));
  }

  @Delete('roles/:id')
  @HttpCode(204)
  @RequirePermissions('roles:manage')
  async deleteRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: FastifyRequest,
    @Client() client: ClientInfo,
  ) {
    await this.staff.deleteRole(id, actorOf(auth, req, client));
  }

  @Get('staff')
  @RequirePermissions('staff:read')
  listStaff() {
    return this.staff.listStaff();
  }

  @Post('staff')
  @RequirePermissions('staff:manage')
  @ApiZodBody(CreateStaffInput)
  createStaff(
    @ZodBody(CreateStaffInput) body: CreateStaffInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: FastifyRequest,
    @Client() client: ClientInfo,
  ) {
    return this.staff.createStaff(body, actorOf(auth, req, client));
  }

  @Put('staff/:id/roles')
  @HttpCode(204)
  @RequirePermissions('staff:manage')
  @ApiZodBody(SetRolesInput)
  async setRoles(
    @Param('id', new ParseUUIDPipe()) id: string,
    @ZodBody(SetRolesInput) body: SetRolesInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: FastifyRequest,
    @Client() client: ClientInfo,
  ) {
    await this.staff.setStaffRoles(id, body.roleIds, actorOf(auth, req, client));
  }

  @Patch('staff/:id/suspend')
  @HttpCode(204)
  @RequirePermissions('staff:manage')
  async suspend(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: FastifyRequest,
    @Client() client: ClientInfo,
  ) {
    await this.staff.setStaffStatus(id, 'suspended', actorOf(auth, req, client));
  }

  @Patch('staff/:id/reactivate')
  @HttpCode(204)
  @RequirePermissions('staff:manage')
  async reactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: FastifyRequest,
    @Client() client: ClientInfo,
  ) {
    await this.staff.setStaffStatus(id, 'active', actorOf(auth, req, client));
  }
}
