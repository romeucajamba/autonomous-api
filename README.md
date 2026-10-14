# API de Prestadores de Serviço

API backend para uma plataforma de autonomous que liga clientes a prestadores de serviço (canalizadores, electricistas, estucadores, entre outros), cobrindo todo o ciclo: autenticação, perfis, solicitação e agendamento de serviços, pagamentos, carteira digital, saques, reembolsos, cartão virtual e gestão administrativa/financeira.

---

## Índice

1. [Visão geral](#visão-geral)
2. [Stack tecnológica](#stack-tecnológica)
3. [Arquitectura](#arquitectura)
4. [Estrutura de pastas](#estrutura-de-pastas)
5. [Pré-requisitos](#pré-requisitos)
6. [Configuração do ambiente](#configuração-do-ambiente)
7. [A correr o projecto](#a-correr-o-projecto)
8. [Base de dados e migrations](#base-de-dados-e-migrations)
9. [Scripts disponíveis](#scripts-disponíveis)
10. [Convenções de código](#convenções-de-código)
11. [Autenticação e autorização](#autenticação-e-autorização)
12. [Filas e processamento assíncrono](#filas-e-processamento-assíncrono)
13. [Segurança](#segurança)
14. [Testes](#testes)
15. [Observabilidade](#observabilidade)
16. [Fluxo de contribuição](#fluxo-de-contribuição)
17. [Deploy](#deploy)
18. [Recursos adicionais](#recursos-adicionais)

---

## Visão geral

Esta API suporta uma plataforma de dois lados:

- **Clientes** — pessoas que procuram e contratam prestadores de serviço.
- **Prestadores** — profissionais e empresas que oferecem serviços numa ou mais categorias (canalização, electricidade, estuque, etc.).

O objectivo é resolver problemas reais do dia-a-dia: encontrar um prestador de confiança rapidamente, pagar de forma segura, e dar a ambas as partes um histórico de reputação (avaliações) que sustente a confiança na plataforma.

A API também serve uma **área administrativa** com gestão de utilizadores, disputas, e um módulo de **finanças** para acompanhamento contabilístico (receitas, comissões, saques, reembolsos, reconciliação).

O backlog completo de funcionalidades e a respectiva estimativa de complexidade está documentado separadamente (ver [Recursos adicionais](#recursos-adicionais)).

---

## Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Linguagem | TypeScript |
| Framework | NestJS |
| Base de dados | PostgreSQL |
| ORM | Prisma |
| Cache / Filas | Redis + BullMQ |
| Autenticação | JWT (access + refresh token) |
| Gestor de pacotes | pnpm |
| Documentação da API | Swagger / OpenAPI |
| Hospedagem | Coolify (self-hosted) |

---

## Arquitectura

A API segue uma **arquitectura modular em camadas**, onde cada domínio de negócio (ex.: `users`, `providers`, `bookings`, `payments`) é um módulo NestJS auto-contido, e cada módulo respeita sempre a mesma sequência de responsabilidades:

```
Cliente (app / dashboard)
        │
        ▼
   Controllers        → rotas HTTP, validação de entrada (DTOs)
        │
        ▼
    Services          → regras de negócio, orquestração
        │       │
        │       ├──► Filas (BullMQ + Redis)       → trabalho assíncrono
        │       └──► APIs externas (AGT, gateway de pagamento)
        ▼
  Repositories         → acesso a dados (Prisma)
        │
        ▼
    PostgreSQL
```

**Regras da arquitectura:**

- Um **Controller** nunca contém lógica de negócio — apenas recebe o pedido, valida o DTO, e delega ao `Service`.
- Um **Service** nunca acede directamente ao Prisma — passa sempre por um `Repository`, o que mantém a lógica de acesso a dados isolada e testável.
- Trabalho pesado ou não crítico ao tempo de resposta (envio de notificações, reconciliação, chamadas a serviços externos lentos) é delegado a **filas** (BullMQ), nunca executado de forma síncrona dentro do pedido HTTP.
- Qualquer chamada a um sistema externo (gateway de pagamento, AGT, SMS) vive atrás de um **client/adapter dedicado**, nunca espalhada directamente pelos services.

---

## Estrutura de pastas

```
src/
├── main.ts
├── app.module.ts
│
├── common/                      # transversal a toda a API
│   ├── decorators/
│   ├── filters/                 # excepções globais
│   ├── guards/                  # RBAC, autenticação
│   ├── interceptors/            # logging, timeout, transform
│   ├── pipes/                   # validação global
│   └── dto/                     # DTOs partilhados (paginação, etc.)
│
├── config/
│   ├── configuration.ts
│   ├── validation.schema.ts     # valida o .env no arranque
│   └── database.config.ts
│
├── infra/
│   ├── prisma/
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts
│   ├── redis/
│   └── queues/                  # configuração BullMQ
│
├── modules/
│   ├── auth/
│   ├── users/
│   ├── providers/                # perfis de prestadores
│   ├── service-categories/       # categorias e serviços
│   ├── bookings/                 # solicitação e agendamento
│   ├── reviews/                  # avaliações
│   ├── payments/
│   ├── wallet/                   # saldo e carteira
│   ├── withdrawals/               # saques
│   ├── refunds/
│   ├── virtual-card/
│   ├── disputes/
│   ├── notifications/
│   ├── chat/
│   ├── finance/                  # relatórios financeiros (admin)
│   └── admin/                    # gestão administrativa
│
├── workers/                      # consumidores das filas (BullMQ)
│
└── shared/
    ├── interfaces/
    └── utils/
```

Cada módulo dentro de `modules/` segue internamente o mesmo padrão:

```
modules/users/
├── users.module.ts
├── users.controller.ts
├── users.service.ts
├── users.repository.ts
├── dto/
│   ├── create-user.dto.ts
│   └── update-user.dto.ts
└── entities/                     # tipos/interfaces do domínio, se aplicável
```

**Ao criar um módulo novo**, segue sempre esta estrutura — mantém o projecto previsível para qualquer pessoa que entre num ficheiro pela primeira vez.

---

## Pré-requisitos

- Node.js (versão LTS mais recente)
- pnpm (`npm install -g pnpm`)
- PostgreSQL (local ou via Docker)
- Redis (local ou via Docker)
- Acesso às credenciais dos serviços externos (gateway de pagamento, SMS/OTP) para desenvolvimento

---

## Configuração do ambiente

1. Clonar o repositório e instalar dependências:

```bash
pnpm install
```

2. Copiar o ficheiro de exemplo de variáveis de ambiente:

```bash
cp .env.example .env
```

3. Preencher o `.env` com os valores correctos. Variáveis principais:

```dotenv
# Base de dados
DATABASE_URL="postgresql://user:password@localhost:5432/nome_db"

# Redis
REDIS_URL="redis://localhost:6379"

# Autenticação
JWT_SECRET=""
JWT_ACCESS_EXPIRATION="15m"
JWT_REFRESH_EXPIRATION="7d"

# Gateway de pagamento
PAYMENT_GATEWAY_URL=""
PAYMENT_GATEWAY_API_KEY=""

# Notificações
SMS_PROVIDER_API_KEY=""
EMAIL_PROVIDER_API_KEY=""

# Ambiente
NODE_ENV="development"
PORT=3000
```

> Nunca commitar o ficheiro `.env`. Segredos novos devem ser comunicados à equipa por um canal seguro, nunca partilhados em texto simples no chat ou no repositório.

---

## A correr o projecto

```bash
# Modo desenvolvimento (watch mode)
pnpm run start:dev

# Build de produção
pnpm run build
pnpm run start:prod

# Linting
pnpm run lint

# Formatação
pnpm run format
```

A documentação interactiva da API (Swagger) fica disponível, em desenvolvimento, em:

```
http://localhost:3000/api/docs
```

---

## Base de dados e migrations

O projecto usa **Prisma** como ORM. Fluxo de trabalho:

```bash
# Criar uma nova migration a partir de alterações no schema.prisma
pnpm exec prisma migrate dev --name nome_descritivo_da_mudanca

# Aplicar migrations pendentes (usado em produção/CI)
pnpm exec prisma migrate deploy

# Ver o estado das migrations
pnpm exec prisma migrate status

# Gerar o Prisma Client após alterações no schema
pnpm exec prisma generate

# Abrir o Prisma Studio (interface visual da base de dados)
pnpm exec prisma studio
```

**Regras importantes:**

- `migrate dev` é **apenas para desenvolvimento local**. Nunca correr em produção.
- `migrate deploy` é o único comando usado em produção — aplica apenas migrations já existentes e testadas, sem gerar nada novo.
- Toda migration deve ser **revista antes de merge**: confirmar que não existem instruções destrutivas (`DROP`, `TRUNCATE`) não intencionais.
- Nunca editar manualmente uma migration já aplicada em qualquer ambiente partilhado (staging/produção). Se for necessário corrigir algo, cria uma nova migration.
- Antes de aplicar migrations em produção, fazer sempre backup da base de dados.

---

## Scripts disponíveis

| Script | Descrição |
|---|---|
| `pnpm run start:dev` | Arranca a API em modo watch |
| `pnpm run build` | Compila o projecto para `dist/` |
| `pnpm run start:prod` | Arranca a API a partir do build |
| `pnpm run lint` | Corre o ESLint |
| `pnpm run format` | Formata o código com Prettier |
| `pnpm run test` | Corre os testes unitários |
| `pnpm run test:e2e` | Corre os testes end-to-end |
| `pnpm run test:cov` | Corre os testes com relatório de cobertura |

---

## Convenções de código

- **Nomenclatura de ficheiros:** `kebab-case`, seguindo o padrão NestJS (`users.service.ts`, `create-booking.dto.ts`).
- **DTOs obrigatórios** em toda a entrada de dados, validados com `class-validator`. Nunca aceitar um `body`/`query` sem tipo e validação explícitos.
- **Nunca usar `any`** sem justificação comentada no código.
- **Separação de DTOs por contexto** quando as regras de validação diferem — por exemplo, criar um rascunho de fatura tem regras diferentes de emitir essa fatura (ver módulo de facturação como referência).
- **Services nunca lançam exceções HTTP genéricas** — usar as exceções do NestJS (`BadRequestException`, `NotFoundException`, `ConflictException`, etc.) para que o filtro global as traduza correctamente.
- **Transacções de base de dados** (`prisma.$transaction`) são obrigatórias em qualquer operação que altere mais do que uma tabela de forma atómica (ex.: debitar carteira + registar transacção).
- **Commits em português ou inglês, mas consistentes dentro do mesmo PR.**
- **Nunca commitar segredos, chaves ou tokens**, mesmo em ficheiros de teste.

---

## Autenticação e autorização

- Autenticação via **JWT**, com `access token` de curta duração e `refresh token` de longa duração.
- Autorização baseada em **papéis (RBAC)**: `cliente`, `prestador`, `admin`, `financeiro`.
- Rotas protegidas usam o `AuthGuard` + `RolesGuard`, combinados através do decorator `@Roles(...)`.
- Rotas administrativas sensíveis (ex.: alterar estado de verificação de um prestador, aprovar saques de valor elevado) exigem sempre o papel `admin`, nunca apenas autenticação.

---

## Filas e processamento assíncrono

Processos que não devem bloquear o tempo de resposta de um pedido HTTP correm em **workers** consumidos via BullMQ:

- Envio de notificações (push, email, SMS)
- Reconciliação financeira periódica
- Chamadas a serviços externos lentos ou instáveis (ex.: emissão fiscal)
- Processamento de webhooks recebidos de terceiros

Toda tarefa colocada em fila deve ser **idempotente** — isto é, correr a mesma tarefa duas vezes (por causa de um retry) não pode duplicar efeitos (ex.: duplicar um pagamento).

---

## Segurança

Práticas obrigatórias em todo o projecto:

- **Rate limiting** global e por endpoint sensível (login, registo, recuperação de password).
- **Helmet** configurado com headers de segurança (CSP, HSTS, X-Frame-Options).
- **CORS** restrito às origens autorizadas — nunca `*` em produção.
- **Validação estrita de entrada** em 100% dos endpoints (DTOs com whitelist, sem campos extra aceites).
- **Nunca usar SQL concatenado.** Toda a query passa pelo Prisma; qualquer `$queryRaw` exige revisão e uso de parâmetros tipados.
- **Protecção contra brute force** em login e OTP (bloqueio progressivo, limite de tentativas).
- **Idempotência obrigatória** em operações financeiras (pagamentos, saques, reembolsos).
- **Segredos nunca em código** — sempre via variáveis de ambiente ou gestor de segredos.
- **Toda alteração sensível é auditada** (quem fez, quando, o que mudou) — ver tabela `audit_logs`.

---

## Testes

- **Testes unitários** obrigatórios para `services` com lógica de negócio não-trivial.
- **Testes de integração** obrigatórios para fluxos críticos: autenticação, pagamento, matching de prestadores, disputas.
- Testes correm automaticamente no pipeline de CI antes de qualquer merge para a branch principal.
- Mocks de serviços externos (gateway de pagamento, AGT) devem viver em `test/mocks/`, nunca chamar sistemas reais em testes automatizados.

---

## Observabilidade

- Logging estruturado em formato JSON, com `request_id` e `tenant_id`/`user_id` presentes em todas as entradas relevantes.
- Health checks expostos para verificação de dependências (base de dados, Redis, filas).
- Métricas de aplicação expostas para monitorização (latência por rota, taxa de erro, throughput).
- Qualquer incidente em produção deve ser rastreável a partir dos logs sem necessidade de reproduzir localmente.

---

## Fluxo de contribuição

1. Criar uma branch a partir de `main`, com nome descritivo: `feature/nome-da-funcionalidade`, `fix/descricao-do-bug`.
2. Garantir que o código passa em `pnpm run lint` e `pnpm run test` antes de abrir o PR.
3. Descrever no PR: o que mudou, porquê, e como testar.
4. Qualquer alteração ao `schema.prisma` deve vir acompanhada da migration correspondente, já testada localmente.
5. PRs que tocam em pagamentos, carteira, saques ou reembolsos precisam de pelo menos uma revisão adicional focada em segurança/idempotência antes do merge.
6. Após aprovação, squash merge para manter o histórico da `main` limpo.

---

## Deploy

- Hospedagem via **Coolify**, com build a partir do Dockerfile/Nixpacks do repositório.
- Migrations em produção correm **sempre via `prisma migrate deploy`**, nunca `db push` nem `migrate dev`.
- Antes de qualquer deploy que inclua migrations, confirmar backup recente da base de dados de produção.
- Variáveis de ambiente de produção são geridas directamente no painel do Coolify — nunca replicadas em ficheiros no repositório.

---

## Recursos adicionais

- Backlog completo de funcionalidades e respectiva complexidade: *(ligação para o documento do backlog)*
- Diagrama de arquitectura em camadas: ver secção [Arquitectura](#arquitectura)
- Documentação interactiva da API: `/api/docs` (Swagger), disponível em cada ambiente

---
