import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Ip,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CardsService } from './cards.service.js';
import { CreateCardDto } from './dto/create-card.dto.js';
import { UpdateCardDto } from './dto/update-card.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Cartões & Carteira')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar todos os cartões e carteira do utilizador logado',
    description:
      'Retorna a lista de cartões (físicos e virtuais) vinculados à conta do utilizador, com o cartão padrão/principal no topo.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de cartões retornada com sucesso.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado — token JWT ausente ou expirado.',
  })
  async findAll(@CurrentUser('sub') userId: string) {
    return this.cardsService.findAll(userId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar detalhes de um cartão específico',
    description:
      'Retorna as informações do cartão pelo ID, garantindo que pertence ao utilizador autenticado.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID único do cartão',
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
  })
  @ApiResponse({
    status: 200,
    description: 'Cartão retornado com sucesso.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado.',
  })
  @ApiResponse({
    status: 404,
    description: 'Cartão não encontrado.',
  })
  async findOne(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ) {
    return this.cardsService.findOne(id, userId);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Adicionar novo cartão de pagamento',
    description:
      'Cadastra um novo cartão (Multicaixa, Visa ou Mastercard). Por segurança, armazena apenas o número mascarado e os últimos 4 dígitos.',
  })
  @ApiResponse({
    status: 201,
    description: 'Cartão adicionado com sucesso.',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados de validação do cartão inválidos.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado.',
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiadas tentativas de adicionar cartões. Aguarde um minuto.',
  })
  async create(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateCardDto,
    @Ip() ip: string,
  ) {
    return this.cardsService.create(userId, dto, ip);
  }

  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar informações de um cartão',
    description:
      'Permite atualizar o nome impresso, ativar/desativar ou definir o cartão como principal.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID do cartão a atualizar',
  })
  @ApiResponse({
    status: 200,
    description: 'Cartão atualizado com sucesso.',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado.',
  })
  @ApiResponse({
    status: 404,
    description: 'Cartão não encontrado.',
  })
  async update(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCardDto,
    @Ip() ip: string,
  ) {
    return this.cardsService.update(id, userId, dto, ip);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Patch(':id/default')
  @ApiOperation({
    summary: 'Definir cartão como método de pagamento padrão',
    description:
      'Marca o cartão especificado como padrão e remove o status de padrão dos demais cartões do utilizador.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID do cartão a ser definido como padrão',
  })
  @ApiResponse({
    status: 200,
    description: 'Cartão definido como padrão com sucesso.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado.',
  })
  @ApiResponse({
    status: 404,
    description: 'Cartão não encontrado.',
  })
  async setDefault(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Ip() ip: string,
  ) {
    return this.cardsService.setDefault(id, userId, ip);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remover cartão da conta',
    description:
      'Exclui o cartão vinculado. Se o cartão excluído for o padrão, define o cartão ativo restante mais recente como o novo padrão.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID do cartão a remover',
  })
  @ApiResponse({
    status: 200,
    description: 'Cartão removido com sucesso.',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado.',
  })
  @ApiResponse({
    status: 404,
    description: 'Cartão não encontrado.',
  })
  async delete(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Ip() ip: string,
  ) {
    return this.cardsService.delete(id, userId, ip);
  }
}
