import {
  Controller,
  Get,
  Post,
  Patch,
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
import { BookingsService } from './bookings.service.js';
import { CreateBookingRequestDto } from './dto/create-booking-request.dto.js';
import { AutoMatchBookingDto } from './dto/auto-match-booking.dto.js';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto.js';
import { QueryBookingRequestsDto } from './dto/query-booking-requests.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/rbac.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../generated/prisma/client.js';
import type { JwtPayload } from '../../common/types/jwt-payload.type.js';

@ApiTags('Solicitações de Serviços (Bookings)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('requests')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar solicitações de serviço',
    description:
      'Retorna as solicitações de serviço associadas ao utilizador autenticado. Clientes veem os seus pedidos efetuados; prestadores veem as solicitações recebidas; administradores podem visualizar todas.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de solicitações obtida com sucesso.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado — token JWT ausente ou inválido.',
  })
  async listRequests(
    @Query() query: QueryBookingRequestsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bookingsService.listRequests(query, user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar detalhes de uma solicitação de serviço',
    description:
      'Retorna os dados detalhados da solicitação, informações do cliente solicitante, prestador selecionado e estado atual do serviço.',
  })
  @ApiParam({ name: 'id', description: 'UUID da solicitação de serviço' })
  @ApiResponse({
    status: 200,
    description: 'Detalhes da solicitação retornados com sucesso.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — utilizador não associado a esta solicitação.',
  })
  @ApiResponse({
    status: 404,
    description: 'Solicitação de serviço não encontrada.',
  })
  async getRequestById(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bookingsService.getRequestById(id, user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT, Role.ADMIN)
  @ApiOperation({
    summary: 'Criar solicitação direta de serviço a um prestador (Cliente ou Admin)',
    description:
      'Permite ao cliente autenticado selecionar um profissional descoberto na plataforma e enviar uma solicitação direta de serviço com data, hora, descrição e preço acordado (sem matching automático geográfico).',
  })
  @ApiResponse({
    status: 201,
    description: 'Solicitação de serviço criada com sucesso com estado inicial pendente (pending).',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados de validação inválidos ou tentativa de solicitar serviço a si próprio.',
  })
  @ApiResponse({
    status: 404,
    description: 'Prestador de serviços ou perfil de cliente não encontrado.',
  })
  async createRequest(
    @Body() dto: CreateBookingRequestDto,
    @CurrentUser() user: JwtPayload,
    @Ip() ip: string,
  ) {
    return this.bookingsService.createRequest(dto, user, ip);
  }

  @Post('auto-match')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT, Role.ADMIN)
  @ApiOperation({
    summary: 'Procura automática e vinculação de prestador de serviços (Auto-matching estilo Yango)',
    description:
      'O cliente pesquisa por serviço e o sistema procura automaticamente o profissional mais adequado, ativo e melhor avaliado (reputação de 0 a 5 estrelas). Vincula cliente e prestador e inicia automaticamente uma sala de chat temporária para confirmação.',
  })
  @ApiResponse({
    status: 201,
    description: 'Prestador encontrado e vinculado com sucesso! Chat temporário aberto.',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados de pesquisa inválidos.',
  })
  @ApiResponse({
    status: 404,
    description: 'Nenhum prestador disponível encontrado para o termo pesquisado.',
  })
  async autoMatchAndBook(
    @Body() dto: AutoMatchBookingDto,
    @CurrentUser() user: JwtPayload,
    @Ip() ip: string,
  ) {
    return this.bookingsService.autoMatchAndBook(dto, user, ip);
  }

  @Patch(':id/accept')
  @UseGuards(RolesGuard)
  @Roles(Role.PROVIDER, Role.ADMIN)
  @ApiOperation({
    summary: 'Aceitar solicitação de serviço (Prestador)',
    description:
      'Permite ao prestador destinatário aceitar a solicitação pendente, mudando o estado para "accepted" e registando o timestamp de aceitação.',
  })
  @ApiParam({ name: 'id', description: 'UUID da solicitação de serviço' })
  @ApiResponse({
    status: 200,
    description: 'Solicitação aceite com sucesso.',
  })
  @ApiResponse({
    status: 400,
    description: 'A solicitação não está no estado pendente.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — apenas o prestador destinatário pode aceitar.',
  })
  async acceptRequest(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Ip() ip: string,
  ) {
    return this.bookingsService.acceptRequest(id, user, ip);
  }

  @Patch(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(Role.PROVIDER, Role.ADMIN)
  @ApiOperation({
    summary: 'Rejeitar solicitação de serviço (Prestador)',
    description:
      'Permite ao prestador destinatário recusar a solicitação informando o motivo.',
  })
  @ApiParam({ name: 'id', description: 'UUID da solicitação de serviço' })
  @ApiResponse({
    status: 200,
    description: 'Solicitação rejeitada com sucesso.',
  })
  @ApiResponse({
    status: 400,
    description: 'A solicitação não está no estado pendente.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — apenas o prestador destinatário pode rejeitar.',
  })
  async rejectRequest(
    @Param('id') id: string,
    @Body() dto: UpdateBookingStatusDto,
    @CurrentUser() user: JwtPayload,
    @Ip() ip: string,
  ) {
    return this.bookingsService.rejectRequest(id, dto.reason, user, ip);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Cancelar solicitação de serviço (Cliente ou Admin)',
    description:
      'Permite ao cliente que solicitou o serviço cancelar a solicitação antes da sua conclusão.',
  })
  @ApiParam({ name: 'id', description: 'UUID da solicitação de serviço' })
  @ApiResponse({
    status: 200,
    description: 'Solicitação cancelada com sucesso.',
  })
  @ApiResponse({
    status: 400,
    description: 'A solicitação já se encontra concluída ou cancelada.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — apenas o cliente solicitante pode cancelar.',
  })
  async cancelRequest(
    @Param('id') id: string,
    @Body() dto: UpdateBookingStatusDto,
    @CurrentUser() user: JwtPayload,
    @Ip() ip: string,
  ) {
    return this.bookingsService.cancelRequest(id, dto.reason, user, ip);
  }

  @Patch(':id/complete')
  @UseGuards(RolesGuard)
  @Roles(Role.PROVIDER, Role.ADMIN)
  @ApiOperation({
    summary: 'Marcar serviço como concluído (Prestador ou Admin)',
    description:
      'Permite ao prestador confirmar a conclusão bem-sucedida do serviço prestado.',
  })
  @ApiParam({ name: 'id', description: 'UUID da solicitação de serviço' })
  @ApiResponse({
    status: 200,
    description: 'Serviço marcado como concluído com sucesso.',
  })
  @ApiResponse({
    status: 400,
    description: 'Apenas solicitações com estado "accepted" podem ser concluídas.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — apenas o prestador associado pode concluir o serviço.',
  })
  async completeRequest(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Ip() ip: string,
  ) {
    return this.bookingsService.completeRequest(id, user, ip);
  }
}
