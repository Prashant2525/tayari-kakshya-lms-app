import { Controller, Get, HttpCode } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/auth-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisService } from '../../infra/redis/redis.provider.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Process is up. */
  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Dependencies reachable; used by the load balancer / uptime checks. */
  @Public()
  @Get('ready')
  @HttpCode(200)
  async ready() {
    const checks = await Promise.allSettled([this.prisma.$queryRaw`SELECT 1`, this.redis.client.ping()]);
    const [db, redis] = checks.map((c) => (c.status === 'fulfilled' ? 'ok' : 'down'));
    if (db !== 'ok' || redis !== 'ok') {
      throw new AppError(503, 'INTERNAL_ERROR', 'Service not ready', { database: db, redis });
    }
    return { status: 'ok', database: db, redis };
  }
}
