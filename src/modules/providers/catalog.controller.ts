import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Ip,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ProvidersService } from './providers.service.js';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto.js';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto.js';
import { QueryCatalogDto } from './dto/query-catalog.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/rbac.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../generated/prisma/client.js';
import type { JwtPayload } from '../../common/types/jwt-payload.type.js';

@ApiTags('Catálogo & Serviços')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('catalog')
export class CatalogController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar todos os serviços disponíveis no catálogo',
    description:
      'Retorna uma lista paginada de serviços e itens de catálogo oferecidos pelos prestadores. Acessível a clientes, prestadores e administradores autenticados com filtros por preço, prestador e busca textual.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de serviços do catálogo obtida com sucesso.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado — token JWT ausente ou inválido.',
  })
  async listCatalog(@Query() query: QueryCatalogDto) {
    return this.providersService.listCatalog(query);
  }

  @Get('my')
  @UseGuards(RolesGuard)
  @Roles(Role.PROVIDER)
  @ApiOperation({
    summary: 'Listar os serviços do próprio catálogo (Exclusivo Prestador)',
    description:
      'Retorna todos os serviços cadastrados no catálogo pelo prestador atualmente autenticado.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista dos serviços do próprio prestador obtida com sucesso.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — requer perfil de prestador (PROVIDER).',
  })
  async getMyCatalog(@CurrentUser() user: JwtPayload) {
    return this.providersService.getMyCatalog(user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar detalhes de um serviço específico do catálogo',
    description:
      'Retorna os dados completos de um serviço de catálogo, incluindo dados cadastrais e de contacto do prestador associado.',
  })
  @ApiParam({ name: 'id', description: 'UUID do serviço de catálogo' })
  @ApiResponse({
    status: 200,
    description: 'Detalhes do serviço retornados com sucesso.',
  })
  @ApiResponse({
    status: 404,
    description: 'Serviço de catálogo não encontrado.',
  })
  async getCatalogItemById(@Param('id') id: string) {
    return this.providersService.getCatalogItemById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(Role.PROVIDER, Role.ADMIN)
  @ApiOperation({
    summary: 'Adicionar novo serviço ao catálogo (Prestador ou Administrador)',
    description:
      'Permite ao prestador adicionar um serviço ao seu próprio catálogo. Administradores também podem criar serviços e vinculá-los diretamente a qualquer prestador informando o campo "providerId".',
  })
  @ApiResponse({
    status: 201,
    description: 'Serviço adicionado ao catálogo com sucesso.',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos ou ausência de providerId quando a ação é executada por ADMIN.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — requer perfil PROVIDER ou ADMIN.',
  })
  async createCatalogItem(
    @Body() dto: CreateCatalogItemDto,
    @CurrentUser() user: JwtPayload,
    @Ip() ip: string,
  ) {
    return this.providersService.createCatalogItem(dto, user, ip);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.PROVIDER, Role.ADMIN)
  @ApiOperation({
    summary: 'Atualizar dados de um serviço do catálogo',
    description:
      'Permite atualizar o título, descrição, preço ou imagem do serviço. Prestadores apenas podem alterar serviços do seu próprio catálogo; administradores podem alterar qualquer serviço.',
  })
  @ApiParam({ name: 'id', description: 'UUID do serviço a atualizar' })
  @ApiResponse({
    status: 200,
    description: 'Serviço atualizado com sucesso.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — não tem permissão para alterar serviços de outro prestador.',
  })
  @ApiResponse({
    status: 404,
    description: 'Serviço de catálogo não encontrado.',
  })
  async updateCatalogItem(
    @Param('id') id: string,
    @Body() dto: UpdateCatalogItemDto,
    @CurrentUser() user: JwtPayload,
    @Ip() ip: string,
  ) {
    return this.providersService.updateCatalogItem(id, dto, user, ip);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(Role.PROVIDER, Role.ADMIN)
  @ApiOperation({
    summary: 'Eliminar um serviço do catálogo',
    description:
      'Remove permanentemente o serviço do catálogo. Prestadores apenas podem eliminar serviços do seu próprio catálogo; administradores podem eliminar qualquer serviço.',
  })
  @ApiParam({ name: 'id', description: 'UUID do serviço a eliminar' })
  @ApiResponse({
    status: 200,
    description: 'Serviço eliminado do catálogo com sucesso.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — não tem permissão para eliminar serviços de outro prestador.',
  })
  @ApiResponse({
    status: 404,
    description: 'Serviço de catálogo não encontrado.',
  })
  async deleteCatalogItem(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Ip() ip: string,
  ) {
    return this.providersService.deleteCatalogItem(id, user, ip);
  }
}
