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

  async findAll(page = 1, limit: number | null = 100) {
    const showAll = limit === null;
    const effectivePage = showAll ? 1 : page;
    const dataQuery = showAll
      ? this.prisma.errorLog.findMany({
          orderBy: { createdAt: 'desc' },
        })
      : this.prisma.errorLog.findMany({
          orderBy: { createdAt: 'desc' },
          skip: (effectivePage - 1) * limit,
          take: limit,
        });
    const [data, total] = await this.prisma.$transaction([
      dataQuery,
      this.prisma.errorLog.count(),
    ]);

    const effectiveLimit = showAll ? total : limit;

    return {
      data,
      total,
      page: effectivePage,
      limit: effectiveLimit,
      totalPages: showAll
        ? total > 0
          ? 1
          : 0
        : Math.ceil(total / effectiveLimit),
    };
  }
}
