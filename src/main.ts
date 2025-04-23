import { NestFactory } from '@nestjs/core';
import { AppModule } from './domains/app.module';
import { ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';
import { setDefaultResultOrder } from 'node:dns';
export const baseUrl =
  process.env.NODE_ENV === 'production'
    ? 'https://api.proxy.luxe'
    : 'http://localhost:6001';

setDefaultResultOrder('ipv4first');
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 📦 Увеличиваем лимит на JSON и form-data
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://proxy.luxe',
      'https://admin.proxy.luxe',
    ],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe());

  await app.listen(process.env.APP_PORT ?? 6001);
}
bootstrap();
