import { HttpException, Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import * as nodemailer from 'nodemailer';
import { PaymentStatus, User, UserType } from '@prisma/client';
import { AddBalanceDTO } from './dto/add-balance.dto';
import { RemoveBalanceDTO } from './dto/remove-balance.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { BanUserDTO } from './dto/ban-user.dto';
import { AddPromocodeDTO } from './dto/add-promo.dto';
import { SupportMessageDto } from './dto/send-support.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AddAuthDto } from './dto/add-auth.dto';
import { ProductService } from 'src/domains/product/product.service';
import { PayoutPartner } from './dto/payout-partner.dto';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private productService: ProductService,
  ) {}

  async checkValidCoupon(promocode: string): Promise<Object> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: promocode },
    });

    if (!coupon) {
      throw new HttpException('Coupon not found', 400);
    }

    return { isValid: coupon.limit > 0, coupon: coupon };
  }

  async generateVerificationCode(): Promise<string> {
    const characters = '0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
  }
  async sendVerificationEmail(
    email: string,
    lang: string = 'en',
  ): Promise<any> {
    const code = await this.generateVerificationCode();

    await this.prisma.user.update({
      where: { email: email },
      data: { verification_code: code },
    });

    const emailTemplate =
      lang === 'ru'
        ? `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Подтверждение Email - PROXY.LUXE</title>
            <style type="text/css">
                /* Some email clients will respect these styles */
                body {
                    margin: 0;
                    padding: 0;
                    font-family: Arial, sans-serif;
                    background-color: #f5f5f5;
                }
                .email-container {
                    max-width: 600px;
                }
                .button {
                    background-color: #f3d675;
                    color: #000000;
                    text-decoration: none;
                    padding: 12px 24px;
                    border-radius: 4px;
                    font-weight: bold;
                    display: inline-block;
                }
            </style>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
            <!-- Email Container -->
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f5f5f5; padding: 20px;">
                <tr>
                    <td align="center">
                        <table class="email-container" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #000000; border-radius: 8px; overflow: hidden;">
                            <!-- Header -->
                            <tr>
                                <td align="center" style="padding: 30px 0; background-color: #000000; border-bottom: 1px solid rgba(243, 214, 117, 0.3);">
                                    <table border="0" cellpadding="0" cellspacing="0" width="80%">
                                        <tr>
                                            <td align="center">
                                                <table border="0" cellpadding="0" cellspacing="0">
                                                    <tr>
                                                        <td align="center" style="display: flex; align-items: center; justify-content: center;">
                                                            <img src="https://i.postimg.cc/rFfmSg7C/2025-04-01-16-18-31.jpg" width="30px" height="30px" style="margin-right: 8px">
                                                            <div style="font-size: 24px; font-weight: bold; color: #f3d675; letter-spacing: 1px;">PROXY.LUXE</div>
                                                        </td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            <!-- Content -->
                            <tr>
                                <td style="padding: 40px 30px; background-color: #000000; color: #ffffff;">
                                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                        <tr>
                                            <td style="padding-bottom: 20px; font-size: 22px; font-weight: bold; color: #ffffff; text-align: center;">
                                                Подтверждение Email
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding-bottom: 30px; font-size: 16px; line-height: 24px; color: #cccccc; text-align: center;">
                                                Благодарим за регистрацию в PROXY.LUXE. Для завершения регистрации, пожалуйста, используйте следующий код подтверждения: ${code}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td align="center" style="padding-bottom: 30px;">
                                            <div style="background-color: rgba(243, 214, 117, 0.1); border: 1px solid rgba(243, 214, 117, 0.3); border-radius: 6px; padding: 20px; font-size: 28px; font-weight: bold; letter-spacing: 5px; color: #f3d675; text-align: center;">
                                                    ${code}
                                                </div>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="font-size: 14px; line-height: 20px; color: #999999; text-align: center;">
                                                Если вы не регистрировались на PROXY.LUXE, пожалуйста, проигнорируйте это письмо.
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="padding: 20px 30px; background-color: rgba(243, 214, 117, 0.05); border-top: 1px solid rgba(243, 214, 117, 0.3);">
                                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                        <tr>
                                            <td style="color: #f3d675; font-size: 14px; text-align: center; padding-bottom: 10px;">
                                                © 2025 PROXY.LUXE. Все права защищены.
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="color: #999999; font-size: 12px; text-align: center; line-height: 18px;">
                                                Если у вас возникли вопросы, пожалуйста, свяжитесь с нами по адресу <a href="mailto:admin@proxy.luxe" style="color: #f3d675; text-decoration: none;">admin@proxy.luxe</a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
    `
        : `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Email Confirmation - PROXY.LUXE</title>
            <style type="text/css">
                body {
                    margin: 0;
                    padding: 0;
                    font-family: Arial, sans-serif;
                    background-color: #f5f5f5;
                }
                .email-container {
                    max-width: 600px;
                }
                .button {
                    background-color: #f3d675;
                    color: #000000;
                    text-decoration: none;
                    padding: 12px 24px;
                    border-radius: 4px;
                    font-weight: bold;
                    display: inline-block;
                }
            </style>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f5f5f5; padding: 20px;">
                <tr>
                    <td align="center">
                        <table class="email-container" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #000000; border-radius: 8px; overflow: hidden;">
                            <!-- Header -->
                            <tr>
                                <td align="center" style="padding: 30px 0; background-color: #000000; border-bottom: 1px solid rgba(243, 214, 117, 0.3);">
                                    <table border="0" cellpadding="0" cellspacing="0" width="80%">
                                        <tr>
                                            <td align="center">
                                                <table border="0" cellpadding="0" cellspacing="0">
                                                    <tr>
                                                        <td align="center" style="display: flex; align-items: center; justify-content: center;">
                                                            <img src="https://i.postimg.cc/rFfmSg7C/2025-04-01-16-18-31.jpg" width="30px" height="30px" style="margin-right: 8px">
                                                            <div style="font-size: 24px; font-weight: bold; color: #f3d675; letter-spacing: 1px;">PROXY.LUXE</div>
                                                        </td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            <!-- Content -->
                            <tr>
                                <td style="padding: 40px 30px; background-color: #000000; color: #ffffff;">
                                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                        <tr>
                                            <td style="padding-bottom: 20px; font-size: 22px; font-weight: bold; color: #ffffff; text-align: center;">
                                                Email Confirmation
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding-bottom: 30px; font-size: 16px; line-height: 24px; color: #cccccc; text-align: center;">
                                                Thank you for registering with PROXY.LUXE. To complete your registration, please use the following confirmation code: ${code}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td align="center" style="padding-bottom: 30px;">
                                            <div style="background-color: rgba(243, 214, 117, 0.1); border: 1px solid rgba(243, 214, 117, 0.3); border-radius: 6px; padding: 20px; font-size: 28px; font-weight: bold; letter-spacing: 5px; color: #f3d675; text-align: center;">
                                                    ${code}
                                                </div>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="font-size: 14px; line-height: 20px; color: #999999; text-align: center;">
                                                If you did not register on PROXY.LUXE, please ignore this message.
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            <!-- Footer -->
                            <tr>
                                <td style="padding: 20px 30px; background-color: rgba(243, 214, 117, 0.05); border-top: 1px solid rgba(243, 214, 117, 0.3);">
                                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                        <tr>
                                            <td style="color: #f3d675; font-size: 14px; text-align: center; padding-bottom: 10px;">
                                                © 2025 PROXY.LUXE. All rights reserved.
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="color: #999999; font-size: 12px; text-align: center; line-height: 18px;">
                                                If you have any questions, please contact us at <a href="mailto:admin@proxy.luxe" style="color: #f3d675; text-decoration: none;">admin@proxy.luxe</a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
    `;

    const transporter = nodemailer.createTransport({
      pool: true,
      host: 'smtp.timeweb.ru',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false,
      },
      debug: true,
    });

    const mailOptions: nodemailer.SendMailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Verification code',
      text: `Your code: ${code}`,
      html: emailTemplate,
    };

    await transporter.sendMail(mailOptions);

    return { message: 'Check email' };
  }
  async setVerify(email: string, code: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email: email },
    });

    if (!user) {
      throw new HttpException('User not found', 404);
    }

    if (user.verification_code !== code) {
      throw new HttpException('Verification code is incorrect', 400);
    }
    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true, verification_code: null },
    });

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      balance: updatedUser.balance,
    };
  }
  async getUsersInfo(user: User): Promise<Partial<User>[]> {
    if (user.type !== UserType.ADMIN) {
      throw new HttpException('Only admins can access this information', 403);
    }

    return await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        balance: true,
        type: true,
        isVerified: true,
        createdAt: true,
        ip: true,
        isBanned: true,
      },
    });
  }
  async addPartner(partnerId: string, userId: string) {
    const partner = await this.prisma.user.findUnique({
      where: { id: partnerId },
    });
    if (!partner) {
      return null;
    }
    return await this.prisma.referral.create({
      data: {
        partnerId: partnerId,
        userId: userId,
      },
    });
  }
  async payoutPartner(data: PayoutPartner) {
    const { wallet, user } = data;
    const partner = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { partnerTransactions: true },
    });
    if (!partner) {
      throw new HttpException('Partner not found', 400);
    }

    const MIN_PAYOUT = new Decimal(5);

    const totalEarned = partner.partnerTransactions.reduce(
      (sum, tx) => sum.plus(tx.amount),
      new Decimal(0),
    );
    if (MIN_PAYOUT.lt(totalEarned)) {
      throw new HttpException('Min amount of 5$', 400);
    }

    const existingPending = await this.prisma.partnerPayoutRequest.findFirst({
      where: {
        partnerId: user.id,
        status: 'PENDING',
      },
    });

    if (existingPending) {
      throw new HttpException('You already have a pending payout request', 400);
    }

    const request = await this.prisma.partnerPayoutRequest.create({
      data: {
        partnerId: user.id,
        amount: totalEarned,
        wallet,
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totalPartnerEarn: { increment: totalEarned },
      },
    });

    return {
      message: 'Payout request created',
      request: request,
    };
  }
  async getPartnerDetails(userId: string) {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(
      now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(),
      now.getMonth() === 0 ? 11 : now.getMonth() - 1,
      1,
    );

    const [referrals, allTransactions, payout, user] =
      await this.prisma.$transaction([
        this.prisma.referral.findMany({ where: { partnerId: userId } }),
        this.prisma.partnerTransaction.findMany({
          where: { partnerId: userId },
        }),
        this.prisma.partnerPayoutRequest.findFirst({
          where: { partnerId: userId },
        }),
        this.prisma.user.findUnique({ where: { id: userId } }),
      ]);

    if (!user) {
      throw new HttpException('User not found', 404);
    }

    const earnedLastMonth = allTransactions.reduce((sum, tx) => {
      const createdAt = new Date(tx.createdAt);
      if (createdAt >= startOfLastMonth && createdAt < startOfThisMonth) {
        return sum.plus(tx.amount);
      }
      return sum;
    }, new Decimal(0));
    const availableBalance = allTransactions.reduce(
      (sum, tx) => sum.plus(tx.amount),
      new Decimal(0),
    );

    return {
      referrals,
      transactions: allTransactions,
      payout,
      earnedLastMonth,
      availableBalance,
      allTimeEarn: user.totalPartnerEarn,
    };
  }

  async getPayoutRequests() {
    const payout = await this.prisma.partnerPayoutRequest.findMany();

    if (!payout) {
      throw new HttpException('Payout requests not found', 404);
    }

    return { payout: payout };
  }
  async adminPayoutRequest(id: string, status: PaymentStatus) {
    const request = await this.prisma.partnerPayoutRequest.findUnique({
      where: { id: id },
    });
    if (!request) {
      throw new HttpException('Request not found', 404);
    }

    await this.prisma.partnerPayoutRequest.update({
      where: { id: id },
      data: { status: status },
    });
    if (status === 'PAID') {
      await this.prisma.partnerPayoutRequest.update({
        where: { id: id },
        data: { status: status },
      });
      await this.prisma.partnerTransaction.deleteMany({
        where: { partnerId: request.partnerId },
      });
    }
  }
  async addBalance(data: AddBalanceDTO) {
    const { user, email, amount } = data;

    if (user.type !== UserType.ADMIN) {
      throw new HttpException('Only admins can add balance', 403);
    }

    return await this.prisma.user.update({
      where: { email: email },
      data: { balance: { increment: amount } },
    });
  }

  async removeBalance(data: RemoveBalanceDTO) {
    let { user, email, amount } = data;

    if (user.type !== UserType.ADMIN) {
      throw new HttpException('Only admins can add balance', 403);
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { email: email },
      select: { balance: true },
    });

    if (!currentUser) {
      throw new HttpException('User not found', 404);
    }

    const currentBalance = new Decimal(currentUser.balance).toNumber();

    amount = Math.min(amount, currentBalance);

    return await this.prisma.user.update({
      where: { email: email },
      data: { balance: { decrement: amount } },
    });
  }

  async banUser(data: BanUserDTO) {
    let { user, email } = data;

    if (user.type !== UserType.ADMIN) {
      throw new HttpException('Only admins can add balance', 403);
    }

    return await this.prisma.user.update({
      where: { email: email },
      data: { isBanned: true },
    });
  }

  async unbanUser(data: BanUserDTO) {
    let { user, email } = data;

    if (user.type !== UserType.ADMIN) {
      throw new HttpException('Only admins can add balance', 403);
    }

    return await this.prisma.user.update({
      where: { email: email },
      data: { isBanned: false },
    });
  }

  async addPromocode(data: AddPromocodeDTO) {
    let { user, promocode, discount, limit } = data;

    if (user.type !== UserType.ADMIN) {
      throw new HttpException('Only admins can add balance', 403);
    }

    return await this.prisma.coupon.create({
      data: {
        code: promocode,
        discount: discount,
        limit: limit,
      },
    });
  }
  async sendProxyEmail(email: string, lang: string = 'en'): Promise<any> {
    const expirationDate = new Date();
    expirationDate.setMonth(expirationDate.getMonth() + 1);

    const formattedDate = expirationDate
      .toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB')
      .replace(/\//g, '.');

    const expirationText =
      lang === 'ru'
        ? `Срок действия прокси: до ${formattedDate}`
        : `Proxy valid until: ${formattedDate}`;

    const emailTemplate =
      lang === 'ru'
        ? `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
          <meta charset="UTF-8" />
          <title>Покупка прокси - PROXY.LUXE</title>
        </head>
        <body style="font-family: Arial, sans-serif; background-color: #f5f5f5; padding: 20px;">
          <table align="center" width="100%" style="max-width:600px; background-color: #000000; border-radius: 8px; color: white; padding: 30px;">
            <tr>
              <td align="center" style="font-size: 24px; font-weight: bold; color: #f3d675;">
                <img src="https://i.postimg.cc/rFfmSg7C/2025-04-01-16-18-31.jpg" width="36px" height="36px" style="margin-right: 10px; vertical-align: middle;" />
                PROXY.LUXE
              </td>
            </tr>
            <tr>
              <td style="padding-top: 20px; text-align: center;">
                Спасибо за покупку! Ваши прокси скоро будут доступны в личном кабинете.
              </td>
            </tr>
            <tr>
              <td style="padding-top: 10px; text-align: center; font-weight: bold;">
                ${expirationText}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding: 30px 0;">
                <a href="https://proxy.luxe/ru/personal-account" style="background-color: #f3d675; color: #000000; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold;">
                  Перейти в личный кабинет
                </a>
              </td>
            </tr>
            <tr>
              <td style="text-align: center; font-size: 14px; color: #999;">
                Если возникли вопросы, напишите нам: <a href="mailto:admin@proxy.luxe" style="color: #f3d675;">admin@proxy.luxe</a>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `
        : `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Proxy Purchase - PROXY.LUXE</title>
      </head>
      <body style="font-family: Arial, sans-serif; background-color: #f5f5f5; padding: 20px;">
        <table align="center" width="100%" style="max-width:600px; background-color: #000000; border-radius: 8px; color: white; padding: 30px;">
          <tr>
            <td align="center" style="font-size: 24px; font-weight: bold; color: #f3d675;">
              <img src="https://i.postimg.cc/rFfmSg7C/2025-04-01-16-18-31.jpg" width="36px" height="36px" style="margin-right: 10px; vertical-align: middle;" />
              PROXY.LUXE
            </td>
          </tr>
          <tr>
            <td style="padding-top: 20px; text-align: center;">
              Thank you for your purchase! Your proxies will soon be available in your dashboard.
            </td>
          </tr>
          <tr>
            <td style="padding-top: 10px; text-align: center; font-weight: bold;">
              ${expirationText}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 30px 0;">
              <a href="https://proxy.luxe/en/personal-account" style="background-color: #f3d675; color: #000000; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold;">
                Go to Dashboard
              </a>
            </td>
          </tr>
          <tr>
            <td style="text-align: center; font-size: 14px; color: #999;">
              If you have any questions, contact us at <a href="mailto:admin@proxy.luxe" style="color: #f3d675;">admin@proxy.luxe</a>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const transporter = nodemailer.createTransport({
      pool: true,
      host: 'smtp.timeweb.ru',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false,
      },
      debug: true,
    });

    const mailOptions: nodemailer.SendMailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject:
        lang === 'ru' ? 'Спасибо за покупку!' : 'Thank you for your purchase!',
      text:
        lang === 'ru'
          ? 'Спасибо за покупку! Ваши прокси скоро будут доступны в личном кабинете.'
          : 'Thank you for your purchase! Your proxies will soon be available in your dashboard.',
      html: emailTemplate,
    };

    await transporter.sendMail(mailOptions);

    return { message: 'Proxy purchase email sent' };
  }

  async getPromocode(user: User) {
    if (user.type !== UserType.ADMIN) {
      throw new HttpException('Admins only', 403);
    }

    return await this.prisma.coupon.findMany();
  }
  async deletePromocode(user: User, code: string) {
    if (user.type !== UserType.ADMIN) {
      throw new HttpException('Admins only', 403);
    }

    return await this.prisma.coupon.delete({ where: { code: code } });
  }
  async sendSupportEmail(
    dto: SupportMessageDto,
  ): Promise<{ success: boolean }> {
    const { name, email, support, message } = dto;

    const html = `
      <!DOCTYPE html>
      <html lang="ru">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Новое сообщение в поддержку - PROXY.LUXE</title>
          <style type="text/css">
              body {
                  margin: 0;
                  padding: 0;
                  font-family: Arial, sans-serif;
                  background-color: #f5f5f5;
              }
              .email-container {
                  max-width: 600px;
              }
          </style>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <!-- Email Container -->
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f5f5f5; padding: 20px;">
              <tr>
                  <td align="center">
                      <table class="email-container" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #000000; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                          <!-- Header -->
                          <tr>
                              <td align="center" style="padding: 25px 0; background-color: #000000; border-bottom: 2px solid #f3d675;">
                                  <table border="0" cellpadding="0" cellspacing="0" width="90%">
                                      <tr>
                                          <td align="center">
                                              <table border="0" cellpadding="0" cellspacing="0">
                                                  <tr>
                                                      <td align="center">
                                                          <img src="https://i.postimg.cc/rFfmSg7C/2025-04-01-16-18-31.jpg" width="36px" height="36px" style="margin-right: 10px; vertical-align: middle;">
                                                          <span style="font-size: 26px; font-weight: bold; color: #f3d675; letter-spacing: 1px; vertical-align: middle;">PROXY.LUXE</span>
                                                      </td>
                                                  </tr>
                                              </table>
                                          </td>
                                      </tr>
                                  </table>
                              </td>
                          </tr>
                          <!-- Content -->
                          <tr>
                              <td style="padding: 35px 30px; background-color: #000000; color: #ffffff;">
                                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                      <tr>
                                          <td style="padding-bottom: 25px; font-size: 24px; font-weight: bold; color: #f3d675; text-align: center; text-transform: uppercase; letter-spacing: 1px;">
                                              Новое сообщение от пользователя
                                          </td>
                                      </tr>
                                      <tr>
                                          <td style="padding-bottom: 30px;">
                                              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: rgba(243, 214, 117, 0.08); border: 1px solid rgba(243, 214, 117, 0.4); border-radius: 6px; padding: 0;">
                                                  <tr>
                                                      <td style="padding: 20px;">
                                                          <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                                              <tr>
                                                                  <td style="padding: 12px 15px; background-color: rgba(243, 214, 117, 0.15); border-radius: 4px; margin-bottom: 15px; display: block;">
                                                                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                                                          <tr>
                                                                              <td style="font-weight: bold; color: #f3d675; font-size: 16px; padding-bottom: 5px;">Имя:</td>
                                                                          </tr>
                                                                          <tr>
                                                                              <td style="color: #ffffff; font-size: 16px; padding-left: 10px;">${name}</td>
                                                                          </tr>
                                                                      </table>
                                                                  </td>
                                                              </tr>
                                                              <tr>
                                                                  <td height="15"></td>
                                                              </tr>
                                                              <tr>
                                                                  <td style="padding: 12px 15px; background-color: rgba(243, 214, 117, 0.15); border-radius: 4px; margin-bottom: 15px; display: block;">
                                                                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                                                          <tr>
                                                                              <td style="font-weight: bold; color: #f3d675; font-size: 16px; padding-bottom: 5px;">Email:</td>
                                                                          </tr>
                                                                          <tr>
                                                                              <td style="color: #ffffff; font-size: 16px; padding-left: 10px;">${email}</td>
                                                                          </tr>
                                                                      </table>
                                                                  </td>
                                                              </tr>
                                                              <tr>
                                                                  <td height="15"></td>
                                                              </tr>
                                                              <tr>
                                                                  <td style="padding: 12px 15px; background-color: rgba(243, 214, 117, 0.15); border-radius: 4px; margin-bottom: 15px; display: block;">
                                                                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                                                          <tr>
                                                                              <td style="font-weight: bold; color: #f3d675; font-size: 16px; padding-bottom: 5px;">Тип тех. поддержки:</td>
                                                                          </tr>
                                                                          <tr>
                                                                              <td style="color: #ffffff; font-size: 16px; padding-left: 10px;">${support}</td>
                                                                          </tr>
                                                                      </table>
                                                                  </td>
                                                              </tr>
                                                              <tr>
                                                                  <td height="15"></td>
                                                              </tr>
                                                              <tr>
                                                                  <td style="padding: 12px 15px; background-color: rgba(243, 214, 117, 0.15); border-radius: 4px; display: block;">
                                                                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                                                          <tr>
                                                                              <td style="font-weight: bold; color: #f3d675; font-size: 16px; padding-bottom: 5px;">Сообщение:</td>
                                                                          </tr>
                                                                          <tr>
                                                                              <td style="color: #ffffff; font-size: 16px; padding-left: 10px; line-height: 1.6;">${message}</td>
                                                                          </tr>
                                                                      </table>
                                                                  </td>
                                                              </tr>
                                                          </table>
                                                      </td>
                                                  </tr>
                                              </table>
                                          </td>
                                      </tr>
                                  </table>
                              </td>
                          </tr>
                          
                          <!-- Footer -->
                          <tr>
                              <td style="padding: 15px 30px; background-color: rgba(243, 214, 117, 0.08); border-top: 2px solid #f3d675;">
                                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                      <tr>
                                          <td style="color: #f3d675; font-size: 14px; text-align: center;">
                                              © 2025 PROXY.LUXE
                                          </td>
                                      </tr>
                                  </table>
                              </td>
                          </tr>
                      </table>
                  </td>
              </tr>
          </table>
      </body>
      </html>
    `;

    const transporter = nodemailer.createTransport({
      pool: true,
      host: 'smtp.timeweb.ru',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false,
      },
      debug: true,
    });

    const mailOptions: nodemailer.SendMailOptions = {
      from: process.env.EMAIL_USER,
      to: 'admin@proxy.luxe',
      subject: 'Новое сообщение в поддержку',
      html,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  }
  async addAuthorization(data: AddAuthDto) {
    return await this.productService.addAuth(data.orderNumber, data.ip);
  }
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async notifyExpiringProxies() {
    const now = new Date();

    const formatDate = (date: Date): string => {
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    };

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(now);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

    const notifyDates = [formatDate(tomorrow), formatDate(dayAfterTomorrow)];

    const orders = await this.prisma.order.findMany({
      where: {
        status: 'PAID',
        end_date: {
          in: notifyDates,
        },
      },
      include: {
        user: true,
      },
    });

    for (const order of orders) {
      const user = order.user;
      const lang = user.lang || 'en';
      const email = user.email;
      const expiration = order.end_date;

      const subject =
        lang === 'ru'
          ? 'Срок действия вашего прокси скоро истекает'
          : 'Your proxy is expiring soon';

      const html = `
      <!DOCTYPE html>
      <html lang="${lang}">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Proxy Expiration Notice</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: Arial, sans-serif;">
          <table align="center" width="100%" style="padding: 20px; background-color: #f5f5f5;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #000000; border-radius: 10px; overflow: hidden; color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                  <tr>
                    <td align="center" style="padding: 25px 0; border-bottom: 2px solid #f3d675;">
                      <img src="https://i.postimg.cc/rFfmSg7C/2025-04-01-16-18-31.jpg" alt="Logo" width="36" height="36" style="vertical-align: middle; margin-right: 10px;" />
                      <span style="font-size: 24px; font-weight: bold; color: #f3d675;">PROXY.LUXE</span>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding: 30px;">
                      <h2 style="color: #f3d675; text-align: center; margin-top: 0;">
                        ${lang === 'ru' ? 'Ваш прокси истекает' : 'Your proxy is expiring'}
                      </h2>
                      <p style="font-size: 16px; line-height: 1.6; text-align: center;">
                        ${
                          lang === 'ru'
                            ? `Срок действия вашего прокси заканчивается <strong>${expiration}</strong>.<br/>Пожалуйста, продлите его, чтобы избежать отключения.`
                            : `Your proxy will expire on <strong>${expiration}</strong>.<br/>Please renew it to avoid disconnection.`
                        }
                      </p>
                      <p style="text-align: center; font-size: 14px; color: #aaaaaa;">
                        ${
                          lang === 'ru'
                            ? 'Если у вас возникли вопросы, пожалуйста, свяжитесь с нами:'
                            : 'If you have any questions, feel free to contact us:'
                        }
                        <br />
                        <a href="mailto:admin@proxy.luxe" style="color: #f3d675;">admin@proxy.luxe</a>
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td align="center" style="padding: 15px; background-color: rgba(243, 214, 117, 0.05); border-top: 1px solid rgba(243, 214, 117, 0.3); font-size: 12px; color: #999;">
                      © 2025 PROXY.LUXE
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

      const transporter = nodemailer.createTransport({
        host: 'smtp.timeweb.ru',
        port: 465,
        secure: true,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject,
        html,
      });
    }
  }
}
