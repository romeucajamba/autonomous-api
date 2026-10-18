import 'dotenv/config';
import { z } from 'zod';

/**
 * Utilitário de parsing booleano resiliente para variáveis de ambiente textuais
 */
const booleanSchema = (defaultValue = true) =>
  z.preprocess((val) => {
    if (val === undefined || val === null || val === '') {
      return defaultValue;
    }
    if (typeof val === 'string') {
      const lower = val.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(lower)) return true;
      if (['false', '0', 'no', 'off'].includes(lower)) return false;
    }
    return Boolean(val);
  }, z.boolean());

/**
 * Schema Zod completo para validação, coerção e tipagem das variáveis de ambiente do Autonomous API
 */
export const envSchema = z.object({
  // 1. Aplicação & Servidor
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_NAME: z.string().min(1).default('autonomous-api'),
  APP_URL: z.string().default('http://localhost:3000'),
  API_PREFIX: z.string().default('api'),

  // 2. Base de Dados (PostgreSQL 18 & Prisma 7)
  DATABASE_URL: z
    .string()
    .min(1, 'A variável DATABASE_URL é obrigatória para conexão à base de dados PostgreSQL.'),

  // 3. Cache & Filas (Redis 7 & BullMQ)
  REDIS_URL: z
    .string()
    .min(1, 'A variável REDIS_URL é obrigatória para conexão ao Redis.'),

  // 4. Autenticação & Segurança (JWT)
  JWT_SECRET: z
    .string()
    .min(
      32,
      'A variável JWT_SECRET deve possuir no mínimo 32 caracteres para garantir segurança criptográfica.',
    ),
  JWT_ACCESS_EXPIRATION: z.string().default('15m'),
  JWT_REFRESH_EXPIRATION: z.string().default('7d'),

  // 5. CORS & Rate Limiting
  CORS_ORIGIN: z.string().default('*'),
  THROTTLE_TTL: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),

  // 6. Proxy, Uploads & Migrações
  HTTP_PORT: z.coerce.number().int().positive().default(80),
  CLIENT_MAX_BODY_SIZE: z.string().default('50M'),
  RUN_MIGRATIONS: booleanSchema(true),

  // 7. Documentação OpenAPI (Swagger)
  SWAGGER_ENABLED: booleanSchema(true),
  SWAGGER_PATH: z.string().default('api/docs'),

  // 8. Paginação
  PAGINATION_DEFAULT_LIMIT: z.coerce.number().int().positive().default(20),
  PAGINATION_MAX_LIMIT: z.coerce.number().int().positive().default(100),

  // 9. Observabilidade & Métricas
  OBSERVE_APP_KEY: z.string().default('autonomous-key'),
  OBSERVE_APP_SECRET: z.string().default('autonomous-secret'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Função de validação estrita com relatório claro de erros de inicialização
 */
export function validateEnv(config: Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const errorMessages = result.error.issues
      .map((issue) => `  ❌ [${issue.path.join('.') || 'root'}]: ${issue.message}`)
      .join('\n');

    const formattedError = [
      '==============================================================================',
      '🚨 [CONFIG_VALIDATION_ERROR] Falha na validação das variáveis de ambiente (.env):',
      '==============================================================================',
      errorMessages,
      '==============================================================================',
    ].join('\n');

    throw new Error(formattedError);
  }

  return result.data;
}

/**
 * Objeto 'env' fortemente tipado, validado pelo Zod e pronto para consumo em toda a aplicação
 */
export const env: Env & {
  ENVIRONMENT: Env['NODE_ENV'];
  CORS_ORIGINS: Env['CORS_ORIGIN'];
} = (() => {
  const parsed = validateEnv(process.env);
  return {
    ...parsed,
    get ENVIRONMENT() {
      return parsed.NODE_ENV;
    },
    get CORS_ORIGINS() {
      return parsed.CORS_ORIGIN;
    },
  };
})();