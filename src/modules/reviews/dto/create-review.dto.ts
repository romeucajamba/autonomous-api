import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReviewDto {
  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'UUID da solicitação de serviço concluída',
  })
  @IsString()
  @IsNotEmpty({ message: 'O identificador da solicitação (requestId) é obrigatório.' })
  requestId!: string;

  @ApiProperty({
    example: 5,
    description: 'Avaliação de 0 a 5 estrelas atribuída ao prestador (estilo Yango)',
    minimum: 0,
    maximum: 5,
  })
  @Type(() => Number)
  @IsInt({ message: 'A classificação deve ser um número inteiro de 0 a 5.' })
  @Min(0, { message: 'A nota mínima é 0.' })
  @Max(5, { message: 'A nota máxima é 5.' })
  rating!: number;

  @ApiPropertyOptional({
    example: 'Excelente profissional! Chegou na hora marcada e resolveu a fuga de água com muita rapidez.',
    description: 'Comentário ou avaliação qualitativa sobre o trabalho realizado',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'O comentário não pode exceder 1000 caracteres.' })
  comment?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Indica se o serviço foi bem executado',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  wellExecuted?: boolean = true;

  @ApiPropertyOptional({
    example: true,
    description: 'Indica se recomendaria este profissional a outros utilizadores',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  wouldRecommend?: boolean = true;

  @ApiPropertyOptional({
    example: false,
    description: 'Sinaliza comportamento inadequado ou infração para alerta imediato à moderação',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  inappropriateBehavior?: boolean = false;
}
