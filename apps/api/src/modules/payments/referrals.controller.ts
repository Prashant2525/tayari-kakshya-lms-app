import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CursorQuery } from '@tk/contracts';
import { z } from 'zod';
import {
  Audiences,
  CurrentAuth,
  RequirePermissions,
  type AuthContext,
} from '../../common/auth/auth-context.js';
import { ZodQuery } from '../../common/validation/zod.js';
import { ReferralsService } from './referrals.service.js';

const AdminReferralQuery = CursorQuery.extend({
  status: z.enum(['joined', 'rewarded', 'cancelled']).optional(),
});
type AdminReferralQuery = z.infer<typeof AdminReferralQuery>;

/** "Invite friends" (D-058): the student's code, link, what friends and they get, and their rewards. */
@ApiTags('referrals')
@ApiBearerAuth()
@Audiences('student')
@Controller('me/referral')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get()
  mine(@CurrentAuth() auth: AuthContext) {
    return this.referrals.mine(auth.userId);
  }
}

/** Referrals for staff: who referred whom, the first purchase and the reward. */
@ApiTags('admin-referrals')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin/referrals')
export class AdminReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get()
  @RequirePermissions('orders:read')
  list(@ZodQuery(AdminReferralQuery) query: AdminReferralQuery) {
    return this.referrals.list(query);
  }
}
