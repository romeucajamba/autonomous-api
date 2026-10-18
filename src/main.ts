import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule, ObserveInstrument } from './bootstrap/app.module.js';
import { GlobalExceptionFilter } from './common/filters/global-exception.js';
import { HttpLoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { setupSwagger } from './config/swagger.config.js';
import { env } from './config/env.config.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  // Enable graceful shutdown hooks (SIGTERM/SIGINT) for clean Prisma & Redis teardown
  app.enableShutdownHooks();

  // Global HTTP Request Logging Interceptor (terminal status & duration logs)
  app.useGlobalInterceptors(new HttpLoggingInterceptor());

  // Global Exception Filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global Validation Pipe for class-validator DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Configuração profissional e flexível de CORS para múltiplos domínios (Web, Mobile e Postman)
  const configuredOrigins = (env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const isDevOrWildcard = configuredOrigins.includes('*') || env.NODE_ENV === 'development';

  app.enableCors({
    origin: (
      requestOrigin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // 1. Postman, cURL, Insomnia e apps Mobile nativas (React Native, Flutter, Swift, Kotlin)
      // que realizam requisições HTTP diretas sem cabeçalho Origin de browser
      if (!requestOrigin) {
        return callback(null, true);
      }

      // 2. Ambiente de desenvolvimento ou wildcard explícito
      if (isDevOrWildcard) {
        return callback(null, true);
      }

      // 3. Aplicações móveis híbridas (Capacitor, Ionic) e emuladores móveis
      if (
        requestOrigin.startsWith('capacitor://') ||
        requestOrigin.startsWith('ionic://') ||
        requestOrigin === 'http://localhost' ||
        requestOrigin.includes('10.0.2.2')
      ) {
        return callback(null, true);
      }

      // 4. Verificação de domínios web configurados (múltiplos portais web e painéis admin)
      const isAllowed = configuredOrigins.some((allowed) => {
        if (allowed === requestOrigin) return true;
        if (allowed.startsWith('*.')) {
          const domain = allowed.slice(2);
          return requestOrigin.endsWith(domain);
        }
        return false;
      });

      if (isAllowed) {
        return callback(null, true);
      }

      logger.warn(`[CORS_BLOCKED] Pedido rejeitado para a origem não permitida: ${requestOrigin}`);
      return callback(
        new Error(`Origem não permitida pela política de CORS: ${requestOrigin}`),
        false,
      );
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'X-Refresh-Token',
      'x-refresh-token',
      'Origin',
    ],
    exposedHeaders: ['Authorization', 'X-Refresh-Token', 'x-refresh-token'],
  });

  // Swagger Documentation Setup (Ativo em Dev/Staging ou quando SWAGGER_ENABLED=true)
  if (env.SWAGGER_ENABLED) {
    setupSwagger(app);
  }

  const port = env.PORT;
  const host = '0.0.0.0';

  await app.listen(port, host);
  logger.log(`Autonomous API is running on http://${host}:${port} (Ambiente: ${env.NODE_ENV})`);
  if (env.SWAGGER_ENABLED) {
    logger.log(`Swagger documentation available on http://${host}:${port}/${env.SWAGGER_PATH}`);
  } else {
    logger.log('Swagger documentation is disabled in this environment for security.');
  }
}

await bootstrap();
