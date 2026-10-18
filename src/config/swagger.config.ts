import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Autonomous API')
    .setDescription(
      'Documentação da API da plataforma de autonomous que conecta clientes a prestadores de serviços (canalização, eletricidade, pintura, etc.), com autenticação JWT, perfis, agendamentos, pagamentos (Stripe & GPay) e saques.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Introduza o token JWT gerado após o login (ex.: Bearer eyJhbGci...)',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag(
      'Autenticação & Sessões',
      'Registo de clientes e prestadores, login, renovação de tokens (refresh), recuperação de conta/senha esquecida e encerramento de sessão (logout)',
    )
    .addTag(
      'Utilizadores & Perfis',
      'Consulta e atualização de dados de conta e perfil (PATCH /users/me), atualização de perfil e alteração de palavra-passe (PATCH /users/me/password)',
    )
    .addTag(
      'Cartões & Carteira',
      'Gestão de cartões e carteira virtual dos utilizadores (criação automática no registo, listagem, inclusão, atualização e exclusão)',
    )
    .addTag(
      'Administração - Gestão de Contas',
      'Painel administrativo exclusivo para administradores: listagem com filtros, criação, ativação, bloqueio e suspensão de contas de clientes, prestadores e financeiro',
    )
    .addTag(
      'Categorias de Serviços',
      'CRUD oficial de categorias de serviços (gestão exclusiva de administradores e visualização por clientes e prestadores)',
    )
    .addTag(
      'Catálogo & Serviços',
      'Serviços e catálogo dos profissionais (prestadores criam para si, administradores criam e vinculam a prestadores, clientes e administradores consultam)',
    )
    .addTag(
      'Prestadores & Descoberta',
      'Descoberta de profissionais aprovados com filtros por especialidade e área de trabalho',
    )
    .addTag(
      'Solicitações de Serviços (Bookings)',
      'Solicitação direta de serviços (sem matching automático geográfico), aceitação, rejeição, cancelamento e conclusão de trabalhos',
    )
    .addTag(
      'Chat Temporário & Mensagens',
      'Comunicação temporária entre cliente e prestador durante o serviço. Conversa ativa com soft-delete automático após conclusão do serviço e histórico integral mantido para moderação/auditoria de administradores',
    )
    .addTag(
      'Avaliações & Reputação (Estilo Yango)',
      'Classificação e avaliação do prestador pelo cliente de 0 a 5 estrelas após conclusão do serviço, com atualização em tempo real de média ponderada, taxa de recomendação e alerta de conduta indevida',
    )
    .addTag(
      'Saúde do Sistema',
      'Verificação de conectividade e status dos serviços dependentes (PostgreSQL e Redis)',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      filter: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'Autonomous API — Swagger Documentation',
  });
}
