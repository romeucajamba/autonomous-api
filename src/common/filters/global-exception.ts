import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Ocorreu um erro interno no servidor. Por favor, tente novamente mais tarde.';
    let errorName = 'InternalServerError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        message = (resObj['message'] as string | string[]) || exception.message;
        errorName = (resObj['error'] as string) || exception.name;
      } else {
        message = String(res);
        errorName = exception.name;
      }

      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        message = 'Demasiadas tentativas num curto intervalo de tempo. Por favor, aguarde um momento antes de tentar novamente.';
        errorName = 'TooManyRequests';
      }
    } else if (typeof exception === 'object' && exception !== null && 'code' in exception) {
      // Tratamento seguro de erros do Prisma ORM (impede que nomes de tabelas e queries vazem para atacantes)
      const prismaError = exception as { code: string };
      if (prismaError.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        errorName = 'ConflictException';
        message = 'Já existe um registo com estes dados no sistema.';
      } else if (prismaError.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        errorName = 'NotFoundException';
        message = 'O recurso solicitado não foi encontrado.';
      } else if (prismaError.code === 'P2003') {
        status = HttpStatus.BAD_REQUEST;
        errorName = 'BadRequestException';
        message = 'Operação inválida: referência de dados inconsistente.';
      } else {
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        errorName = 'InternalServerError';
        message = 'Ocorreu um erro no processamento da base de dados. Por favor, tente novamente.';
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      errorName = 'InternalServerError';
      message = 'Ocorreu um erro interno no servidor. Por favor, tente novamente mais tarde.';
    }

    const ip = request.ip || request.socket.remoteAddress || 'unknown';

    // Logs diferenciados: 5xx são erros graves (com stack), 4xx são advertências operacionais
    if (status >= 500) {
      this.logger.error(
        `[CRITICAL 5XX] [${request.method}] ${request.url} | IP: ${ip} | Error: ${JSON.stringify(message)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(
        `[CLIENT 4XX] [${request.method}] ${request.url} | Status: ${status} | Error: ${JSON.stringify(message)} | IP: ${ip}`,
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      error: errorName,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}