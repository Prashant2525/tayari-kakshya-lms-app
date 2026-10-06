import { Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminCouponQuery, CouponInput } from '@tk/contracts';
import { Audiences, RequirePermissions } from '../../common/auth/auth-context.js';
import { ApiZodBody, ZodBody, ZodQuery } from '../../common/validation/zod.js';
import { StaffActor } from '../content/request-helpers.js';
import type { ContentActor } from '../content/scope.service.js';
import { CouponsService } from './coupons.service.js';

const uuid = () => new ParseUUIDPipe();

/** Coupon codes in the CMS (D-025, D-054, D-056). Never deleted: staff switch them off. */
@ApiTags('admin-coupons')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin/coupons')
export class AdminCouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  @RequirePermissions('coupons:manage')
  list(@ZodQuery(AdminCouponQuery) query: AdminCouponQuery) {
    return this.coupons.list(query);
  }

  @Post()
  @RequirePermissions('coupons:manage')
  @ApiZodBody(CouponInput)
  create(@ZodBody(CouponInput) body: CouponInput, @StaffActor() a: ContentActor) {
    return this.coupons.create(body, a);
  }

  @Get(':id')
  @RequirePermissions('coupons:manage')
  detail(@Param('id', uuid()) id: string) {
    return this.coupons.detail(id);
  }

  @Put(':id')
  @RequirePermissions('coupons:manage')
  @ApiZodBody(CouponInput)
  async update(
    @Param('id', uuid()) id: string,
    @ZodBody(CouponInput) body: CouponInput,
    @StaffActor() a: ContentActor,
  ) {
    await this.coupons.update(id, body, a);
    return this.coupons.detail(id);
  }
}
