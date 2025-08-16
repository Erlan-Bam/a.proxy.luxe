import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../v1/shared/prisma.service';

@Controller('v1/healthz')
export class HealthController {
  constructor(private prismaService: PrismaService) {}

  @Get()
  async healthCheck() {
    try {
      // Проверяем подключение к базе данных
      await this.prismaService.$queryRaw`SELECT 1`;

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'proxy-backend',
        database: 'connected',
      };
    } catch (error) {
      // В случае ошибки возвращаем 503 Service Unavailable
      throw new HttpException(
        {
          status: 'error',
          timestamp: new Date().toISOString(),
          service: 'proxy-backend',
          database: 'disconnected',
          error: error.message || 'Database connection failed',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
