import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { env } from '../../config/env.config.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private pool: pg.Pool;

  constructor() {
    const pool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      max: 20,
      min: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      this.logger.error('Unexpected error on idle PostgreSQL client', err);
    });

    const adapter = new PrismaPg(pool);

    super({
      adapter,
      log:
        env.NODE_ENV === 'development'
          ? [
              { emit: 'event', level: 'query' },
              { emit: 'stdout', level: 'info' },
              { emit: 'stdout', level: 'warn' },
              { emit: 'stdout', level: 'error' },
            ]
          : [{ emit: 'stdout', level: 'warn' }, { emit: 'stdout', level: 'error' }],
    });

    this.pool = pool;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Connected to PostgreSQL (PostgreSQL 18 via Prisma ORM 7)');
    } catch (error) {
      this.logger.error('Failed to connect to PostgreSQL during initialization:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      await this.pool.end();
      this.logger.log('PostgreSQL connection pool closed.');
    } catch (error) {
      this.logger.error('Error while disconnecting from PostgreSQL:', error);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Database health check failed:', error);
      return false;
    }
  }
}
