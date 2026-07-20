import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ErrorLogService } from './error-log.service';

@Controller('v1/admin/error-logs')
@UseGuards(AuthGuard('jwt'), AdminGuard)
export class ErrorLogController {
  constructor(private readonly errorLogService: ErrorLogService) {}

  @Get()
  findAll(@Query('page') page = '1', @Query('limit') limit = '100') {
    return this.errorLogService.findAll(
      this.parsePage(page),
      this.parseLimit(limit),
    );
  }

  private parsePage(value: string): number {
    const page = Number.parseInt(value, 10);
    return Number.isFinite(page) && page > 0 ? page : 1;
  }

  private parseLimit(value: string): number {
    const limit = Number.parseInt(value, 10);
    return Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 300) : 100;
  }
}
