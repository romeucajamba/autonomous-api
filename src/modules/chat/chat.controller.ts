import {
  Controller,
  Get,
  Post,
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
import { ChatService } from './chat.service.js';
import { SendMessageDto } from './dto/send-message.dto.js';
import { QueryChatMessagesDto } from './dto/query-chat.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/rbac.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../generated/prisma/client.js';
import type { JwtPayload } from '../../common/types/jwt-payload.type.js';

@ApiTags('Chat Temporário & Mensagens')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('rooms')
  @ApiOperation({
    summary: 'Listar conversas e salas de chat ativas do utilizador',
    description:
      'Retorna as salas de chat temporárias abertas vinculadas a serviços em andamento. Chats encerrados por soft-delete após a finalização do serviço não são exibidos nesta listagem.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de salas ativas retornada com sucesso.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado — token JWT ausente ou inválido.',
  })
  async getMyRooms(@CurrentUser() user: JwtPayload) {
    return this.chatService.getMyRooms(user);
  }

  @Get('rooms/:roomId')
  @ApiOperation({
    summary: 'Consultar detalhes de uma sala de chat temporária',
    description:
      'Retorna os dados da sala, status da solicitação, informações do cliente e do prestador.',
  })
  @ApiParam({ name: 'roomId', description: 'UUID da sala de chat' })
  @ApiResponse({
    status: 200,
    description: 'Detalhes da sala retornados com sucesso.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — utilizador não é participante da sala.',
  })
  @ApiResponse({
    status: 404,
    description: 'Sala de chat não encontrada ou encerrada.',
  })
  async getRoomById(
    @Param('roomId') roomId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.getRoomById(roomId, user);
  }

  @Get('rooms/:roomId/messages')
  @ApiOperation({
    summary: 'Listar mensagens trocadas na sala de chat',
    description:
      'Retorna o histórico de mensagens da conversa entre o cliente e o prestador para alinhamento de detalhes e confirmação do serviço.',
  })
  @ApiParam({ name: 'roomId', description: 'UUID da sala de chat' })
  @ApiResponse({
    status: 200,
    description: 'Lista de mensagens retornada com sucesso.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado.',
  })
  @ApiResponse({
    status: 404,
    description: 'Sala não encontrada.',
  })
  async getMessages(
    @Param('roomId') roomId: string,
    @Query() query: QueryChatMessagesDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.getMessages(roomId, query, user);
  }

  @Post('rooms/:roomId/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Enviar mensagem no chat temporário',
    description:
      'Permite ao cliente ou prestador enviar mensagens para acertar detalhes do agendamento. Se o serviço já tiver sido finalizado e o chat sofrer soft-delete, a requisição é rejeitada.',
  })
  @ApiParam({ name: 'roomId', description: 'UUID da sala de chat' })
  @ApiResponse({
    status: 201,
    description: 'Mensagem enviada e persistida com sucesso.',
  })
  @ApiResponse({
    status: 400,
    description: 'Chat temporário encerrado por finalização do serviço ou mensagem vazia.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — utilizador não pertence à conversa.',
  })
  async sendMessage(
    @Param('roomId') roomId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: JwtPayload,
    @Ip() ip: string,
  ) {
    return this.chatService.sendMessage(roomId, dto, user, ip);
  }

  @Get('admin/rooms')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Painel de Moderação: Listar todas as salas de chat (Exclusivo Administrador)',
    description:
      'Permite aos administradores monitorar e listar todas as conversas do sistema (incluindo salas que sofreram soft-delete após a finalização do serviço).',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista completa de conversas para auditoria administrativa.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — requer privilégios de administrador (ADMIN).',
  })
  async adminListAllRooms(@Query() query: QueryChatMessagesDto) {
    return this.chatService.adminListAllRooms(query);
  }

  @Get('admin/rooms/:roomId/audit')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Painel de Moderação: Inspecionar mensagens arquivadas (Exclusivo Administrador)',
    description:
      'Permite a consulta e auditoria integral de todas as mensagens de qualquer chat (inclusive após o soft-delete) para resolução de litígios, disputas e controlo de qualidade.',
  })
  @ApiParam({ name: 'roomId', description: 'UUID da sala de chat' })
  @ApiResponse({
    status: 200,
    description: 'Histórico auditado de mensagens retornado com sucesso.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — requer função ADMIN.',
  })
  async adminGetRoomMessages(
    @Param('roomId') roomId: string,
    @Query() query: QueryChatMessagesDto,
  ) {
    return this.chatService.adminGetRoomMessages(roomId, query);
  }
}
