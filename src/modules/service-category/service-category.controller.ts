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
import { ServiceCategoryService } from './service-category.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { QueryCategoryDto } from './dto/query-category.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/rbac.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../generated/prisma/client.js';
import type { JwtPayload } from '../../common/types/jwt-payload.type.js';

@ApiTags('Categorias de Serviços')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('service-categories')
export class ServiceCategoryController {
  constructor(private readonly serviceCategoryService: ServiceCategoryService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar categorias de serviços disponíveis',
    description:
      'Retorna as categorias de serviços cadastradas no sistema. Clientes e prestadores visualizam categorias ativas; administradores podem filtrar por status.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de categorias retornada com sucesso.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado — token JWT ausente ou inválido.',
  })
  async listCategories(
    @Query() query: QueryCategoryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.serviceCategoryService.listCategories(query, user.role);
  }

  @Get(':idOrSlug')
  @ApiOperation({
    summary: 'Consultar detalhes de uma categoria por ID ou Slug',
    description:
      'Retorna as informações completas de uma categoria informando o seu identificador UUID ou o seu slug amigável (ex.: canalizacao-e-reparacao).',
  })
  @ApiParam({
    name: 'idOrSlug',
    description: 'UUID da categoria ou slug amigável',
    example: 'canalizacao-e-reparacao',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalhes da categoria retornados com sucesso.',
  })
  @ApiResponse({
    status: 404,
    description: 'Categoria de serviço não encontrada.',
  })
  async getByIdOrSlug(@Param('idOrSlug') idOrSlug: string) {
    return this.serviceCategoryService.getByIdOrSlug(idOrSlug);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Criar nova categoria de serviço (Exclusivo Administrador)',
    description:
      'Permite ao administrador registar uma nova categoria oficial de serviços para os prestadores associarem aos seus perfis e catálogos.',
  })
  @ApiResponse({
    status: 201,
    description: 'Categoria criada com sucesso.',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados de validação inválidos.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — requer função ADMIN.',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflito — já existe uma categoria com este slug ou nome.',
  })
  async createCategory(
    @Body() dto: CreateCategoryDto,
    @CurrentUser('sub') adminId: string,
    @Ip() ip: string,
  ) {
    return this.serviceCategoryService.createCategory(dto, adminId, ip);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Atualizar dados de uma categoria de serviço (Exclusivo Administrador)',
    description:
      'Permite ao administrador alterar o nome, slug, descrição, ícone ou status de ativação da categoria.',
  })
  @ApiParam({ name: 'id', description: 'UUID da categoria a atualizar' })
  @ApiResponse({
    status: 200,
    description: 'Categoria atualizada com sucesso.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — requer função ADMIN.',
  })
  @ApiResponse({
    status: 404,
    description: 'Categoria de serviço não encontrada.',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflito — o novo slug já pertence a outra categoria.',
  })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser('sub') adminId: string,
    @Ip() ip: string,
  ) {
    return this.serviceCategoryService.updateCategory(id, dto, adminId, ip);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Eliminar uma categoria de serviço (Exclusivo Administrador)',
    description: 'Remove a categoria de serviços da base de dados.',
  })
  @ApiParam({ name: 'id', description: 'UUID da categoria a eliminar' })
  @ApiResponse({
    status: 200,
    description: 'Categoria eliminada com sucesso.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — requer função ADMIN.',
  })
  @ApiResponse({
    status: 404,
    description: 'Categoria de serviço não encontrada.',
  })
  async deleteCategory(
    @Param('id') id: string,
    @CurrentUser('sub') adminId: string,
    @Ip() ip: string,
  ) {
    return this.serviceCategoryService.deleteCategory(id, adminId, ip);
  }
}
