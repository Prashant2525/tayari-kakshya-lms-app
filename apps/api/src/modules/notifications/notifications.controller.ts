import { Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  MarkNotificationsReadInput,
  NotificationPreferencesInput,
  NotificationsQuery,
  PushTokenInput,
} from '@tk/contracts';
import { z } from 'zod';
import { Audiences, CurrentAuth, type AuthContext } from '../../common/auth/auth-context.js';
import { RateLimit } from '../../common/security/rate-limit.js';
import { ApiZodBody, ZodBody, ZodQuery } from '../../common/validation/zod.js';
import { NotificationsService } from './notifications.service.js';

const RemoveTokenInput = z.object({ token: z.string().trim().min(1).max(300) });
type RemoveTokenInput = z.infer<typeof RemoveTokenInput>;

/** The student's notifications (D-033): the in-app list, what they want by push / email, and their devices. */
@ApiTags('notifications')
@ApiBearerAuth()
@Audiences('student')
@Controller('me')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  list(@CurrentAuth() auth: AuthContext, @ZodQuery(NotificationsQuery) query: NotificationsQuery) {
    return this.notifications.inbox(auth.userId, query);
  }

  @Get('notifications/unread')
  async unread(@CurrentAuth() auth: AuthContext) {
    return { count: await this.notifications.unreadCount(auth.userId) };
  }

  @Post('notifications/read')
  @HttpCode(204)
  @ApiZodBody(MarkNotificationsReadInput)
  async read(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(MarkNotificationsReadInput) body: MarkNotificationsReadInput,
  ) {
    await this.notifications.markRead(auth.userId, body.ids);
  }

  @Get('notification-preferences')
  preferences(@CurrentAuth() auth: AuthContext) {
    return this.notifications.preferences(auth.userId);
  }

  @Put('notification-preferences')
  @ApiZodBody(NotificationPreferencesInput)
  setPreferences(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(NotificationPreferencesInput) body: NotificationPreferencesInput,
  ) {
    return this.notifications.setPreferences(auth.userId, body);
  }

  @Post('push-tokens')
  @HttpCode(204)
  @RateLimit({ name: 'me.push-tokens', limit: 30, windowSeconds: 3600, by: ['user'] })
  @ApiZodBody(PushTokenInput)
  async registerToken(@CurrentAuth() auth: AuthContext, @ZodBody(PushTokenInput) body: PushTokenInput) {
    await this.notifications.registerToken(auth.userId, body);
  }

  @Post('push-tokens/remove')
  @HttpCode(204)
  @ApiZodBody(RemoveTokenInput)
  async removeToken(@CurrentAuth() auth: AuthContext, @ZodBody(RemoveTokenInput) body: RemoveTokenInput) {
    await this.notifications.removeToken(auth.userId, body.token);
  }
}
