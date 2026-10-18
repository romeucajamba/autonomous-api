import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { env } from '../../config/env.config.js';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor() {
    this.client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      lazyConnect: true,
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected successfully (Redis 7 Cache & BullMQ).');
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis error occurred:', err);
    });

    this.client.on('reconnecting', () => {
      this.logger.warn('Reconnecting to Redis...');
    });
  }

  async onModuleInit() {
    try {
      await this.client.connect();
    } catch (error) {
      this.logger.error('Failed to initialize Redis connection:', error);
    }
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
      this.logger.log('Redis client gracefully closed.');
    } catch (error) {
      this.logger.error('Error during Redis disconnection:', error);
    }
  }

  getClient(): Redis {
    return this.client;
  }

  async get<T = string>(key: string): Promise<T | null> {
    const data = await this.client.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return data as unknown as T;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, serialized, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.client.ping();
      return response === 'PONG';
    } catch (error) {
      this.logger.error('Redis health check ping failed:', error);
      return false;
    }
  }
}
