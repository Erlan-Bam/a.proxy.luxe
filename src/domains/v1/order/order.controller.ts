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
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    if (request.user.type !== UserType.ADMIN) {
      throw new ForbiddenException('Access denied: Admins only');
    }
    return this.orderService.generalLog(pageNumber, limitNumber);
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
