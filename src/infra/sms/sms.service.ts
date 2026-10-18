import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { env } from '../../config/env.config.js';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly ombalaClient: AxiosInstance;
  private readonly ombalaFrom: string;

  constructor(private readonly configService: ConfigService) {
    const baseURL =
      this.configService.get<string>('OMBALA_BASE_URL') ||
      env.OMBALA_BASE_URL
    const token =
      this.configService.get<string>('OMBALA_API_TOKEN') ||
      env.OMBALA_API_TOKEN;
    this.ombalaFrom =
      this.configService.get<string>('OMBALA_FROM') ||
      env.OMBALA_FROM

    this.ombalaClient = axios.create({
      baseURL,
      timeout: 10000,
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Normaliza números telefónicos para o formato padrão esperado pelo Gateway Ombala (Angola)
   * Remove +244, 244, espaços, traços e zeros à esquerda, garantindo o formato 9XXXXXXXX
   */
  normalizePhoneNumber(phone: string): string {
    return phone
      .replace(/[\+\s\-()]/g, '')
      .replace(/^0+/, '')
      .replace(/^244/, '');
  }

  /**
   * Envia uma mensagem SMS avulsa através do Gateway Ombala
   */
  async sendSms(phone: string, message: string): Promise<boolean> {
    const normalizedNumber = this.normalizePhoneNumber(phone);

    try {
      this.logger.log(
        `[SMS_OUTBOUND] A enviar SMS para ${normalizedNumber} (Remetente: ${this.ombalaFrom})...`,
      );

      const response = await this.ombalaClient.post('/v1/messages', {
        message,
        from: this.ombalaFrom,
        to: normalizedNumber,
      });

      this.logger.log(
        `[SMS_SENT_SUCCESS] SMS entregue com sucesso à Ombala para ${normalizedNumber}. Status HTTP: ${response.status}`,
      );
      return true;
    } catch (error: any) {
      const errorData = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      this.logger.error(
        `[SMS_ERROR] Falha ao enviar SMS para ${normalizedNumber} via Ombala: ${errorData} (Status: ${error.response?.status || 'N/A'})`,
      );
      return false;
    }
  }

  /**
   * Envia código de ativação de 6 dígitos via SMS para confirmação e ativação da conta
   */
  async sendActivationCode(phone: string, code: string, name?: string): Promise<boolean> {
    const displayName = name ? ` ${name.split(' ')[0]}` : '';
    const message = `[Autonomous] Ola${displayName}! O seu codigo de confirmacao para ativar a sua conta e: ${code}. Valido por 10 minutos.`;

    // Log visível no terminal para facilidade de desenvolvimento, depuração e testes
    this.logger.log(
      `[SMS_ACTIVATION_CODE] Código de 6 dígitos gerado para ${phone}: [ ${code} ]`,
    );

    return this.sendSms(phone, message);
  }

  /**
   * Envia SMS em lote (Bulk SMS) com controle de taxa e lotes
   */
  async sendBulkSms(
    subject: string,
    message: string,
    phoneNumbers: string[],
  ): Promise<{ successful: number; failed: number }> {
    const validNumbers = phoneNumbers.filter(
      (t) => t !== null && t !== undefined && t.trim() !== '',
    );

    if (!validNumbers.length) {
      this.logger.warn('[SMS] Nenhum número fornecido para envio em lote.');
      return { successful: 0, failed: 0 };
    }

    const finalMessage = `[Autonomous] - ${subject}\n\n${message}`;
    const BATCH_SIZE = 10;
    const PAUSA_MS = 500;
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < validNumbers.length; i += BATCH_SIZE) {
      const lote = validNumbers.slice(i, i + BATCH_SIZE);

      const resultados = await Promise.allSettled(
        lote.map((telefone) => this.sendSms(telefone, finalMessage)),
      );

      resultados.forEach((res) => {
        if (res.status === 'fulfilled' && res.value === true) {
          successful++;
        } else {
          failed++;
        }
      });

      if (i + BATCH_SIZE < validNumbers.length) {
        await new Promise((resolve) => setTimeout(resolve, PAUSA_MS));
      }
    }

    this.logger.log(
      `[SMS_BULK_COMPLETED] Envio em lote finalizado: ${successful} sucessos, ${failed} falhas.`,
    );

    return { successful, failed };
  }
}
