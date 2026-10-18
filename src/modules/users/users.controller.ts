import { Controller, Get, Patch, Body, UseGuards, Ip, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service.js';
import { UpdateProfileDto } from './dtos/update-profile.dto.js';
import { ChangePasswordDto } from './dtos/change-password.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/types/jwt-payload.type.js';

@ApiTags('Utilizadores & Perfis')
@ApiBearerAuth('JWT-auth')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Consultar dados e perfil do utilizador autenticado',
    description:
      'Retorna as informações completas da conta e do perfil associado (cliente ou prestador) com base no token JWT fornecido.',
  })
  @ApiResponse({
    status: 200,
    description: 'Dados do utilizador e perfil retornados com sucesso.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado — token JWT ausente ou inválido.',
  })
  @ApiResponse({
    status: 404,
    description: 'Utilizador não encontrado.',
  })
  async getMe(@CurrentUser() currentUser: JwtPayload) {
    const user = await this.usersService.findById(currentUser.sub);
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @Patch('me')
  @ApiOperation({
    summary: 'Atualizar dados cadastrais e perfil do utilizador logado',
    description:
      'Permite que o utilizador autenticado atualize os seus dados (nome, telefone, bio, especialidade, foto de perfil, etc.). Sincroniza consistentemente as tabelas de utilizadores e perfis. Protegido contra abusos (máx 15 por min).',
  })
  @ApiResponse({
    status: 200,
    description: 'Dados do utilizador e perfil atualizados com sucesso.',
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
    status: 429,
    description: 'Demasiadas requisições de atualização de dados. Aguarde um minuto.',
  })
  async updateMe(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateProfileDto,
    @Ip() ip: string,
  ) {
    return this.usersService.updateMe(userId, dto, ip);
  }

  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @Patch('me/profile')
  @ApiOperation({
    summary: 'Atualizar dados específicos do perfil',
    description:
      'Permite que o utilizador autenticado atualize campos do perfil (contacto, bio, especialidade, avatar, mensagem padrão). Protegido contra abusos (máx 15 por min).',
  })
  @ApiResponse({
    status: 200,
    description: 'Perfil atualizado com sucesso.',
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
    status: 429,
    description: 'Demasiadas requisições de atualização de perfil. Aguarde um minuto.',
  })
  async updateProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateProfileDto,
    @Ip() ip: string,
  ) {
    return this.usersService.updateProfile(userId, dto, ip);
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Patch('me/password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Alterar palavra-passe da conta',
    description:
      'Valida a palavra-passe atual e define uma nova palavra-passe com hash seguro (Argon2/bcrypt) para o utilizador autenticado. Protegido contra força bruta (máx 3 tentativas por minuto).',
  })
  @ApiResponse({
    status: 200,
    description: 'Palavra-passe alterada com sucesso.',
  })
  @ApiResponse({
    status: 400,
    description: 'Nova palavra-passe não atende aos requisitos mínimos de segurança.',
  })
  @ApiResponse({
    status: 401,
    description: 'Palavra-passe atual incorreta ou token ausente/inválido.',
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiadas tentativas de alteração de senha. Aguarde um minuto.',
  })
  async changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
    @Ip() ip: string,
  ) {
    return this.usersService.changePassword(userId, dto, ip);
  }
}
