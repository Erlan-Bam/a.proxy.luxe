import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';

type ErrorLogEntry = {
  userId?: string;
  method: string;
  path: string;
  ip?: string;
  statusCode: number;
  message: string;
  stack?: string;
};

@Injectable()
export class ErrorLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: ErrorLogEntry): Promise<void> {
    try {
      await this.prisma.errorLog.create({
        data: entry,
      });
    } catch (error) {
      console.error('Could not persist error log', error);
    }
  }

  async findAll(page = 1, limit = 100) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.errorLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.errorLog.count(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
