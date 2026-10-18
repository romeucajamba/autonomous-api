import { IsOptional, IsString, IsUrl } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: 'Manuel António da Silva',
    description: 'Nome atualizado do utilizador',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: '923999888',
    description: 'Novo número de telefone',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    example: 'Especialista em instalações elétricas industriais e reparação de quadros elétricos.',
    description: 'Biografia profissional',
  })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({
    example: 'Electricidade',
    description: 'Área de trabalho principal',
  })
  @IsOptional()
  @IsString()
  workArea?: string;

  @ApiPropertyOptional({
    example: 'Serviços de manutenção preventiva e corretiva com garantia.',
    description: 'Descrição detalhada dos serviços prestados',
  })
  @IsOptional()
  @IsString()
  workDescription?: string;

  @ApiPropertyOptional({
    example: '3plus',
    description: 'Tempo de experiência ("lt1", "2", "3plus")',
  })
  @IsOptional()
  @IsString()
  experienceTime?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.autonomous.app/avatars/user-123.jpg',
    description: 'URL pública da imagem de perfil (avatar)',
  })
  @IsOptional()
  @IsUrl({}, { message: 'O avatarUrl deve ser um URL válido.' })
  avatarUrl?: string;

  @ApiPropertyOptional({
    example: 'Olá! Recebi o seu pedido e entrarei em contacto nos próximos 15 minutos.',
    description: 'Mensagem padrão enviada automaticamente ao aceitar um pedido de serviço',
  })
  @IsOptional()
  @IsString()
  autoAcceptMessage?: string;
}
