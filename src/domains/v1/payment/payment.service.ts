import { Injectable, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { Axios } from 'axios';
import { PrismaService } from '../shared/prisma.service';
import { Payment } from '@prisma/client';
import { CreateInvoicePayeer } from './dto/create-invoice-payeer.dto';
import * as qs from 'qs';

@Injectable()
export class PaymentService {
  private readonly payeer: Axios;
  private readonly account: string;
  private readonly api_id: string;
  private readonly api_pass: string;
  private readonly merchant_id: string;

  constructor(
    private readonly configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.payeer = axios.create({
      baseURL: 'https://payeer.com/ajax/api/api.php',
    });
    this.account = configService.get<string>('PAYEER_ACCOUNT') as string;
    this.api_id = configService.get<string>('PAYEER_API_ID') as string;
    this.api_pass = configService.get<string>(
      'PAYEER_API_SECRET_KEY',
    ) as string;
    this.merchant_id = configService.get<string>(
      'PAYEER_MERCHANT_ID',
    ) as string;
  }

  async createInvoicePayeer(data: CreateInvoicePayeer): Promise<Object> {
    try {
      const response = await this.payeer.post(
        '?invoiceCreate',
        {
          account: this.account,
          apiId: this.api_id,
          apiPass: this.api_pass,
          action: 'invoiceCreate',
          m_shop: this.merchant_id,
          m_orderid: data.orderId,
          m_amount: data.amount,
          m_curr: 'USD',
          m_desc: 'Proxy.luxe buyer',
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      return { url: response.data.url };
    } catch (error) {
      throw new HttpException('Failed to create invoice', 500);
    }
  }

  async successfulPayment(
    userId: string,
    amount: number,
    method: string,
    inv?: number,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      console.error(
        `❌ User not found for payment: userId=${userId}, method=${method}, amount=${amount}, inv=${inv}`,
      );
      throw new HttpException(
        `User with id ${userId} not found. Cannot process payment.`,
        404,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const payment = await tx.payment.create({
          data: { userId, price: amount, method, inv },
        });
        await tx.user.update({
          where: { id: userId },
          data: { balance: { increment: amount } },
        });
        return payment;
      });
    } catch (error: unknown) {
      // P2002 = unique constraint violation on (inv, method) — duplicate webhook delivery.
      // Safe to treat as idempotent: return the original payment without crediting again.
      if (
        inv != null &&
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code === 'P2002'
      ) {
        const existing = await this.prisma.payment.findFirst({
          where: { inv, method },
        });
        console.log(
          `✅ [${method}] Duplicate webhook for inv=${inv}, skipping credit.`,
          'payment=',
          existing,
        );
        return existing;
      }
      throw error;
    }
  }

  async getPaymentHistory(userId: string) {
    const payments = await this.prisma.payment.findMany({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' },
    });
    const orders = await this.prisma.order.findMany({
      where: { status: 'PAID', userId: userId },
      select: {
        createdAt: true,
        totalPrice: true,
        id: true,
        status: true,
        proxySellerId: true,
        goal: true,
        type: true,
        orderId: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!payments && !orders) {
      throw new HttpException('History not found', 404);
    }
    return { payments: payments, orders: orders };
  }
}
