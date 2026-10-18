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
import { ReviewsService } from './reviews.service.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { QueryReviewsDto } from './dto/query-reviews.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/rbac.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../generated/prisma/client.js';
import type { JwtPayload } from '../../common/types/jwt-payload.type.js';

@ApiTags('Avaliações & Reputação (Estilo Yango)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Avaliar prestador de serviços (0 a 5 estrelas) após a conclusão do trabalho',
    description:
      'Permite ao cliente atribuir uma nota de 0 a 5 estrelas, comentário e sinalização de recomendação ao prestador após a conclusão do serviço (estilo Yango/Uber). Atualiza automaticamente a reputação agregada do profissional.',
  })
  @ApiResponse({
    status: 201,
    description: 'Avaliação submetida com sucesso e reputação do prestador atualizada.',
  })
  @ApiResponse({
    status: 400,
    description: 'O serviço ainda não foi concluído ou a nota é inválida.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — apenas o cliente contratante pode submeter a avaliação.',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflito — esta solicitação de serviço já foi avaliada anteriormente.',
  })
  async createReview(
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: JwtPayload,
    @Ip() ip: string,
  ) {
    return this.reviewsService.createReview(dto, user, ip);
  }

  @Get('provider/:providerId')
  @ApiOperation({
    summary: 'Consultar reputação e avaliações recebidas por um prestador',
    description:
      'Retorna a média de estrelas (de 0 a 5), total de avaliações, taxa percentual de recomendação e comentários públicos recebidos pelo profissional.',
  })
  @ApiParam({ name: 'providerId', description: 'UUID do perfil do prestador' })
  @ApiResponse({
    status: 200,
    description: 'Métricas de reputação e avaliações retornadas com sucesso.',
  })
  async getProviderReviews(
    @Param('providerId') providerId: string,
    @Query() query: QueryReviewsDto,
  ) {
    return this.reviewsService.getProviderReviews(providerId, query);
  }

  @Get('my')
  @ApiOperation({
    summary: 'Consultar as próprias avaliações (dadas ou recebidas)',
    description:
      'Se o utilizador for prestador, retorna a sua reputação agregada e as avaliações recebidas. Se for cliente, retorna o histórico de avaliações que concedeu.',
  })
  @ApiResponse({
    status: 200,
    description: 'Histórico de avaliações retornado com sucesso.',
  })
  async getMyReviews(@CurrentUser() user: JwtPayload) {
    return this.reviewsService.getMyReviews(user);
  }

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Painel de Moderação: Listar todas as avaliações da plataforma (Exclusivo Administrador)',
    description:
      'Permite ao administrador inspecionar todas as avaliações, identificar notas baixas e filtrar denúncias de conduta imprópria.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de avaliações para moderação retornada com sucesso.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — requer privilégios de administrador (ADMIN).',
  })
  async adminListAllReviews(@Query() query: QueryReviewsDto) {
    return this.reviewsService.adminListAllReviews(query);
  }
}
