import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AdminRefundQuery,
  RefundCompleteInput,
  RefundDecisionInput,
  RefundRequestInput,
} from '@tk/contracts';
import { Audiences, RequirePermissions } from '../../common/auth/auth-context.js';
import { ApiZodBody, ZodBody, ZodQuery } from '../../common/validation/zod.js';
import { StaffActor } from '../content/request-helpers.js';
import type { ContentActor } from '../content/scope.service.js';
import { RefundsService } from './refunds.service.js';

const uuid = () => new ParseUUIDPipe();

/** Refunds for staff (D-026, D-057): request, then approve or reject, then record as sent. */
@ApiTags('admin-refunds')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin')
export class AdminRefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Get('refunds')
  @RequirePermissions('orders:read')
  list(@ZodQuery(AdminRefundQuery) query: AdminRefundQuery) {
    return this.refunds.list(query);
  }

  @Post('orders/:id/refunds')
  @RequirePermissions('refunds:request')
  @ApiZodBody(RefundRequestInput)
  request(
    @Param('id', uuid()) id: string,
    @ZodBody(RefundRequestInput) body: RefundRequestInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.refunds.request(id, body, a);
  }

  @Post('refunds/:id/approve')
  @HttpCode(200)
  @RequirePermissions('refunds:approve')
  @ApiZodBody(RefundDecisionInput)
  approve(
    @Param('id', uuid()) id: string,
    @ZodBody(RefundDecisionInput) body: RefundDecisionInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.refunds.approve(id, body, a);
  }

  @Post('refunds/:id/reject')
  @HttpCode(200)
  @RequirePermissions('refunds:approve')
  @ApiZodBody(RefundDecisionInput)
  reject(
    @Param('id', uuid()) id: string,
    @ZodBody(RefundDecisionInput) body: RefundDecisionInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.refunds.reject(id, body, a);
  }

  @Post('refunds/:id/complete')
  @HttpCode(200)
  @RequirePermissions('refunds:approve')
  @ApiZodBody(RefundCompleteInput)
  complete(
    @Param('id', uuid()) id: string,
    @ZodBody(RefundCompleteInput) body: RefundCompleteInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.refunds.complete(id, body, a);
  }
}
