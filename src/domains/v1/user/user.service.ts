import { HttpException, Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import * as nodemailer from 'nodemailer';
import { User, UserType } from '@prisma/client';
import { AddBalanceDTO } from './dto/add-balance.dto';
import { RemoveBalanceDTO } from './dto/remove-balance.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { BanUserDTO } from './dto/ban-user.dto';
import { AddPromocodeDTO } from './dto/add-promo.dto';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

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
                                                            <img src="https://iili.io/3zxnwpn.th.png" width="30px" height="30px" style="margin-right: 8px">
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
                                                            <img src="https://iili.io/3zxnwpn.th.png" width="30px" height="30px" style="margin-right: 8px">
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
      },
    });
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
  async getPromocode(user: User) {
    if (user.type !== UserType.ADMIN) {
      throw new HttpException('Admins only', 403);
    }

    return await this.prisma.coupon.findMany();
  }
}
