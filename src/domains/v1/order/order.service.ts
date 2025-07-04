import {
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { FinishOrderDto } from './dto/payment-order.dto';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { ProductService } from 'src/domains/product/product.service';
import { OrderInfo } from 'src/domains/product/dto/order.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { UserService } from '../user/user.service';

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private productService: ProductService,
    private userService: UserService,
  ) {}
  async create(createOrderDto: CreateOrderDto) {
    if (
      createOrderDto.type !== 'resident' &&
      createOrderDto.quantity === undefined
    ) {
      throw new HttpException('Invalid quantity', 400);
    }
    if (
      createOrderDto.type === 'ipv6' &&
      createOrderDto.proxyType === undefined
    ) {
      throw new HttpException('Not specified HTTPS or SOCKS5 for ipv6', 400);
    }
    const reference = await this.productService.getProductReferenceByType(
      createOrderDto.type,
    );

    if (reference.status !== 'success') {
      throw new HttpException(
        reference.message || 'Invalid reference data',
        400,
      );
    }
    if (createOrderDto.type !== 'resident') {
      const isValidCountry = reference.country.some((current) =>
        current.name.endsWith(createOrderDto.country),
      );
      if (!isValidCountry) {
        throw new HttpException('Invalid country', 400);
      }
      const isValidPeriod = reference.period.some(
        (period) => period.id === createOrderDto.periodDays,
      );
      if (!isValidPeriod) {
        throw new HttpException('Invalid period', 400);
      }
    } else {
      const isValidTariffs = reference.tariffs?.some(
        (tariff) => tariff.name === createOrderDto.tariff,
      );
      if (!isValidTariffs) {
        throw new HttpException('Invalid tariffs', 400);
      }
    }

    const totalPrice = await this.productService.getCalcForOrder(
      createOrderDto.type,
      createOrderDto.type !== 'resident'
        ? createOrderDto.quantity
        : parseInt(createOrderDto.tariff),
    );

    return await this.prisma.order.create({
      data: {
        type: createOrderDto.type,
        userId: createOrderDto.userId,
        country: createOrderDto.country,
        quantity: createOrderDto.quantity,
        periodDays: createOrderDto.periodDays,
        proxyType: createOrderDto.proxyType,
        status: PaymentStatus.PENDING,
        goal: createOrderDto.goal,
        tariff: createOrderDto.tariff,
        totalPrice: totalPrice,
        end_date: new Date(
          new Date().setMonth(new Date().getMonth() + 1),
        ).toLocaleDateString('ru-RU'),
      },
    });
  }

  async findAll(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where: { userId: userId, status: 'PENDING' },
        skip: skip,
        take: limit,
      }),
      this.prisma.order.count({
        where: { userId: userId, status: 'PENDING' },
      }),
    ]);

    return {
      data: orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async generalLog(page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const [orders, totalOrders] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where: { status: 'PAID' },
        include: {
          user: {
            select: {
              email: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.order.count({
        where: { status: 'PAID' },
      }),
    ]);

    const [payments, totalPayments] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        orderBy: { updatedAt: 'desc' },
        include: {
          user: {
            select: {
              email: true,
            },
          },
        },
        skip,
        take: limit,
      }),
      this.prisma.payment.count(),
    ]);

    return {
      orders,
      totalOrders,
      payments,
      totalPayments,
      page,
      limit,
      totalOrderPages: Math.ceil(totalOrders / limit),
      totalPaymentPages: Math.ceil(totalPayments / limit),
    };
  }

  async findById(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new HttpException(`Order with ID ${orderId} not found`, 404);
    }

    return order;
  }

  async finishOrder(paymentDto: FinishOrderDto, lang: string = 'en') {
    const order = await this.prisma.order.findUnique({
      where: { id: paymentDto.orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Order already processed');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: order.userId },
      include: { referredBy: true },
    });

    if (!user) {
      throw new HttpException('User not found', 404);
    }

    let totalPrice = order.totalPrice;
    if (paymentDto.promocode) {
      const { isValidCoupon, coupon } = await this.checkPromocode(
        paymentDto.promocode,
      );
      if (!isValidCoupon) {
        throw new HttpException('Invalid promocode', 400);
      }
      if (isValidCoupon && coupon) {
        totalPrice = new Decimal(totalPrice)
          .mul(Decimal.sub(100, coupon.discount))
          .div(100);
      }
    }

    if (new Decimal(user.balance).lt(totalPrice)) {
      throw new HttpException('Insufficient balance', 400);
    }

    const reference = await this.productService.getProductReferenceByType(
      order.type,
    );

    if (reference.status !== 'success') {
      throw new HttpException(
        reference.message || 'Invalid reference data',
        400,
      );
    }
    const orderInfo: OrderInfo = {
      type: order.type,
      orderId: order.id,
      paymentId: 1,
      tariff: order.tariff ? order.tariff : undefined,
      countryId: reference.country?.find(
        (country) => order.country && country.name.endsWith(order.country),
      )?.id,
      tariffId: reference.tariffs?.find(
        (tariff) =>
          order.tariff &&
          tariff.name.toLowerCase() === order.tariff.toLowerCase() &&
          tariff.personal,
      )?.id,
      customTargetName: order.goal,
      periodId: order.periodDays ? order.periodDays : undefined,
      quantity: order.quantity ? order.quantity : undefined,
      protocol: order.proxyType ? order.proxyType : undefined,
      userId: order.userId,
    };

    const placedOrder = await this.productService.placeOrder(orderInfo);
    const package_key = placedOrder.package_key,
      orderId = placedOrder.orderId;
    console.log('orderId', orderId);
    console.log('placedOrder', placedOrder);
    await this.prisma.user.update({
      where: { id: order.userId },
      data: { balance: { decrement: totalPrice } },
    });
    if (order.type === 'resident') {
      const existingPK = await this.prisma.order.findUnique({
        where: { proxySellerId: package_key },
      });
      if (package_key) {
        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            proxySellerId: existingPK ? null : package_key,
            status: 'PAID',
            orderId: orderId,
          },
        });
      }
    } else {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          proxySellerId: orderId,
          status: 'PAID',
          orderId: orderId,
        },
      });
    }
    if (paymentDto.promocode) {
      await this.prisma.coupon.update({
        where: { code: paymentDto.promocode },
        data: { limit: { decrement: 1 } },
      });
    }
    if (user.referredBy) {
      const partnerId = user.referredBy.partnerId;

      await this.prisma.partnerTransaction.create({
        data: {
          partnerId,
          amount: new Decimal(totalPrice).mul(0.15).toNumber(),
        },
      });
    }

    await this.userService.sendProxyEmail(user.email, lang);

    return {
      message: 'Successfully finished order',
      type: order.type,
      orderId: order.id,
    };
  }

  async findOrdersByUserId(userId: string) {
    return await this.prisma.order.findMany({
      where: { userId: userId, proxySellerId: { not: null } },
      select: { proxySellerId: true },
    });
  }

  async checkPromocode(promocode: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: promocode },
    });
    if (!coupon) {
      return { isValidCoupon: false, coupon: null };
    }
    if (coupon.limit === 0) {
      return { isValidCoupon: false, coupon: null };
    }
    return { isValidCoupon: true, coupon: coupon };
  }

  async deleteById(userId: string, orderId: string) {
    const order = await this.prisma.order.delete({
      where: { userId: userId, id: orderId },
    });

    if (!order) {
      throw new HttpException('Invalid order id', 400);
    }

    return order;
  }
}
