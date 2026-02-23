import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { CaptchaService } from './captcha.service';

@Module({
  imports: [ConfigModule],
  providers: [PrismaService, CaptchaService],
  exports: [PrismaService, CaptchaService],
})
export class SharedModule {}
