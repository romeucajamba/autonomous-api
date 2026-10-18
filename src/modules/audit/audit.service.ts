import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

export interface AuditLogParams {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Grava um evento de auditoria na base de dados de forma assíncrona e resiliente.
   * Não bloqueia ou derruba o fluxo principal em caso de erro na auditoria.
   */
  async log(params: AuditLogParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: params.userId || null,
          action: params.action,
          entity: params.entity,
          entityId: params.entityId || null,
          details: (params.details as any) || undefined,
          ipAddress: params.ipAddress || null,
        },
      });

      this.logger.log(
        `[AUDIT] Action: ${params.action} | Entity: ${params.entity}:${params.entityId || 'N/A'} | User: ${params.userId || 'ANON'} | IP: ${params.ipAddress || 'N/A'}`,
      );
    } catch (error) {
      this.logger.error(
        `[AUDIT_FAIL] Falha ao persistir log de auditoria: ${params.action}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
