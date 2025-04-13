import {
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../shared/prisma.service';
import { User } from '@prisma/client';
import { UserService } from '../user/user.service';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResetPasswordEmailDto } from './dto/reset-email.dto';
import * as nodemailer from 'nodemailer';

interface JwtPayload {
  sub: string;
  email: string;
}

interface JwtRefreshTokenPayload {
  sub: string;
  refreshTokenId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto, request: any): Promise<User> {
    const ip =
      request.headers['x-forwarded-for'] || request.connection.remoteAddress;
    const lang =
      request.headers['accept-language']
        ?.split(',')[0]
        ?.split('-')[0]
        ?.toLowerCase() || 'en';

    const { password, referralId, email } = registerDto;
    const user = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });
    console.log('referralID', referralId);
    if (user) {
      throw new HttpException('User with this email already exists', 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const current_user = await this.prisma.user.create({
      data: {
        email: email,
        password: hashedPassword,
        ip: ip,
        lang: lang,
      },
    });
    console.log('current_user', current_user);

    await this.userService.sendVerificationEmail(registerDto.email, lang);

    if (referralId) {
      console.log('worked');
      await this.userService.addPartner(referralId, current_user.id);
    }

    return current_user;
  }

  async login(
    loginDto: LoginDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const { email, password } = loginDto;
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return await this.generateTokens(user);
  }

  async generateTokens(
    user: User,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user);
    return {
      accessToken,
      refreshToken,
    };
  }

  private async generateAccessToken(user: User): Promise<string> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get('JWT_ACCESS_TOKEN_SECRET'),
      expiresIn: '1d',
    });
  }

  private async generateRefreshToken(user: User): Promise<string> {
    const refreshTokenId = randomUUID();
    const payload: JwtRefreshTokenPayload = {
      sub: user.id,
      refreshTokenId,
    };

    return this.jwtService.signAsync(payload, {
      secret: this.configService.get('JWT_REFRESH_TOKEN_SECRET'),
      expiresIn: '7d',
    });
  }

  async refreshToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: JwtRefreshTokenPayload =
      await this.jwtService.verifyAsync<JwtRefreshTokenPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_TOKEN_SECRET'),
      });

    const { sub } = payload;
    const user = await this.prisma.user.findUnique({ where: { id: sub } });

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.generateTokens(user);
  }

  async validateUser(payload: JwtPayload): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { email, code, newPassword } = resetPasswordDto;

    const user = await this.prisma.user.findUnique({ where: { email: email } });
    if (!user) {
      throw new HttpException('User with this email does not exist', 400);
    }

    const isPasswordValid = await bcrypt.compare(newPassword, user.password);
    if (isPasswordValid) {
      throw new HttpException('New password matches old password', 400);
    }
    if (user.change_password_code !== code) {
      throw new HttpException('Invalid code', 400);
    }

    await this.prisma.user.update({
      where: { email: email },
      data: {
        password: await bcrypt.hash(newPassword, 10),
        change_password_code: null,
      },
    });
  }

  async sendResetPassword(data: ResetPasswordEmailDto, lang: string = 'en') {
    const { email } = data;
    const code = await this.userService.generateVerificationCode();

    await this.prisma.user.update({
      where: { email: email },
      data: { change_password_code: code },
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
                                                    Смена пароля
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding-bottom: 30px; font-size: 16px; line-height: 24px; color: #cccccc; text-align: center;">
                                                    Для завершения смены пароля, пожалуйста, используйте следующий код подтверждения: ${code}
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
                                                    Если вы не запрашивали код на смену пароля на PROXY.LUXE, пожалуйста, проигнорируйте это письмо.
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
            <title>Password Reset - PROXY.LUXE</title>
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
                                                Password Reset
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding-bottom: 30px; font-size: 16px; line-height: 24px; color: #cccccc; text-align: center;">
                                                To complete the password reset, please use the following confirmation code: ${code}
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
                                                If you didn’t request a password reset for your account on PROXY.LUXE, please ignore this email.
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
      subject: 'Reset password code',
      text: `Your code: ${code}`,
      html: emailTemplate,
    };

    await transporter.sendMail(mailOptions);

    return { message: 'Check email' };
  }
}
