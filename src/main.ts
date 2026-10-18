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

  // Configure CORS com tipagem Zod
  const corsOrigin = env.CORS_ORIGIN;
  if (corsOrigin) {
    const origins = corsOrigin.includes(',')
      ? corsOrigin.split(',').map((o) => o.trim())
      : corsOrigin === '*'
        ? true
        : corsOrigin;
    app.enableCors({
      origin: origins,
      credentials: true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    });
  }

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
