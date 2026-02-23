import { Injectable, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class CaptchaService {
  constructor(private readonly configService: ConfigService) {}

  async verifyCaptcha(token: string): Promise<boolean> {
    const secretKey = this.configService.get<string>('RECAPTCHA_SECRET_KEY');

    if (!secretKey) {
      throw new HttpException('reCAPTCHA is not configured', 500);
    }

    try {
      const response = await axios.post(
        'https://www.google.com/recaptcha/api/siteverify',
        null,
        {
          params: {
            secret: secretKey,
            response: token,
          },
        },
      );

      if (!response.data.success) {
        throw new HttpException('Captcha verification failed', 400);
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('Captcha verification failed', 400);
    }
  }
}
