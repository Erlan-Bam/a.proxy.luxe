import { HttpException, Injectable } from '@nestjs/common';
import axios, { Axios } from 'axios';
import { ConfigService } from '@nestjs/config';
import {
  ResidentProvisioner,
  ResidentCheckpoint,
} from './resident-provisioner';
import {
  ResponseCalcDTO,
  ResponseErrorDTO,
  ResponseReferenceDTO,
  ResponseReferenceSingleDTO,
} from './rdo/response.dto';
import { CalcRequestDTO, CalcResidentRequestDTO } from './dto/request.dto';
import { ActiveProxy, ActiveProxyType } from './rdo/get-active-proxy.rdo';
import { Proxy, Prisma } from '@prisma/client';
import { OrderInfo } from './dto/order.dto';
import { PrismaService } from '../v1/shared/prisma.service';
import geoReference = require('../../data/geo.json');
import { ModifyProxyResidentDto } from './dto/modify-proxy.dto';
import { ProlongDto } from './dto/prolog.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { UpdateResident } from './dto/update-resident.dto';
import { ProlongResidentDto } from './dto/prolong-resident.dto';
import { IpAuthorizationRdo } from './rdo/ip-authorization.rdo';
import { productReferenceFallback } from './product-reference-fallback';
import { ProviderOrderRejectedException } from './provider-order-rejected.exception';
import {
  ProviderReadCache,
  ProviderReadCachePolicy,
} from './provider-read-cache';
import { proxySellerApiVersionForPath } from './proxy-seller-api-version';

const PROVIDER_LIST_CACHE: ProviderReadCachePolicy = {
  ttlMs: 20 * 1000,
  staleIfErrorMs: 2 * 60 * 1000,
  retryAfterErrorMs: 30 * 1000,
};
const PROVIDER_AUTH_CACHE: ProviderReadCachePolicy = {
  ttlMs: 15 * 1000,
  staleIfErrorMs: 60 * 1000,
  retryAfterErrorMs: 30 * 1000,
};

@Injectable()
export class ProductService {
  private readonly proxySeller: Axios;
  private readonly proxySellerV1: Axios;
  private readonly providerReadCache = new ProviderReadCache();

  constructor(
    private readonly configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const providerApiKey = configService.get<string>('PROXY_SELLER');
    const providerApiRoot = 'https://proxy-seller.com/personal/api';
    this.proxySeller = axios.create({
      baseURL: `${providerApiRoot}/v2/${providerApiKey}`,
    });
    this.proxySellerV1 = axios.create({
      baseURL: `${providerApiRoot}/v1/${providerApiKey}`,
    });
    this.proxySeller.interceptors.request.use((config) => {
      const version = proxySellerApiVersionForPath(config.url ?? '');
      config.baseURL = `${providerApiRoot}/${version}/${providerApiKey}`;
      return config;
    });
  }

  private getProviderData<T extends { status?: string }>(
    path: string,
    policy: ProviderReadCachePolicy,
  ): Promise<T> {
    return this.providerReadCache.get(
      path,
      policy,
      async () => {
        try {
          return (await this.proxySeller.get(path)).data as T;
        } catch (error) {
          const contentType = axios.isAxiosError(error)
            ? String(error.response?.headers?.['content-type'] ?? '')
            : '';
          const canRetryWithV1 =
            (path.startsWith('/proxy/list/') || path === '/auth/list') &&
            axios.isAxiosError(error) &&
            error.response?.status === 403 &&
            contentType.toLowerCase().includes('text/html');
          if (!canRetryWithV1) throw error;
          return (await this.proxySellerV1.get(path)).data as T;
        }
      },
      (data) => this.isProviderReadCacheable(path, data),
    );
  }

  private isProviderReadCacheable(
    path: string,
    response: { status?: string; data?: unknown },
  ): boolean {
    if (response?.status !== 'success') return false;
    if (path.startsWith('/proxy/list/')) {
      return (
        typeof response.data === 'object' &&
        response.data !== null &&
        Array.isArray((response.data as { items?: unknown }).items)
      );
    }
    return Array.isArray(response.data);
  }

  private invalidateProviderReads(...prefixes: string[]): void {
    this.providerReadCache.invalidate(...prefixes);
  }

  async addAuth(userId: string, orderNumber: string, ip: string) {
    try {
      const directOrder = await this.prisma.order.findFirst({
        where: {
          userId,
          status: 'PAID',
          orderNumber,
        },
        select: { id: true },
      });

      if (!directOrder) {
        const ownedOrders = await this.prisma.order.findMany({
          where: {
            userId,
            status: 'PAID',
            type: { in: [Proxy.isp, Proxy.ipv6] },
            proxySellerId: { not: null },
          },
          select: {
            id: true,
            proxySellerId: true,
          },
        });
        const ownedOrderIds = new Map(
          ownedOrders.map((order) => [String(order.proxySellerId), order.id]),
        );
        const proxyLists = await Promise.allSettled(
          ['isp', 'ipv6'].map((type) =>
            this.getProviderData<any>(
              `/proxy/list/${type}`,
              PROVIDER_LIST_CACHE,
            ),
          ),
        );

        let matchingOrderId: string | undefined;
        for (const result of proxyLists) {
          if (
            result.status !== 'fulfilled' ||
            result.value?.status !== 'success'
          ) {
            continue;
          }

          const matchingProxy = result.value?.data?.items?.find(
            (item) =>
              item.order_number === orderNumber &&
              ownedOrderIds.has(String(item.order_id)),
          );
          if (matchingProxy) {
            matchingOrderId = ownedOrderIds.get(String(matchingProxy.order_id));
            break;
          }
        }

        if (!matchingOrderId) {
          throw new HttpException('Proxy order not found', 404);
        }

        await this.prisma.order.updateMany({
          where: {
            id: matchingOrderId,
            orderNumber: null,
          },
          data: { orderNumber },
        });
      }

      return this.createIpAuthorization(orderNumber, ip);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException('Failed to create IP authorization', 502);
    }
  }

  async createIpAuthorization(orderNumber: string, ip: string) {
    try {
      const response = await this.proxySeller.post('/auth/add/ip', {
        orderNumber,
        ip,
      });

      if (response.data?.status !== 'success') {
        throw new HttpException(
          response.data?.errors?.[0]?.message ||
            'Failed to create IP authorization',
          400,
        );
      }

      this.invalidateProviderReads('/auth/list', '/proxy/list/');

      return {
        status: 'success',
        data: response.data.data,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException('Failed to create IP authorization', 502);
    }
  }

  async findOrderNumber(
    type: 'isp' | 'ipv6',
    providerOrderId: string,
    providerProxyId: string,
  ): Promise<string | null> {
    const response = await this.getProviderData<any>(
      `/proxy/list/${type}`,
      PROVIDER_LIST_CACHE,
    );
    if (response?.status !== 'success') {
      throw new HttpException('Unable to resolve provider order number', 502);
    }

    const items = response?.data?.items;
    if (!Array.isArray(items)) {
      return null;
    }

    const proxy = items.find((item: any) => {
      const belongsToOrder = String(item.order_id) === String(providerOrderId);
      const isSelectedProxy = String(item.id) === String(providerProxyId);

      return belongsToOrder && isSelectedProxy;
    });
    return typeof proxy?.order_number === 'string' ? proxy.order_number : null;
  }

  async getIpAuthorizations(
    orderNumber: string,
  ): Promise<IpAuthorizationRdo[]> {
    const response = await this.getProviderData<any>(
      '/auth/list',
      PROVIDER_AUTH_CACHE,
    );
    if (response?.status !== 'success') {
      throw new HttpException('Unable to load IP authorizations', 502);
    }

    const items = Array.isArray(response.data) ? response.data : [];
    return items
      .filter(
        (item: any) =>
          typeof item.ip === 'string' &&
          item.ip.length > 0 &&
          String(item.orderNumber || '') === orderNumber,
      )
      .map((item: any) => ({
        id: String(item.id),
        active: Boolean(item.active),
        ip: item.ip,
        orderNumber: String(item.orderNumber),
      }));
  }

  async deleteIpAuthorization(authorizationId: string): Promise<void> {
    const response = await this.proxySeller.delete('/auth/delete', {
      data: { id: authorizationId },
    });
    if (
      response.data?.status !== 'success' ||
      response.data?.data?.deleted !== true
    ) {
      throw new HttpException('Unable to delete IP authorization', 502);
    }
    this.invalidateProviderReads('/auth/list', '/proxy/list/');
  }

  async getProductReference(): Promise<
    ResponseReferenceDTO | ResponseErrorDTO
  > {
    return productReferenceFallback;
  }

  async getGeoReference() {
    return geoReference;
  }

  async updateRotation(data: UpdateResident) {
    try {
      await this.proxySeller.post('/residentsubuser/update', {
        rotation: data.rotation,
        package_key: data.package_key,
      });

      this.invalidateProviderReads(
        '/residentsubuser/packages',
        '/residentsubuser/lists',
      );

      return { status: 'success' };
    } catch (err) {
      throw new HttpException('Try later', 403);
    }
  }

  async getProductReferenceByType(
    type: string,
  ): Promise<ResponseReferenceSingleDTO | ResponseErrorDTO> {
    if (!Object.keys(Proxy).includes(type)) {
      throw new HttpException('Invalid type', 400);
    }
    const reference = productReferenceFallback[type as Proxy];

    return {
      status: 'success',
      country: 'country' in reference ? reference.country : [],
      targets: reference.targets,
      period: 'period' in reference ? reference.period : [],
      tariffs: 'tariffs' in reference ? reference.tariffs : undefined,
      amounts:
        type !== 'resident'
          ? productReferenceFallback.amounts.filter(({ id }) => id !== '1')
          : undefined,
    };
  }

  private async getCurrentResidentTariffId(
    tariffName: string,
  ): Promise<string | number> {
    try {
      const response = await this.proxySeller.get('/reference/list/resident', {
        timeout: 20000,
      });
      const tariffs = response.data?.data?.items?.tarifs;
      if (response.data?.status !== 'success' || !Array.isArray(tariffs)) {
        throw new HttpException('Unable to load current resident tariffs', 502);
      }
      const normalizedName = tariffName.trim().toLowerCase();
      const tariff = tariffs.find((item: unknown) => {
        if (typeof item !== 'object' || item === null) return false;
        const candidate = item as Record<string, unknown>;
        return (
          candidate.personal === true &&
          typeof candidate.name === 'string' &&
          candidate.name.trim().toLowerCase() === normalizedName
        );
      }) as Record<string, unknown> | undefined;
      const tariffId = tariff?.id;
      if (typeof tariffId === 'string') {
        const normalizedId = tariffId.trim();
        if (normalizedId) return normalizedId;
      } else if (Number.isSafeInteger(tariffId) && Number(tariffId) > 0) {
        return tariffId as number;
      }
      throw new HttpException('Resident tariff not found', 400);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('Unable to load current resident tariffs', 502);
    }
  }

  async getCalc(
    query: CalcRequestDTO,
  ): Promise<ResponseCalcDTO | ResponseErrorDTO> {
    if (query.type === 'resident') {
      throw new HttpException('Invalid type! Use other route', 400);
    }

    if (query.type === 'ipv6' && query.protocol === undefined) {
      throw new HttpException('Invalid protocol for ipv6', 400);
    }
    if (query.type === 'ipv6' && query.quantity < 10) {
      throw new HttpException(
        'Number of proxies for ipv6 must be at least 10',
        400,
      );
    }

    const price = query.type === 'ipv6' ? 0.1 : 2.4;
    const totalPrice = price * query.quantity;

    return {
      status: 'success',
      price: parseFloat(price.toFixed(2)),
      totalPrice: parseFloat(totalPrice.toFixed(2)),
    };
  }

  async getCalcResident(
    query: CalcResidentRequestDTO,
  ): Promise<ResponseCalcDTO | ResponseErrorDTO> {
    const price = 2.4;
    const totalPrice = price * parseInt(query.quantity);

    return {
      status: 'success',
      price: parseFloat(price.toFixed(2)),
      totalPrice: parseFloat(totalPrice.toFixed(2)),
    };
  }

  async getCalcForOrder(type: Proxy, quantity: number): Promise<number> {
    if (type === 'resident') {
      const pricingTable: Record<number, number> = {
        1: 2.4,
        3: 7,
        10: 21,
        25: 50,
        50: 90,
        100: 170,
      };
      const price = pricingTable[quantity];

      if (price === undefined) {
        throw new HttpException(`No pricing found for ${quantity} GB`, 400);
      }

      return price;
    } else {
      const price = type === 'ipv6' ? 0.08 : 2.4;
      const totalPrice = price * quantity;

      return totalPrice;
    }
  }

  async getActiveProxyList(userId: string, type: string) {
    if (!type || !Object.keys(ActiveProxyType).includes(type)) {
      throw new HttpException('Invalid proxy type', 400);
    }

    try {
      const orders = await this.prisma.order.findMany({
        where: {
          userId,
          type: type as Proxy,
          proxySellerId: { not: null },
        },
        select: {
          proxySellerId: true,
          id: true,
          orderNumber: true,
          tariff: true,
          totalPrice: true,
          end_date: true,
        },
      });

      const proxySellerMap = new Map(
        orders.map((order) => [String(order.proxySellerId), order.id]),
      );
      const orderNumberMap = new Map(
        orders
          .filter((order) => order.orderNumber)
          .map((order) => [order.orderNumber, order.id]),
      );
      const getOwnedOrderId = (item: {
        order_id: string | number;
        order_number?: string;
        base_order_number?: string;
      }) =>
        orderNumberMap.get(item.order_number ?? null) ??
        orderNumberMap.get(item.base_order_number ?? null) ??
        proxySellerMap.get(String(item.order_id));
      const orderByProxySellerId = new Map(
        orders.map((order) => [String(order.proxySellerId), order]),
      );

      if (type !== 'resident') {
        const response = await this.getProviderData<ActiveProxy>(
          `/proxy/list/${type}`,
          PROVIDER_LIST_CACHE,
        );

        if (response.status !== 'success') {
          return {
            status: 'error',
            message: 'Invalid response from proxy provider',
          };
        }

        const filteredItems =
          response.data.items
            ?.filter((item) => Boolean(getOwnedOrderId(item)))
            ?.map(
              ({
                id,
                ip,
                protocol,
                port_socks,
                port_http,
                country,
                login,
                password,
                order_id,
                order_number,
                base_order_number,
                auth_ip,
                can_prolong,
                date_end,
              }) => ({
                id,
                ip,
                protocol,
                port_socks,
                port_http,
                country,
                login,
                password,
                order_id,
                order_number,
                auth_ip,
                can_prolong,
                orderId: getOwnedOrderId({
                  order_id,
                  order_number,
                  base_order_number,
                }),
                date_end,
              }),
            ) ?? [];

        await Promise.all(
          filteredItems
            .filter((item) => item.order_number && item.orderId)
            .map((item) =>
              this.prisma.order.updateMany({
                where: {
                  id: item.orderId,
                  orderNumber: null,
                },
                data: { orderNumber: item.order_number },
              }),
            ),
        );

        return {
          status: 'success',
          data: { items: filteredItems },
        };
      } else {
        const result: any[] = [];

        console.log(
          '[getActiveProxyList] Fetching resident packages from ProxySeller',
        );
        const traffic = await this.getProviderData<any>(
          '/residentsubuser/packages',
          PROVIDER_LIST_CACHE,
        );
        const packages = traffic.data || [];
        console.log(
          `[getActiveProxyList] Got ${packages.length} packages from ProxySeller`,
        );

        const proxySellerIds = orders.map((order) =>
          String(order.proxySellerId),
        );
        console.log(
          `[getActiveProxyList] User orders proxySellerIds:`,
          JSON.stringify(proxySellerIds),
        );

        for (const proxySellerId of proxySellerIds) {
          console.log(
            `[getActiveProxyList] Fetching lists for package_key: ${proxySellerId}`,
          );
          const response = await this.getProviderData<any>(
            `/residentsubuser/lists?package_key=${proxySellerId}`,
            PROVIDER_LIST_CACHE,
          );
          console.log(
            `[getActiveProxyList] Lists response for ${proxySellerId}: status=${response.status}, items=${response.data?.length ?? 0}`,
          );

          if (response.status !== 'success') {
            console.warn(
              `[getActiveProxyList] Skipping ${proxySellerId} - status: ${response.status}`,
            );
            continue;
          }

          const foundPackage = packages.find(
            (p) => p.package_key === proxySellerId,
          );
          const residentOrder = orderByProxySellerId.get(proxySellerId);
          console.log(
            `[getActiveProxyList] Package ${proxySellerId}: found=${!!foundPackage}, is_active=${foundPackage?.is_active}, expired_at=${JSON.stringify(foundPackage?.expired_at)}, traffic_left=${foundPackage?.traffic_left}`,
          );

          result.push({
            package_info: foundPackage,
            package_list: response.data ?? null,
            orderId: residentOrder?.id,
            order_number: residentOrder?.orderNumber,
            tariff: residentOrder?.tariff,
            prolong_price: residentOrder
              ? Number(residentOrder.totalPrice)
              : undefined,
            date_end:
              foundPackage?.expired_at?.date ??
              foundPackage?.expired_at ??
              residentOrder?.end_date,
          });
        }

        console.log(
          `[getActiveProxyList] Returning ${result.length} resident items`,
        );
        return {
          status: 'success',
          data: { items: result },
        };
      }
    } catch (error) {
      console.error('Error fetching active proxy list', {
        type,
        status: axios.isAxiosError(error) ? error.response?.status : undefined,
        message:
          error instanceof HttpException
            ? error.message
            : 'Provider read failed',
      });
      return {
        status: 'error',
        message: 'Error fetching active proxy list',
      };
    }
  }

  async placeOrder(orderInfo: OrderInfo) {
    console.log(
      '[PRODUCT.SERVICE] placeOrder called with:',
      JSON.stringify(orderInfo, null, 2),
    );
    try {
      if (orderInfo.type !== 'resident') {
        console.log(
          '[PRODUCT.SERVICE] Processing non-resident order type:',
          orderInfo.type,
        );

        // Build request payload with only necessary fields
        const requestPayload: any = {
          countryId: orderInfo.countryId,
          periodId: orderInfo.periodId,
          paymentId: 'balance',
          quantity: orderInfo.quantity,
          sectionCode: orderInfo.type,
        };

        // Add optional fields only if provided
        if (orderInfo.coupon) {
          requestPayload.coupon = orderInfo.coupon;
        }
        if (orderInfo.authorization) {
          requestPayload.authorization = orderInfo.authorization;
        }
        if (orderInfo.customTargetName) {
          requestPayload.customTargetName = orderInfo.customTargetName;
        }

        // Type-specific fields
        if (orderInfo.type === 'ipv6' && orderInfo.protocol) {
          requestPayload.protocol = orderInfo.protocol;
        }

        console.log(
          '[PRODUCT.SERVICE] Request payload:',
          JSON.stringify(requestPayload, null, 2),
        );

        const response = await this.proxySeller.post(
          '/order/make',
          requestPayload,
        );
        console.log(
          '[PRODUCT.SERVICE] Non-resident response:',
          JSON.stringify(response.data, null, 2),
        );
        if (response.data?.status === 'error') {
          throw new ProviderOrderRejectedException(
            response.data?.errors?.[0]?.message || 'Failed to place an order',
          );
        }
        if (
          response.data?.status !== 'success' ||
          !response.data?.data?.orderId
        ) {
          throw new HttpException(
            'Provider purchase requires reconciliation',
            502,
          );
        }

        const result = {
          orderId: response.data.data.orderId.toString(),
          orderNumber: response.data.data.listBaseOrderNumbers?.[0],
          package_key: undefined,
        };
        this.invalidateProviderReads(`/proxy/list/${orderInfo.type}`);
        console.log('[PRODUCT.SERVICE] Returning non-resident result:', result);
        return result;
      } else {
        const result = await new ResidentProvisioner(
          this.prisma,
          this.proxySeller,
        ).provision(orderInfo);
        this.invalidateProviderReads(
          '/residentsubuser/packages',
          '/residentsubuser/lists',
        );
        return result;
      }
    } catch (error) {
      // Axios errors include the API key in config.baseURL; log only safe fields.
      console.error('[PRODUCT.SERVICE] Order failed', {
        orderId: orderInfo.orderId,
        type: orderInfo.type,
        message:
          error instanceof HttpException
            ? error.message
            : 'Provider transport or persistence failure',
        status: error.response?.status,
      });
      if (error instanceof HttpException) {
        throw error;
      }
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        throw new ProviderOrderRejectedException(
          'Provider rejected the order',
          502,
        );
      }
      throw new HttpException('Failed to place an order', 500);
    }
  }
  async prolongProxy(data: ProlongDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: data.orderId },
    });
    if (!order) {
      console.log('wow did not find order', data.orderId);
      throw new HttpException('Order not found', 404);
    }
    const user = await this.prisma.user.findUnique({
      where: { id: order.userId },
    });
    if (!user) {
      console.log('wow did not work because of user');
      throw new HttpException('User not found', 404);
    }
    const idsArray = data.id
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const count = idsArray.length;

    const currentPrice = count * (data.type === 'isp' ? 2.4 : 0.08);
    if (new Decimal(user.balance).lt(currentPrice)) {
      console.log(
        'wow did not work because of user insufficient balance',
        user,
      );
      throw new HttpException('Insufficient balance', 400);
    }
    const response = await this.proxySeller.post(`/prolong/make/${data.type}`, {
      ids: data.id,
      periodId: data.periodId,
      paymentId: 'balance',
    });
    console.log('response', response.data);
    if (response.data.status !== 'success') {
      throw new HttpException('Invalid data', 400);
    }
    const debit = await this.prisma.user.updateMany({
      where: { id: order.userId, balance: { gte: currentPrice } },
      data: {
        balance: { decrement: currentPrice },
      },
    });
    if (debit.count !== 1)
      throw new HttpException(
        'Insufficient balance; provider renewal requires reconciliation',
        409,
      );
    await this.prisma.order.update({
      where: { id: data.orderId },
      data: {
        end_date: await this.getNextMonthDate(order.end_date),
      },
    });
    await this.prisma.order.create({
      data: {
        type: order.type,
        userId: order.userId,
        country: order.country,
        quantity: order.quantity,
        periodDays: order.periodDays,
        proxyType: order.proxyType,
        status: 'PAID',
        goal: order.goal,
        tariff: order.tariff,
        totalPrice: currentPrice,
        orderId: `${response.data.data.orderId}`,
        proxySellerId: `${response.data.data.orderId}`,
        end_date: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ).toLocaleDateString('ru-RU'),
      },
    });
    this.invalidateProviderReads(`/proxy/list/${data.type}`);
    return { status: 'success' };
  }

  async withResidentLock<T>(
    userId: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const { Client } = require('pg');
    const client = new Client({
      connectionString: this.configService.get<string>('DATABASE_URL'),
      connectionTimeoutMillis: 10000,
    });
    // A session lock is released by PostgreSQL even if the process restarts.
    let disconnected = false;
    client.on('error', () => {
      disconnected = true;
    });
    try {
      await client.connect();
      const result = await client.query(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
        [`resident:${userId}`],
      );
      if (!result.rows[0]?.locked)
        throw new HttpException(
          'Resident order is already being processed',
          409,
        );
      const value = await action();
      if (disconnected)
        throw new HttpException(
          'Resident operation requires confirmation; retry the same order',
          503,
        );
      return value;
    } finally {
      await client.end().catch(() => {});
    }
  }

  async getPendingResidentOrder(userId: string, tariff?: string) {
    const pending = await this.prisma.order.findFirst({
      where: {
        userId,
        type: 'resident',
        status: { in: ['PENDING', 'PROCESSING'] },
        OR: [
          { residentFulfillment: { not: Prisma.DbNull } },
          { status: 'PROCESSING' },
          { orderId: { not: null } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (pending && tariff && pending.tariff !== tariff) {
      throw new HttpException(
        `Complete resident order ${pending.id} before buying another tariff`,
        409,
      );
    }
    return pending;
  }

  async finishResidentOrder(
    orderId: string,
    userId: string,
    promocode?: string,
  ) {
    return this.withResidentLock(userId, () =>
      this.finishResidentOrderLocked(orderId, userId, promocode),
    );
  }

  private async finishResidentOrderLocked(
    orderId: string,
    userId: string,
    promocode?: string,
    sourceOrderId?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order || order.userId !== userId || order.type !== 'resident')
      throw new HttpException('Resident order not found', 404);
    if (order.status === 'PAID') return this.residentCheckoutResult(order);
    if (order.status === 'CANCELED')
      throw new HttpException('Order canceled', 409);
    const pending = await this.getPendingResidentOrder(userId, order.tariff!);
    if (pending && pending.id !== order.id)
      return this.finishResidentOrderLocked(pending.id, userId);
    const checkpoint =
      order.residentFulfillment as unknown as ResidentCheckpoint | null;
    if (!checkpoint && order.createdAt) {
      const newer = await this.prisma.order.findFirst({
        where: {
          userId,
          type: 'resident',
          status: 'PAID',
          id: { not: order.id },
          updatedAt: { gt: order.createdAt },
        },
      });
      if (newer)
        throw new HttpException(
          'Resident package has changed since checkout; refresh before buying again',
          409,
        );
    }
    if (order.status === 'PROCESSING' && !checkpoint) {
      throw new HttpException(
        'Previous resident purchase requires reconciliation; no new purchase made',
        409,
      );
    }
    let price = new Decimal(checkpoint?.charge ?? order.totalPrice);
    const discountCode = checkpoint ? checkpoint.discountCode : promocode;
    if (!checkpoint && discountCode) {
      const coupon = await this.prisma.coupon.findUnique({
        where: { code: discountCode },
      });
      if (!coupon || coupon.limit <= 0)
        throw new HttpException('Invalid promocode', 400);
      price = price.mul(Decimal.sub(100, coupon.discount)).div(100);
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      !price.isFinite() ||
      price.lt(0) ||
      (!checkpoint?.fundsReserved && new Decimal(user.balance).lt(price))
    )
      throw new HttpException('Insufficient balance', 400);
    const tariffId = checkpoint
      ? undefined
      : await this.getCurrentResidentTariffId(order.tariff!);

    const started = await this.prisma.order.updateMany({
      where: { id: order.id, status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'PROCESSING' },
    });
    if (started.count !== 1) {
      const current = await this.prisma.order.findUnique({
        where: { id: order.id },
      });
      if (current?.status === 'PAID')
        return this.residentCheckoutResult(current);
      throw new HttpException('Resident order state changed', 409);
    }
    try {
      const allocation = await this.placeOrder({
        type: 'resident',
        orderId: order.id,
        userId,
        tariff: order.tariff!,
        tariffId,
        paymentId: 1,
        charge: price.toString(),
        discountCode,
        sourceOrderId,
      });
      if (!allocation.package_key || !('end_date' in allocation)) {
        throw new HttpException(
          'Incomplete resident allocation; reconciliation required',
          502,
        );
      }
      const completed = await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
          const current = await tx.order.findUnique({
            where: { id: order.id },
          });
          if (current?.status === 'PAID') return current;
          if (!current || current.status !== 'PROCESSING')
            throw new HttpException('Resident order state changed', 409);
          const fulfillment =
            current.residentFulfillment as unknown as ResidentCheckpoint;
          if (!fulfillment?.fundsReserved || !fulfillment.charge)
            throw new HttpException(
              'Resident funds reservation missing; reconciliation required',
              409,
            );
          const settledPrice = new Decimal(fulfillment.charge);
          await tx.order.updateMany({
            where: {
              userId,
              type: 'resident',
              proxySellerId: allocation.package_key,
              id: { not: order.id },
            },
            data: { proxySellerId: null },
          });
          const customer = await tx.user.findUnique({
            where: { id: userId },
            include: { referredBy: true },
          });
          const partnerId = customer?.referredBy?.partnerId ?? null;
          const partnerCommission = partnerId
            ? settledPrice.mul(0.15)
            : new Decimal(0);
          const updated = await tx.order.update({
            where: { id: order.id },
            data: {
              status: 'PAID',
              totalPrice: settledPrice,
              promocode: fulfillment.discountCode ?? null,
              partnerId,
              partnerCommission,
              partnerCommissionRecordedAt: new Date(),
              residentFulfillment: {
                ...fulfillment,
                fundsReserved: false,
                fundsCaptured: true,
              },
              proxySellerId: allocation.package_key,
              orderId: allocation.orderId,
              orderNumber: allocation.orderNumber,
              end_date: allocation.end_date,
            },
          });
          if (fulfillment.discountCode && !fulfillment.couponReserved) {
            throw new HttpException(
              'Resident coupon reservation missing; reconciliation required',
              409,
            );
          }
          if (partnerId)
            await tx.partnerTransaction.create({
              data: {
                partnerId,
                amount: partnerCommission,
              },
            });
          return updated;
        },
        { isolationLevel: 'Serializable', timeout: 20000 },
      );
      return this.residentCheckoutResult(completed);
    } catch (error) {
      const latest = await this.prisma.order.findUnique({
        where: { id: order.id },
      });
      if (latest && !latest.residentFulfillment && !latest.orderId) {
        await this.prisma.order.updateMany({
          where: {
            id: order.id,
            status: 'PROCESSING',
            orderId: null,
            residentFulfillment: { equals: Prisma.DbNull },
          },
          data: { status: 'PENDING' },
        });
      }
      throw error;
    }
  }

  private async residentCheckoutResult(order: {
    id: string;
    userId: string;
    totalPrice: unknown;
    end_date: string;
    tariff: string | null;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: order.userId },
      select: { balance: true },
    });
    return {
      message: 'Successfully finished order',
      status: 'success',
      type: 'resident',
      orderId: order.id,
      price: Number(order.totalPrice),
      balance: Number(user?.balance),
      date_end: order.end_date,
      tariff: order.tariff,
    };
  }

  async prolongResident(data: ProlongResidentDto) {
    return this.withResidentLock(data.user.id, async () => {
      const order = await this.prisma.order.findFirst({
        where: {
          id: data.orderId,
          userId: data.user.id,
          type: 'resident',
          status: 'PAID',
        },
      });
      if (!order) throw new HttpException('Resident order not found', 404);
      const tariff = data.tariff ?? order.tariff;
      if (!tariff) throw new HttpException('Invalid resident tariff', 400);
      const completed = await this.prisma.order.findFirst({
        where: {
          userId: data.user.id,
          type: 'resident',
          status: 'PAID',
          residentFulfillment: { path: ['sourceOrderId'], equals: order.id },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (completed) {
        if (completed.tariff !== tariff)
          throw new HttpException(
            'This renewal already completed with a different tariff; refresh before buying again',
            409,
          );
        return this.residentCheckoutResult(completed);
      }
      if (order.proxySellerId !== data.packageKey) {
        throw new HttpException('Resident package ownership changed', 409);
      }
      const pending = await this.getPendingResidentOrder(data.user.id, tariff);
      if (pending) {
        const supersededLegacyOrder =
          pending.status === 'PROCESSING' &&
          !pending.orderId &&
          !pending.residentFulfillment &&
          pending.createdAt < order.updatedAt;
        if (!supersededLegacyOrder) {
          return this.finishResidentOrderLocked(pending.id, data.user.id);
        }
        const canceled = await this.prisma.order.updateMany({
          where: {
            id: pending.id,
            status: 'PROCESSING',
            orderId: null,
            residentFulfillment: { equals: Prisma.DbNull },
          },
          data: { status: 'CANCELED' },
        });
        if (canceled.count !== 1) {
          throw new HttpException('Resident order state changed', 409);
        }
      }
      const reference = await this.getProductReferenceByType('resident');
      if (
        reference.status !== 'success' ||
        !reference.tariffs?.some(
          (t) => t.personal && t.name.toLowerCase() === tariff.toLowerCase(),
        )
      ) {
        throw new HttpException('Resident tariff not found', 400);
      }
      const price = await this.getCalcForOrder(
        Proxy.resident,
        Number.parseInt(tariff, 10),
      );
      const user = await this.prisma.user.findUnique({
        where: { id: data.user.id },
      });
      if (!user || new Decimal(user.balance).lt(price))
        throw new HttpException('Insufficient balance', 400);
      const renewal = await this.prisma.order.create({
        data: {
          userId: data.user.id,
          type: 'resident',
          status: 'PENDING',
          country: order.country,
          quantity: order.quantity,
          periodDays: '1m',
          proxyType: order.proxyType,
          goal: order.goal,
          tariff,
          totalPrice: price,
          end_date: order.end_date,
        },
      });
      return this.finishResidentOrderLocked(
        renewal.id,
        data.user.id,
        undefined,
        order.id,
      );
    });
  }
  async modifyProxyResident(data: ModifyProxyResidentDto) {
    console.log('[modifyProxyResident] Called with:', JSON.stringify(data));

    // Check package status before attempting to create
    try {
      const packagesResp = await this.getProviderData<any>(
        '/residentsubuser/packages',
        PROVIDER_LIST_CACHE,
      );
      const packages = packagesResp.data || [];
      const pkg = packages.find((p: any) => p.package_key === data.package_key);
      console.log(
        '[modifyProxyResident] Package lookup result:',
        JSON.stringify(pkg),
      );
      if (!pkg) {
        console.error(
          `[modifyProxyResident] Package ${data.package_key} NOT FOUND in ProxySeller`,
        );
        throw new HttpException('Package not found', 400);
      }
      if (!pkg.is_active) {
        console.error(
          `[modifyProxyResident] Package ${data.package_key} is INACTIVE. expired_at: ${JSON.stringify(pkg.expired_at)}, traffic_left: ${pkg.traffic_left}`,
        );
        throw new HttpException(
          'Package is not active. Please contact support.',
          400,
        );
      }
      console.log(
        `[modifyProxyResident] Package is active. expired_at: ${JSON.stringify(pkg.expired_at)}, traffic_left: ${pkg.traffic_left}`,
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error(
        '[modifyProxyResident] Error checking package status:',
        error.message,
      );
    }

    // Build geo object, only including non-empty fields
    const geo: Record<string, string> = {};
    if (data.geo?.country) geo.country = data.geo.country;
    if (data.geo?.region) geo.region = data.geo.region;
    if (data.geo?.city) geo.city = data.geo.city;
    if (data.geo?.isp) geo.isp = data.geo.isp;

    const requestBody: Record<string, any> = {
      title: data.title,
      rotation: this.normalizeResidentRotation(data.rotation),
      whitelist: data.whitelist,
      export: {
        ports: data.ports,
      },
      package_key: data.package_key,
    };

    // Only add geo if at least one field is set
    if (Object.keys(geo).length > 0) {
      requestBody.geo = geo;
    }

    console.log(
      '[modifyProxyResident] Sending to ProxySeller:',
      JSON.stringify(requestBody),
    );
    const response = await this.proxySeller.post(
      'residentsubuser/list/add',
      requestBody,
    );
    console.log(
      '[modifyProxyResident] ProxySeller response:',
      JSON.stringify(response.data),
    );

    if (response.data.status !== 'success') {
      console.error(
        '[modifyProxyResident] ProxySeller error:',
        JSON.stringify(response.data),
      );
      throw new HttpException(response.data.errors[0].message, 400);
    }

    this.invalidateProviderReads(
      '/residentsubuser/packages',
      `/residentsubuser/lists?package_key=${data.package_key}`,
    );
    console.log('[modifyProxyResident] Success');
    return {
      status: 'success',
    };
  }

  private normalizeResidentRotation(
    rotation: ModifyProxyResidentDto['rotation'],
  ): number {
    if (
      rotation === null ||
      rotation === undefined ||
      rotation === 'each_request' ||
      (typeof rotation === 'number' && Number.isNaN(rotation))
    ) {
      return 0;
    }

    return rotation;
  }

  async deleteList(listId: number, packageKey: string) {
    const response = await this.proxySeller.delete(
      '/residentsubuser/list/delete',
      {
        data: {
          id: listId,
          package_key: packageKey,
        },
      },
    );

    if (response.data.status !== 'success') {
      return { status: 'error', error: response.data.error };
    }

    this.invalidateProviderReads(
      '/residentsubuser/packages',
      `/residentsubuser/lists?package_key=${packageKey}`,
    );
    return { status: 'success' };
  }

  async updateList(
    listId: number,
    packageKey: string,
    title?: string | undefined,
    rotation?: number | undefined,
  ) {
    if (title) {
      await this.proxySeller.post('/residentsubuser/list/rename', {
        id: listId,
        package_key: packageKey,
        title: title,
      });
      this.invalidateProviderReads(
        '/residentsubuser/packages',
        `/residentsubuser/lists?package_key=${packageKey}`,
      );
    }

    if (rotation) {
      await this.proxySeller.post('/residentsubuser/list/rotation', {
        id: listId,
        package_key: packageKey,
        rotation: rotation,
      });
      this.invalidateProviderReads(
        '/residentsubuser/packages',
        `/residentsubuser/lists?package_key=${packageKey}`,
      );
    }
    return { status: 'success' };
  }

  async convertToBytes(tariff: string): Promise<number> {
    const [valueStr, unitRaw] = tariff.trim().split(/\s+/);
    const value = parseFloat(valueStr);
    const unit = unitRaw.toLowerCase();

    const units: Record<string, number> = {
      b: 1,
      kb: 1024,
      mb: 1024 ** 2,
      gb: 1024 ** 3,
      tb: 1024 ** 4,
    };

    if (!units[unit]) throw new Error(`Unknown unit: ${unit}`);

    return Math.floor(value * units[unit]);
  }
  async getOneMonthLaterFormatted(): Promise<string> {
    const now = new Date();
    // Calculate one month later, but ensure it's strictly less than the next month's same day
    // API requires: date > today AND date < (today + 1 month)
    const oneMonthLater = new Date(now);
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
    // Subtract 1 day to ensure we're within the valid range (less than the limit)
    oneMonthLater.setDate(oneMonthLater.getDate() - 1);

    const day = String(oneMonthLater.getDate()).padStart(2, '0');
    const month = String(oneMonthLater.getMonth() + 1).padStart(2, '0'); // months are 0-indexed
    const year = oneMonthLater.getFullYear();

    return `${day}.${month}.${year}`;
  }

  async getNextMonthDate(dateStr: string): Promise<string> {
    const [day, month, year] = dateStr.split('.').map(Number);
    const date = new Date(year, month - 1, day);

    // Добавляем месяц
    date.setMonth(date.getMonth() + 1);

    // Форматируем обратно в dd.mm.yyyy
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }
}
