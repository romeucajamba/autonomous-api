import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ProvidersService } from './providers.service.js';
import { QueryProvidersDto } from './dto/query-providers.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

@ApiTags('Prestadores & Descoberta')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  @ApiOperation({
    summary: 'Descoberta de prestadores de serviços profissionais',
    description:
      'Permite aos clientes e administradores descobrir e explorar profissionais ativos e aprovados, com filtros por área de atuação (workArea), especialidade e pesquisa textual por nome ou biografia.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de prestadores de serviços retornada com sucesso.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado — token JWT ausente ou inválido.',
  })
  async listProviders(@Query() query: QueryProvidersDto) {
    return this.providersService.listProviders(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar perfil público detalhado de um prestador de serviços',
    description:
      'Retorna as informações completas do perfil do profissional, contacto, biografia, disponibilidade e catálogo completo de serviços oferecidos.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do perfil do prestador ou ID do utilizador',
  })
  @ApiResponse({
    status: 200,
    description: 'Perfil do prestador retornado com sucesso.',
  })
  @ApiResponse({
    status: 404,
    description: 'Prestador de serviços não encontrado.',
  })
  async getProviderById(@Param('id') id: string) {
    return this.providersService.getProviderById(id);
  }
}
