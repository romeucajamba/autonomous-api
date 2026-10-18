import { describe, it, expect } from 'vitest';
import { envSchema, validateEnv } from './env.config.js';

describe('Environment Configuration (Zod Schema)', () => {
  const validMockConfig = {
    NODE_ENV: 'development',
    PORT: '3000',
    APP_NAME: 'autonomous-api',
    DATABASE_URL: 'postgresql://autonomous:pass@localhost:5432/autonomous_db?schema=public',
    REDIS_URL: 'redis://localhost:6379/0',
    JWT_SECRET: 'min_32_characters_secret_key_for_testing_purposes_only',
    JWT_ACCESS_EXPIRATION: '15m',
    JWT_REFRESH_EXPIRATION: '7d',
    THROTTLE_TTL: '60',
    THROTTLE_LIMIT: '100',
    SWAGGER_ENABLED: 'true',
    RUN_MIGRATIONS: 'true',
  };

  it('deve validar e converter strings para números e booleanos com sucesso', () => {
    const parsed = validateEnv(validMockConfig);

    expect(parsed.PORT).toBe(3000);
    expect(parsed.THROTTLE_TTL).toBe(60);
    expect(parsed.THROTTLE_LIMIT).toBe(100);
    expect(parsed.SWAGGER_ENABLED).toBe(true);
    expect(parsed.RUN_MIGRATIONS).toBe(true);
    expect(parsed.NODE_ENV).toBe('development');
  });

  it('deve aceitar valores booleanos como false, 0 e off', () => {
    const parsed = validateEnv({
      ...validMockConfig,
      SWAGGER_ENABLED: 'false',
      RUN_MIGRATIONS: '0',
    });

    expect(parsed.SWAGGER_ENABLED).toBe(false);
    expect(parsed.RUN_MIGRATIONS).toBe(false);
  });

  it('deve lançar erro se DATABASE_URL estiver ausente', () => {
    const invalidConfig = { ...validMockConfig };
    delete (invalidConfig as any).DATABASE_URL;

    expect(() => validateEnv(invalidConfig)).toThrow(
      'CONFIG_VALIDATION_ERROR',
    );
  });

  it('deve lançar erro se REDIS_URL estiver ausente', () => {
    const invalidConfig = { ...validMockConfig };
    delete (invalidConfig as any).REDIS_URL;

    expect(() => validateEnv(invalidConfig)).toThrow(
      'CONFIG_VALIDATION_ERROR',
    );
  });

  it('deve lançar erro se JWT_SECRET for menor que 32 caracteres', () => {
    const invalidConfig = {
      ...validMockConfig,
      JWT_SECRET: 'curto_demais',
    };

    expect(() => validateEnv(invalidConfig)).toThrow(
      '32 caracteres',
    );
  });

  it('deve rejeitar NODE_ENV inválido', () => {
    const invalidConfig = {
      ...validMockConfig,
      NODE_ENV: 'invalido_env',
    };

    expect(() => validateEnv(invalidConfig)).toThrow(
      'CONFIG_VALIDATION_ERROR',
    );
  });
});
