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
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const foundPayment = await this.prisma.payment.findFirst({
      where: {
        userId: userId,
        price: amount,
        method: method,
        createdAt: {
          gte: fourHoursAgo,
        },
      },
    });

    if (foundPayment) {
      console.log(
        '✅ Payment already exists in last 4 hours, skipping...',
        'time=',
        fourHoursAgo,
        'payment=',
        foundPayment,
      );
      return foundPayment;
    }
    if (method === 'DIGISELLER') {
      const foundByInv = await this.prisma.payment.findFirst({
        where: { inv },
      });
      if (foundByInv) {
        console.log(
          '✅ Payment already exists by inv, skipping...',
          'payment=',
          foundByInv,
        );
        return foundByInv;
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { balance: { increment: amount } },
    });

    return await this.prisma.payment.create({
      data: { userId: userId, price: amount, method: method, inv: inv },
    });
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
