import { Module } from '@nestjs/common';
import { UserModule } from './v1/user/user.module';
import { AuthModule } from './v1/auth/auth.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProductModule } from './product/product.module';
import { OrderModule } from './v1/order/order.module';
import { ArticleModule } from './v1/articles/article/article.module';
import { ServicesModule } from './v1/services/services.module';
import { PaymentModule } from './v1/payment/payment.module';
import { SharedModule } from './v1/shared/shared.module';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './health/health.module';

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
    ServicesModule,
    PaymentModule,
    SharedModule,
    HealthModule,
  ],
})
export class AppModule {}
