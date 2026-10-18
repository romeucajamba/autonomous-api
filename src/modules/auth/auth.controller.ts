import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
  Ip,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { RegisterProviderDto } from './dto/register-provider.dto.js';
import { ActivateAccountDto } from './dto/activate-account.dto.js';
import { ResendActivationCodeDto } from './dto/resend-activation-code.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/types/jwt-payload.type.js';

@ApiTags('Autenticação & Sessões')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registo de novo Cliente',
    description:
      'Cria uma nova conta de utilizador com papel CLIENT e perfil de cliente com status PENDING_VERIFICATION. Dispara um código de 6 dígitos por SMS via Gateway Ombala para ativação da conta. Protegido contra abusos (máx 5 registos a cada 5 min).',
  })
  @ApiResponse({
    status: 201,
    description: 'Cliente registado com sucesso e código SMS enviado.',
  })
  @ApiResponse({
    status: 400,
    description: 'Erro de validação (ex.: email inválido, senha menor que 8 caracteres).',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflito — já existe uma conta associada a este endereço de email ou telefone.',
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiadas tentativas de registo. Aguarde alguns minutos.',
  })
  async register(@Body() dto: RegisterDto, @Ip() ip: string) {
    return this.authService.register(dto, ip);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @Post('register-provider')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registo de novo Prestador de Serviços',
    description:
      'Cria uma nova conta com papel PROVIDER e status PENDING_VERIFICATION. Requer telefone e especialidade/área de atuação. Dispara um código de 6 dígitos por SMS via Gateway Ombala para ativação da conta. Protegido contra abusos (máx 5 registos a cada 5 min).',
  })
  @ApiResponse({
    status: 201,
    description: 'Prestador registado com sucesso e código SMS enviado.',
  })
  @ApiResponse({
    status: 400,
    description: 'Erro de validação nos campos obrigatórios.',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflito — endereço de email ou telefone já em uso.',
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiadas tentativas de registo. Aguarde alguns minutos.',
  })
  async registerProvider(@Body() dto: RegisterProviderDto, @Ip() ip: string) {
    return this.authService.registerProvider(dto, ip);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 300000 } })
  @Post('activate-account')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ativação de conta por código SMS (OTP de 6 dígitos)',
    description:
      'Valida o código de verificação de 6 dígitos enviado por SMS para o telemóvel do utilizador após o registo. Ativa a conta (status ACTIVE) e devolve a sessão com os tokens JWT (access + refresh). Protegido contra tentativas de força bruta (máx 5 erros por código).',
  })
  @ApiResponse({
    status: 200,
    description: 'Conta ativada com sucesso e sessão iniciada.',
  })
  @ApiResponse({
    status: 400,
    description: 'Código de ativação inválido, expirado ou formato incorreto.',
  })
  @ApiResponse({
    status: 404,
    description: 'Utilizador não encontrado com o telefone ou email informado.',
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiadas tentativas de ativação. Aguarde alguns minutos.',
  })
  async activateAccount(@Body() dto: ActivateAccountDto, @Ip() ip: string) {
    return this.authService.activateAccount(dto, ip);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 300000 } })
  @Post('resend-activation-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reenviar código de ativação por SMS',
    description:
      'Gera um novo código OTP de 6 dígitos e despacha via SMS para o telemóvel associado à conta. Possui cooldown de 60 segundos entre solicitações para evitar abusos.',
  })
  @ApiResponse({
    status: 200,
    description: 'Novo código de ativação enviado com sucesso por SMS.',
  })
  @ApiResponse({
    status: 400,
    description: 'Conta já se encontra ativa, não possui telefone cadastrado ou cooldown de 60 segundos ativo.',
  })
  @ApiResponse({
    status: 404,
    description: 'Utilizador não encontrado.',
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiadas solicitações de reenvio. Aguarde alguns minutos.',
  })
  async resendActivationCode(@Body() dto: ResendActivationCodeDto, @Ip() ip: string) {
    return this.authService.resendActivationCode(dto, ip);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Autenticação / Login de Utilizador',
    description:
      'Valida credenciais (email e palavra-passe) e emite os tokens de sessão (Access Token 15m + Refresh Token 7d registado no Redis). Protegido contra força bruta (máx 5 tentativas por minuto).',
  })
  @ApiResponse({
    status: 200,
    description: 'Autenticação bem-sucedida. Retorna dados do utilizador e tokens.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado — credenciais inválidas.',
  })
  @ApiResponse({
    status: 403,
    description: 'Proibido — conta suspensa ou inativa.',
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiadas tentativas de autenticação. Aguarde um minuto.',
  })
  async login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.authService.login(dto, ip);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verificação de email para recuperação de conta',
    description:
      'Verifica se o endereço de email informado existe na base de dados e confirma a elegibilidade para redefinição da palavra-passe. Protegido contra enumeração de emails (máx 3 tentativas por minuto).',
  })
  @ApiResponse({
    status: 200,
    description: 'Email verificado com sucesso na base de dados.',
  })
  @ApiResponse({
    status: 400,
    description: 'Endereço de email inválido.',
  })
  @ApiResponse({
    status: 404,
    description: 'Nenhuma conta encontrada com este endereço de email.',
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiadas tentativas. Aguarde um minuto.',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Ip() ip: string) {
    return this.authService.forgotPassword(dto, ip);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 300000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Redefinição de palavra-passe esquecida',
    description:
      'Verifica a existência do email na base de dados, atualiza a palavra-passe para o novo valor com hash seguro e revoga sessões anteriores ativas no Redis. Protegido contra abusos (máx 3 redefinições a cada 5 min).',
  })
  @ApiResponse({
    status: 200,
    description: 'Palavra-passe alterada com sucesso. Utilizador pronto para fazer login.',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos ou nova senha menor que 8 caracteres.',
  })
  @ApiResponse({
    status: 403,
    description: 'Proibido — conta suspensa.',
  })
  @ApiResponse({
    status: 404,
    description: 'Nenhuma conta encontrada com este endereço de email.',
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiadas tentativas de redefinição de senha. Aguarde alguns minutos.',
  })
  async resetPassword(@Body() dto: ResetPasswordDto, @Ip() ip: string) {
    return this.authService.resetPassword(dto, ip);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renovação de Sessão (Refresh Token)',
    description:
      'Emite um novo Access Token e um novo Refresh Token através de rotação de tokens (Token Rotation). Aceita o token no corpo JSON, no cabeçalho Authorization ou no cabeçalho x-refresh-token.',
  })
  @ApiHeader({
    name: 'x-refresh-token',
    required: false,
    description: 'Refresh token enviado como cabeçalho customizado (opcional)',
  })
  @ApiResponse({
    status: 200,
    description: 'Sessão renovada com sucesso.',
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh token inválido, expirado ou previamente revogado.',
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiadas requisições de renovação de sessão.',
  })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Ip() ip: string,
    @Headers('authorization') authHeader?: string,
    @Headers('x-refresh-token') xRefreshToken?: string,
  ) {
    const token =
      dto?.refreshToken ||
      xRefreshToken ||
      (authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader);

    return this.authService.refreshToken(token || '', ip);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Encerramento de Sessão (Logout)',
    description:
      'Revoga a sessão do utilizador autenticado e remove o Refresh Token ativo da base de dados em memória (Redis).',
  })
  @ApiResponse({
    status: 200,
    description: 'Sessão encerrada com sucesso.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado — token JWT ausente ou inválido.',
  })
  async logout(@CurrentUser('sub') userId: string, @Ip() ip: string) {
    return this.authService.logout(userId, ip);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Consultar claims do Token JWT atual',
    description:
      'Lê o token de acesso Bearer fornecido no cabeçalho Authorization e retorna os dados decodificados (id, email, papel, id do perfil).',
  })
  @ApiResponse({
    status: 200,
    description: 'Payload do utilizador retornado com sucesso.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado — token JWT ausente ou expirado.',
  })
  async getMe(@CurrentUser() user: JwtPayload) {
    return user;
  }
}
