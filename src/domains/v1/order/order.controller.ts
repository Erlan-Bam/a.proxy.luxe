import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
  Delete,
  ForbiddenException,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { FinishOrderDto } from './dto/payment-order.dto';
import { AuthGuard } from '@nestjs/passport';
import { UserType } from '@prisma/client';

const ADMIN_LOG_LIMIT_OPTIONS = [100, 200, 300] as const;

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseAdminLogLimit = (
  value: string | undefined,
  fallback: (typeof ADMIN_LOG_LIMIT_OPTIONS)[number],
) => {
  const parsed = parsePositiveInt(value, fallback);
  return ADMIN_LOG_LIMIT_OPTIONS.includes(
    parsed as (typeof ADMIN_LOG_LIMIT_OPTIONS)[number],
  )
    ? (parsed as (typeof ADMIN_LOG_LIMIT_OPTIONS)[number])
    : fallback;
};

@Controller('v1/orders')
@UseGuards(AuthGuard('jwt'))
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  async create(@Body() createOrderDto: CreateOrderDto, @Request() request) {
    createOrderDto.userId = request.user.id;
    return await this.orderService.create(createOrderDto);
  }

  @Get()
  findAll(
    @Request() request,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);

    return this.orderService.findAll(request.user.id, pageNumber, limitNumber);
  }

  @Post('finish')
  async finishOrder(@Body() finishDto: FinishOrderDto, @Request() request) {
    const lang =
      request.headers['accept-language']
        ?.split(',')[0]
        ?.split('-')[0]
        ?.toLowerCase() || 'en';
    return this.orderService.finishOrder(finishDto, lang);
  }

  @Get('admin/general-log')
  async generalLog(
    @Request() request,
    @Query('ordersPage') ordersPage = '1',
    @Query('ordersLimit') ordersLimit = '100',
    @Query('paymentsPage') paymentsPage = '1',
    @Query('paymentsLimit') paymentsLimit = '100',
    @Query('page') legacyPage?: string,
    @Query('limit') legacyLimit?: string,
  ) {
    if (request.user.type !== UserType.ADMIN) {
      throw new ForbiddenException('Access denied: Admins only');
    }

    const fallbackPage = parsePositiveInt(legacyPage, 1);
    const fallbackLimit = parseAdminLogLimit(legacyLimit, 100);

    return this.orderService.generalLog({
      ordersPage: parsePositiveInt(ordersPage, fallbackPage),
      ordersLimit: parseAdminLogLimit(ordersLimit, fallbackLimit),
      paymentsPage: parsePositiveInt(paymentsPage, fallbackPage),
      paymentsLimit: parseAdminLogLimit(paymentsLimit, fallbackLimit),
    });
  }

  @Get('admin/error-log')
  async errorLog(
    @Request() request,
    @Query('page') page = '1',
    @Query('limit') limit = '100',
    @Query('search') search = '',
  ) {
    if (request.user.type !== UserType.ADMIN) {
      throw new ForbiddenException('Access denied: Admins only');
    }

    const pageNumber = parsePositiveInt(page, 1);
    const limitNumber = parseAdminLogLimit(limit, 100);

    return this.orderService.errorLog(pageNumber, limitNumber, search);
  }

  @Get('admin/:userId')
  findOrdersByUserId(@Param('userId') userId: string, @Request() request) {
    if (request.user.type !== UserType.ADMIN) {
      throw new ForbiddenException('Access denied: Admins only');
    }
    return this.orderService.findOrdersByUserId(userId);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.orderService.findById(id);
  }

  @Delete(':id')
  async deleteById(@Param('id') id: string, @Request() request) {
    return this.orderService.deleteById(request.user.id, id);
  }
}
