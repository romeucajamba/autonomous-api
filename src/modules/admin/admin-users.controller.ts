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
import { AdminUsersService } from './admin-users.service.js';
import { AdminQueryUsersDto } from './dto/admin-query-users.dto.js';
import { AdminCreateUserDto } from './dto/admin-create-user.dto.js';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto.js';
import { AdminUpdateUserStatusDto } from './dto/admin-update-user-status.dto.js';
import { AdminActionReasonDto } from './dto/admin-action-reason.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/rbac.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../generated/prisma/client.js';
import type { JwtPayload } from '../../common/types/jwt-payload.type.js';

@ApiTags('Administração - Gestão de Contas')
@ApiBearerAuth('JWT-auth')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar contas de utilizadores com paginação, filtros e busca',
    description:
      'Retorna uma lista paginada de utilizadores (CLIENT, PROVIDER ou FINANCIAL), permitindo filtrar por papel, status e termo de pesquisa. Exclusivo para administradores.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de utilizadores obtida com sucesso.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado — token JWT ausente ou inválido.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — requer privilégios de administrador (ADMIN).',
  })
  async listUsers(@Query() query: AdminQueryUsersDto) {
    return this.adminUsersService.listUsers(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar detalhes completos de um utilizador',
    description:
      'Retorna os dados cadastrais, perfil, cartões vinculados e histórico recente de auditoria de um utilizador específico.',
  })
  @ApiParam({ name: 'id', description: 'ID único (UUID) do utilizador' })
  @ApiResponse({
    status: 200,
    description: 'Dados detalhados do utilizador retornados com sucesso.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado — token JWT ausente ou inválido.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — requer privilégios de administrador (ADMIN).',
  })
  @ApiResponse({
    status: 404,
    description: 'Utilizador não encontrado.',
  })
  async getUserById(@Param('id') id: string) {
    return this.adminUsersService.getUserById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Criar novo utilizador (CLIENT, PROVIDER ou FINANCIAL)',
    description:
      'Permite ao administrador criar diretamente utilizadores operacionais com perfil completo e senha encriptada. Se o perfil for CLIENT, gera automaticamente uma carteira/cartão Multicaixa.',
  })
  @ApiResponse({
    status: 201,
    description: 'Utilizador criado com sucesso pelo administrador.',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados de validação inválidos ou tentativa de criar conta ADMIN por este endpoint.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado — token JWT ausente ou inválido.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — requer privilégios de administrador (ADMIN).',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflito — já existe um utilizador com este endereço de email.',
  })
  async createUser(
    @Body() dto: AdminCreateUserDto,
    @CurrentUser() admin: JwtPayload,
    @Ip() ip: string,
  ) {
    return this.adminUsersService.createUser(dto, admin, ip);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar dados cadastrais de um utilizador',
    description:
      'Permite ao administrador atualizar o nome, telefone, papel ou status de um utilizador existente, sincronizando dados e registando auditoria.',
  })
  @ApiParam({ name: 'id', description: 'ID único (UUID) do utilizador' })
  @ApiResponse({
    status: 200,
    description: 'Dados do utilizador atualizados com sucesso.',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados de validação inválidos.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado — token JWT ausente ou inválido.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — requer privilégios de administrador (ADMIN).',
  })
  @ApiResponse({
    status: 404,
    description: 'Utilizador não encontrado.',
  })
  async updateUser(
    @Param('id') id: string,
    @Body() dto: AdminUpdateUserDto,
    @CurrentUser() admin: JwtPayload,
    @Ip() ip: string,
  ) {
    return this.adminUsersService.updateUser(id, dto, admin, ip);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Alterar status da conta (Ativação, Bloqueio ou Suspensão)',
    description:
      'Permite alterar o status da conta para ACTIVE, INACTIVE (bloqueio), SUSPENDED (suspensão) ou PENDING_VERIFICATION. Se for bloqueado ou suspenso, a sessão do utilizador no Redis é imediatamente revogada.',
  })
  @ApiParam({ name: 'id', description: 'ID único (UUID) do utilizador' })
  @ApiResponse({
    status: 200,
    description: 'Status do utilizador atualizado com sucesso.',
  })
  @ApiResponse({
    status: 400,
    description: 'Tentativa de alterar o status da própria conta ou dados inválidos.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado — token JWT ausente ou inválido.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — requer função ADMIN ou tentativa de alterar outro ADMIN.',
  })
  @ApiResponse({
    status: 404,
    description: 'Utilizador não encontrado.',
  })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: AdminUpdateUserStatusDto,
    @CurrentUser() admin: JwtPayload,
    @Ip() ip: string,
  ) {
    return this.adminUsersService.updateStatus(id, dto, admin, ip);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ativação expressa de conta (status = ACTIVE)',
    description:
      'Ativa a conta de um utilizador previamente inativo ou suspenso, permitindo que faça login novamente.',
  })
  @ApiParam({ name: 'id', description: 'ID único (UUID) do utilizador' })
  @ApiResponse({
    status: 200,
    description: 'Conta ativada com sucesso.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — requer privilégios de administrador (ADMIN).',
  })
  @ApiResponse({
    status: 404,
    description: 'Utilizador não encontrado.',
  })
  async activateUser(
    @Param('id') id: string,
    @Body() dto: AdminActionReasonDto,
    @CurrentUser() admin: JwtPayload,
    @Ip() ip: string,
  ) {
    return this.adminUsersService.activateUser(id, dto.reason, admin, ip);
  }

  @Post(':id/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bloqueio expresso de conta (status = INACTIVE)',
    description:
      'Bloqueia imediatamente a conta do utilizador (definindo status = INACTIVE) e revoga todas as sessões ativas no Redis.',
  })
  @ApiParam({ name: 'id', description: 'ID único (UUID) do utilizador' })
  @ApiResponse({
    status: 200,
    description: 'Conta bloqueada com sucesso.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — requer privilégios de administrador (ADMIN).',
  })
  @ApiResponse({
    status: 404,
    description: 'Utilizador não encontrado.',
  })
  async blockUser(
    @Param('id') id: string,
    @Body() dto: AdminActionReasonDto,
    @CurrentUser() admin: JwtPayload,
    @Ip() ip: string,
  ) {
    return this.adminUsersService.blockUser(id, dto.reason, admin, ip);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Suspensão expressa de conta (status = SUSPENDED)',
    description:
      'Suspende a conta do utilizador (definindo status = SUSPENDED) por motivo de infração ou auditoria, e revoga imediatamente as sessões ativas no Redis.',
  })
  @ApiParam({ name: 'id', description: 'ID único (UUID) do utilizador' })
  @ApiResponse({
    status: 200,
    description: 'Conta suspensa com sucesso.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — requer privilégios de administrador (ADMIN).',
  })
  @ApiResponse({
    status: 404,
    description: 'Utilizador não encontrado.',
  })
  async suspendUser(
    @Param('id') id: string,
    @Body() dto: AdminActionReasonDto,
    @CurrentUser() admin: JwtPayload,
    @Ip() ip: string,
  ) {
    return this.adminUsersService.suspendUser(id, dto.reason, admin, ip);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Eliminar conta de utilizador do sistema',
    description:
      'Remove permanentemente o utilizador da base de dados e invalida qualquer sessão existente. Administradores não podem ser eliminados por esta via.',
  })
  @ApiParam({ name: 'id', description: 'ID único (UUID) do utilizador' })
  @ApiResponse({
    status: 200,
    description: 'Utilizador removido com sucesso.',
  })
  @ApiResponse({
    status: 400,
    description: 'Tentativa de eliminar a própria conta.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — requer função ADMIN ou tentativa de eliminar conta ADMIN.',
  })
  @ApiResponse({
    status: 404,
    description: 'Utilizador não encontrado.',
  })
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser() admin: JwtPayload,
    @Ip() ip: string,
  ) {
    return this.adminUsersService.deleteUser(id, admin, ip);
  }
}
