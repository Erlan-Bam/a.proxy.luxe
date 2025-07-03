import {
  Controller,
  Post,
  Query,
  Body,
  Response,
  Request,
  ParseFloatPipe,
  Get,
  UseGuards,
  HttpCode,
  Param,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentService } from './payment.service';
import * as crypto from 'crypto';
import { AuthGuard } from '@nestjs/passport';
import { CreateInvoicePayeer } from './dto/create-invoice-payeer.dto';
import axios from 'axios';
import { UserType } from '@prisma/client';

@Controller('v1/payment')
export class PaymentController {
  private readonly secretKey: string;
  private readonly payeerSecretKey: string;
  private readonly digisellerApiKey: string;

  constructor(
    private readonly paymentService: PaymentService,
    private readonly configService: ConfigService,
  ) {
    const secret_key = this.configService.get<string>('WEBMONEY_SECRET_KEY');
    const digiseller_api_key =
      this.configService.get<string>('DIGISELLER_API_KEY');
    const payeerSecretKey = this.configService.get<string>(
      'PAYEER_MERCHANT_SECRET_KEY',
    );

    if (!secret_key) {
      throw new Error('Missing WEBMONEY_SECRET_KEY in config');
    }
    if (!digiseller_api_key) {
      throw new Error('Missing DIGISELLER_API_KEY in config');
    }
    if (!payeerSecretKey) {
      throw new Error('Missing PAYEER_MERCHANT_SECRET_KEY in config');
    }
    this.secretKey = secret_key;
    this.digisellerApiKey = digiseller_api_key;
    this.payeerSecretKey = payeerSecretKey;
  }

  @Post('success')
  async successfulPayment(
    @Query('userId') userId: string,
    @Query('amount', ParseFloatPipe) amount: number,
    @Body() body,
    @Request() req,
    @Response() res,
  ) {
    if (!body || Object.keys(body).length === 0) {
      return res
        .status(200)
        .send({ message: 'Payment received but no data provided.' });
    }
    const {
      LMI_PAYEE_PURSE,
      LMI_PAYMENT_AMOUNT,
      LMI_PAYMENT_NO,
      LMI_SYS_INVS_NO,
      LMI_SYS_TRANS_NO,
      LMI_SYS_TRANS_DATE,
      LMI_PAYER_PURSE,
      LMI_PAYER_WM,
      LMI_MODE,
      LMI_HASH,
      LMI_HASH2,
    } = body;

    if (
      !LMI_PAYEE_PURSE ||
      !LMI_PAYMENT_AMOUNT ||
      !LMI_PAYMENT_NO ||
      !LMI_HASH
    ) {
      return res.status(400).send({ message: 'Invalid payment data' });
    }

    const signString = `${LMI_PAYEE_PURSE};${LMI_PAYMENT_AMOUNT};${LMI_PAYMENT_NO};${LMI_MODE};${LMI_SYS_INVS_NO};${LMI_SYS_TRANS_NO};${LMI_SYS_TRANS_DATE};${this.secretKey};${LMI_PAYER_PURSE};${LMI_PAYER_WM}`;
    const expectedHash = crypto
      .createHash('sha256')
      .update(signString, 'utf8')
      .digest('hex')
      .toUpperCase();

    if (expectedHash !== LMI_HASH2) {
      console.error('❌ Invalid WebMoney Signature! Possible fraud attempt.');
      return res.status(400).send({ message: 'Invalid signature' });
    }

    if (!userId || !amount) {
      return res.status(400).send({ message: 'Invalid payment data' });
    }
    await this.paymentService.successfulPayment(userId, amount, 'WEBMONEY');

    return res
      .status(200)
      .send({ message: 'Payment successful', userId, amount });
  }

  @Post('payeer/invoice')
  @UseGuards(AuthGuard('jwt'))
  async createInvoicePayeer(
    @Body() data: CreateInvoicePayeer,
    @Request() request,
  ) {
    data.orderId = `${request.user.id}A${Math.floor(100 + Math.random() * 900)}`;
    return this.paymentService.createInvoicePayeer(data);
  }

  @Post('payeer/success')
  async payeerSuccessfulPayment(@Request() req) {
    const body = req.body;

    // Формирование хеша
    const hashData = [
      body.m_operation_id,
      body.m_operation_ps,
      body.m_operation_date,
      body.m_operation_pay_date,
      body.m_shop,
      body.m_orderid,
      body.m_amount,
      body.m_curr,
      body.m_desc,
      body.m_status,
    ];

    if (body.m_params) {
      hashData.push(body.m_params);
    }

    hashData.push(this.payeerSecretKey);

    const sign = crypto
      .createHash('sha256')
      .update(hashData.join(':'))
      .digest('hex')
      .toUpperCase();

    // Проверка подписи и статуса
    if (sign === body.m_sign && body.m_status === 'success') {
      const orderId = body.m_orderid.split('A')[0];

      await this.paymentService.successfulPayment(
        orderId,
        Number(body.m_amount),
        'PAYEER',
      );

      return `${body.m_orderid}|success`;
    }

    return `${body.m_orderid}|error`;
  }

  @Get('history')
  @UseGuards(AuthGuard('jwt'))
  async getPaymentHistory(@Request() request) {
    return await this.paymentService.getPaymentHistory(request.user.id);
  }

  @Get('digiseller/success')
  @HttpCode(200)
  async digisellerPayment(
    @Query('uniquecode') code: string,
    @Request() req,
    @Response() res,
  ) {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHash('sha256')
      .update('' + this.digisellerApiKey + timestamp)
      .digest('hex');
    const response = await axios.post(
      'https://api.digiseller.com/api/apilogin',
      {
        seller_id: 668379,
        timestamp: Math.floor(Date.now() / 1000),
        sign: signature,
      },
    );
    console.log('digiseller', code);
    let userId: string;
    let amount: number;
    let inv: number;
    let lang: string = 'en';
    try {
      const payment = await axios.get(
        `https://api.digiseller.com/api/purchases/unique-code/${code}?token=${response.data.token}`,
      );
      const options = payment.data.options;

      userId = options[0].value;
      amount = payment.data.amount_usd;
      inv = payment.data.inv;
      lang = payment.data.lang;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.log('Axios error:', error.response?.data || error.message);
      } else {
        console.log('Unexpected error:', error);
      }
      return res.status(200).json({ message: 'Failed' });
    }
    if (userId && amount) {
      await this.paymentService.successfulPayment(
        userId,
        amount,
        'DIGISELLER',
        inv,
      );
      return res.redirect(
        `https://proxy.luxe/${lang.startsWith('ru') ? 'ru' : 'en'}/personal-account`,
      );
    }
    return res.status(200).json({ message: 'Failed' });
  }

  @Get('admin/get-history/:userId')
  @UseGuards(AuthGuard('jwt'))
  async getAdminPaymentHistory(
    @Param('userId') userId: string,
    @Request() req,
  ) {
    if (req.user.type !== UserType.ADMIN) {
      throw new HttpException('Admins only: access denied.', 403);
    }
    return await this.paymentService.getPaymentHistory(userId);
  }
}
