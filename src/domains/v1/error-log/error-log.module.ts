import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { ErrorLogController } from './error-log.controller';
import { ErrorLogService } from './error-log.service';

@Module({
  imports: [SharedModule],
  controllers: [ErrorLogController],
  providers: [ErrorLogService],
  exports: [ErrorLogService],
})
export class ErrorLogModule {}
