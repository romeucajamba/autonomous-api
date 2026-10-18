import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AppService } from './app.service.js';

@ApiTags('Saúde do Sistema')
@SkipThrottle()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({
    summary: 'Informações e status da API',
    description: 'Devolve o nome do serviço, ambiente em execução e versão da API.',
  })
  @ApiResponse({
    status: 200,
    description: 'Informações gerais da API.',
  })
  getInfo() {
    return this.appService.getInfo();
  }

  @Get('api/health')
  @ApiOperation({
    summary: 'Health check dos serviços (PostgreSQL e Redis)',
    description:
      'Verifica a conectividade e operabilidade do banco de dados relacional (PostgreSQL) e do serviço de cache/filas (Redis). Retorna 200 se ambos estiverem saudáveis ou 503 se houver degradação.',
  })
  @ApiResponse({
    status: 200,
    description: 'Todos os serviços dependentes estão operacionais (status: healthy).',
  })
  @ApiResponse({
    status: 503,
    description: 'Um ou mais serviços dependentes estão inacessíveis (status: degraded).',
  })
  async getHealth(@Res() res: Response) {
    const health = await this.appService.checkHealth();
    const statusCode =
      health.status === 'healthy'
        ? HttpStatus.OK
        : HttpStatus.SERVICE_UNAVAILABLE;

    return res.status(statusCode).json(health);
  }
}
