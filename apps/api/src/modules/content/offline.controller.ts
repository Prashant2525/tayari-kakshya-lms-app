import { Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OfflineRefreshInput } from '@tk/contracts';
import { Audiences, CurrentAuth, type AuthContext } from '../../common/auth/auth-context.js';
import { RateLimit } from '../../common/security/rate-limit.js';
import { ApiZodBody, ZodBody } from '../../common/validation/zod.js';
import { OfflineService } from './offline.service.js';

const uuid = () => new ParseUUIDPipe();

/** Offline lessons for students (S11, D-067). */
@ApiTags('offline')
@ApiBearerAuth()
@Audiences('student')
@Controller()
export class OfflineController {
  constructor(private readonly offline: OfflineService) {}

  /** The lesson to keep on the device, with its licence. */
  @Post('learning-items/:id/offline')
  @HttpCode(200)
  @RateLimit({ name: 'offline.download', limit: 120, windowSeconds: 3600, by: ['user'] })
  download(@Param('id', uuid()) id: string, @CurrentAuth() auth: AuthContext) {
    return this.offline.download(id, { userId: auth.userId });
  }

  /** Renews the licences of the lessons on the device; revoked ones come back without an expiry. */
  @Post('me/offline/refresh')
  @HttpCode(200)
  @RateLimit({ name: 'offline.refresh', limit: 120, windowSeconds: 3600, by: ['user'] })
  @ApiZodBody(OfflineRefreshInput)
  refresh(@ZodBody(OfflineRefreshInput) body: OfflineRefreshInput, @CurrentAuth() auth: AuthContext) {
    return this.offline.refresh(body.itemIds, { userId: auth.userId });
  }
}
