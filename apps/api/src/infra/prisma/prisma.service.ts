import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { ENV, type Env } from '../../config/env.js';
import { PrismaClient } from '../../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({
      // DATABASE_POOL_MAX connections per process (the API and the worker each have a pool).
      adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: env.DATABASE_POOL_MAX }),
      // During a burst (everyone submitting a weekly exam at once) a transaction waits for a free connection instead
      // of failing after Prisma's default 2 s (Phase 16 load test: half the submits failed).
      transactionOptions: { maxWait: 10_000, timeout: 15_000 },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

export type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];
