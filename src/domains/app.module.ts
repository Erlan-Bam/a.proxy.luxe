import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { UserModule } from './v1/user/user.module';
import { AuthModule } from './v1/auth/auth.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProductModule } from './product/product.module';
import { OrderModule } from './v1/order/order.module';
import { ArticleModule } from './v1/articles/article/article.module';
import { MainImageModule } from './v1/articles/main-image/main-image.module';
import { ServicesModule } from './v1/services/services.module';
import { PaymentModule } from './v1/payment/payment.module';
import { SharedModule } from './v1/shared/shared.module';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './health/health.module';
import { AdminLoggingInterceptor } from './v1/shared/interceptors/admin-logging.interceptor';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ProductModule,
    UserModule,
    AuthModule,
    ProductModule,
    OrderModule,
    ArticleModule,
    MainImageModule,
    ServicesModule,
    PaymentModule,
    SharedModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AdminLoggingInterceptor,
    },
  ],
})
export class AppModule {}
