import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOrderQuery } from '@tk/contracts';
import { Audiences, RequirePermissions } from '../../common/auth/auth-context.js';
import { ZodQuery } from '../../common/validation/zod.js';
import { StaffActor } from '../content/request-helpers.js';
import type { ContentActor } from '../content/scope.service.js';
import { AdminOrdersService } from './admin-orders.service.js';

const uuid = () => new ParseUUIDPipe();

/** Orders and payments for staff (Phase 11). */
@ApiTags('admin-orders')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin')
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrdersService) {}

  @Get('orders')
  @RequirePermissions('orders:read')
  list(@ZodQuery(AdminOrderQuery) query: AdminOrderQuery) {
    return this.orders.list(query);
  }

  @Get('orders/:id')
  @RequirePermissions('orders:read')
  detail(@Param('id', uuid()) id: string) {
    return this.orders.detail(id);
  }

  @Post('payments/:id/check')
  @HttpCode(200)
  @RequirePermissions('orders:manage')
  recheck(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.orders.recheck(id, a);
  }
}
