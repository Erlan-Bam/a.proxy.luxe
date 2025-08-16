import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { SharedModule } from '../v1/shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [HealthController],
})
export class HealthModule {}
