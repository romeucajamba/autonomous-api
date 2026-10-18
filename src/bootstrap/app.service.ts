import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { RedisService } from '../infra/redis/redis.service.js';
import { env } from '../config/env.config.js';

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  getInfo() {
    return {
      name: env.APP_NAME,
      version: '0.0.1',
      environment: env.NODE_ENV,
      status: 'online',
    };
  }

  async checkHealth() {
    const dbHealthy = await this.prisma.isHealthy();
    const redisHealthy = await this.redis.isHealthy();
    const isHealthy = dbHealthy && redisHealthy;

    return {
      status: isHealthy ? 'healthy' : 'degraded',
      services: {
        database: dbHealthy ? 'up' : 'down',
        redis: redisHealthy ? 'up' : 'down',
      },
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };
  }
}
