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
  HttpStatus,
  HttpCode,
  Param,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentService } from './payment.service';
import * as crypto from 'crypto';
import { AuthGuard } from '@nestjs/passport';
import { CreateInvoicePayeer } from './dto/create-invoice-payeer.dto';
import { DigisellerPaymentDto } from './dto/digiseller-payment-init.dto';
import axios from 'axios';
import { timestamp } from 'rxjs';

@Controller('v1/payment')
export class PaymentController {
  private readonly secretKey: string;
  private readonly digisellerApiKey: string;

  constructor(
    private readonly paymentService: PaymentService,
    private readonly configService: ConfigService,
  ) {
    const secret_key = this.configService.get<string>('WEBMONEY_SECRET_KEY');
    const digiseller_api_key =
      this.configService.get<string>('DIGISELLER_API_KEY');

    if (!secret_key) {
      throw new Error('Missing WEBMONEY_SECRET_KEY in config');
    }
    if (!digiseller_api_key) {
      throw new Error('Missing DIGISELLER_API_KEY in config');
    }

    this.secretKey = secret_key;
    this.digisellerApiKey = digiseller_api_key;
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
    await this.paymentService.successfulPayment(userId, amount);

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
    data.orderId = request.user.id;
    return this.paymentService.createInvoicePayeer(data);
  }

  @Post('payeer/success')
  async payeerSuccessfulPayment(@Request() request) {
    await this.paymentService.successfulPayment(
      request.body.m_orderid,
      Number(request.body.m_amount),
    );
  }

  @Get('history')
  @UseGuards(AuthGuard('jwt'))
  async getPaymentHistory(@Request() request) {
    return await this.paymentService.getPaymentHistory(request.user.id);
  }

  @Get('digiseller/success')
  @HttpCode(200)
  async digisellerPayment(@Query('uniquecode') code: string, @Request() req) {
    console.log('Received body:', code);
    console.log('Request', req);
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
    const payment = await axios.get(
      `https://api.digiseller.com/api/purchases/unique-code/${code}?token=${response.data.token}`,
    );
    console.log(payment.data);
    const options = payment.data.options;
    console.log(options[0].value, payment.data.amount_usd);

    await this.paymentService.successfulPayment(
      options[0].value,
      payment.data.amount_usd,
    );
    return { ok: true };
  }
}
