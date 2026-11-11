import { HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
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

function parseProxyExpiry(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const european = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!european && !iso) return null;
  const year = Number(european?.[3] ?? iso?.[1]);
  const month = Number(european?.[2] ?? iso?.[2]);
  const day = Number(european?.[1] ?? iso?.[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

function addProxyMonths(date: Date, months: number): Date {
  const first = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return first;
}

function formatProxyExpiry(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, '0')}.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${date.getUTCFullYear()}`;
}

@Injectable()
export class ProductService {
  private readonly proxySeller: Axios;
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
          if (axios.isAxiosError(error) && error.response?.status === 403) {
            this.invalidateProviderReads(path);
          }
          throw error;
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
      const response = await this.proxySeller.post('/residentsubuser/update', {
        rotation: data.rotation,
        package_key: data.package_key,
      });
      if (response.data?.status !== 'success') {
        throw new HttpException('Unable to update resident rotation', 502);
      }

      this.invalidateProviderReads(
        '/residentsubuser/packages',
        '/residentsubuser/lists',
      );

      return { status: 'success' };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException('Unable to update resident rotation', 502);
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
      const unnumberedOrderIds = new Set(
        orders
          .filter((order) => order.orderNumber === null)
          .map((order) => order.id),
      );
      const legacyBaseOrderNumberMap = new Map<string, string>();
      const ambiguousLegacyBases = new Set<string>();
      if (type === 'isp') {
        for (const order of orders) {
          const match = /^(\d+_\d+)_e_[A-Za-z0-9]+$/.exec(
            order.orderNumber ?? '',
          );
          if (
            !match ||
            match[1].split('_')[0] !== String(order.proxySellerId)
          ) {
            continue;
          }
          const baseOrderNumber = match[1];
          if (ambiguousLegacyBases.has(baseOrderNumber)) continue;
          if (legacyBaseOrderNumberMap.has(baseOrderNumber)) {
            legacyBaseOrderNumberMap.delete(baseOrderNumber);
            ambiguousLegacyBases.add(baseOrderNumber);
          } else {
            legacyBaseOrderNumberMap.set(baseOrderNumber, order.id);
          }
        }
      }
      const getOwnedOrderId = (item: {
        order_id: string | number;
        order_number?: string;
        base_order_number?: string;
      }) =>
        orderNumberMap.get(item.order_number ?? null) ??
        orderNumberMap.get(item.base_order_number ?? null) ??
        proxySellerMap.get(String(item.order_id)) ??
        (item.base_order_number
          ? legacyBaseOrderNumberMap.get(item.base_order_number)
          : undefined);
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
            .filter(
              (item) =>
                item.order_number &&
                item.orderId &&
                unnumberedOrderIds.has(item.orderId),
            )
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
        if (traffic?.status !== 'success' || !Array.isArray(traffic.data)) {
          throw new HttpException('Resident packages unavailable', 502);
        }
        const packages = traffic.data;
        console.log(
          `[getActiveProxyList] Got ${packages.length} packages from ProxySeller`,
        );

        const packageByKey = new Map<string, any>(
          packages.map((item) => [String(item.package_key), item]),
        );
        const proxySellerIds = orders
          .filter((order) => {
            const providerPackage = packageByKey.get(
              String(order.proxySellerId),
            );
            return providerPackage && providerPackage.is_active !== false;
          })
          .map((order) => String(order.proxySellerId));
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

          if (response?.status !== 'success' || !Array.isArray(response.data)) {
            throw new HttpException('Resident proxy lists unavailable', 502);
          }

          const foundPackage = packageByKey.get(proxySellerId);
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
    if (
      !data.user?.id ||
      data.user.id !== order.userId ||
      order.type !== data.type
    ) {
      throw new HttpException('Proxy order does not belong to user', 403);
    }
    if (data.type !== 'isp' && data.type !== 'ipv6') {
      throw new HttpException('Use resident renewal endpoint', 400);
    }
    const idsArray = (
      Array.isArray(data.id)
        ? data.id
        : typeof data.id === 'string'
          ? data.id.split(',')
          : []
    )
      .map((id) => (typeof id === 'string' ? id.trim() : ''))
      .filter(Boolean);
    if (!idsArray.length || new Set(idsArray).size !== idsArray.length) {
      throw new HttpException('Invalid proxy IDs', 400);
    }
    const months = Number(data.periodId.slice(0, -1));
    if (![1, 3, 6].includes(months) || data.periodId !== `${months}m`) {
      throw new HttpException('Invalid renewal period', 400);
    }
    const requestKey = createHash('sha256')
      .update(JSON.stringify([order.id, [...idsArray].sort(), data.periodId]))
      .digest('hex');
    const previous = await this.prisma.proxyRenewalAttempt.findFirst({
      where: {
        sourceOrderId: order.id,
        requestKey,
        status: 'PAID',
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (previous) {
      throw new HttpException(
        'This renewal was recently completed; verify expiry before retrying',
        409,
      );
    }
    const owned = await this.getActiveProxyList(order.userId, data.type);
    if (owned.status !== 'success' || !owned.data?.items) {
      throw new HttpException('Unable to verify proxy ownership', 503);
    }
    const orderItems = owned.data.items.filter(
      (item) => item.orderId === order.id,
    );
    const ownedIds = new Set(orderItems.map((item) => String(item.id)));
    if (idsArray.some((id) => !ownedIds.has(id))) {
      throw new HttpException('Proxy does not belong to order', 403);
    }
    const user = await this.prisma.user.findUnique({
      where: { id: order.userId },
    });
    if (!user) {
      console.log('wow did not work because of user');
      throw new HttpException('User not found', 404);
    }
    const count = idsArray.length;
    const currentPrice = count * months * (data.type === 'isp' ? 2.4 : 0.08);
    if (new Decimal(user.balance).lt(currentPrice)) {
      throw new HttpException('Insufficient balance', 400);
    }
    const requestedIds = new Set(idsArray);
    const originalExpiry = parseProxyExpiry(order.end_date);
    const expiresBefore: Record<string, string> = {};
    const expiresAfter: Record<string, string> = {};
    const expiryDates = orderItems.map((item) => {
      const currentExpiry = parseProxyExpiry(item.date_end) ?? originalExpiry;
      if (!currentExpiry) {
        throw new HttpException('Unable to determine proxy expiry', 503);
      }
      if (requestedIds.has(String(item.id))) {
        expiresBefore[String(item.id)] = formatProxyExpiry(currentExpiry);
        expiresAfter[String(item.id)] = formatProxyExpiry(
          addProxyMonths(currentExpiry, months),
        );
      }
      return {
        id: String(item.id),
        date: requestedIds.has(String(item.id))
          ? addProxyMonths(currentExpiry, months)
          : currentExpiry,
      };
    });
    const sourceEndDate = formatProxyExpiry(
      new Date(
        Math.max(
          originalExpiry?.getTime() ?? 0,
          ...expiryDates.map((item) => item.date.getTime()),
        ),
      ),
    );
    const renewalEndDate = formatProxyExpiry(
      new Date(
        Math.max(
          ...expiryDates
            .filter((item) => requestedIds.has(item.id))
            .map((item) => item.date.getTime()),
        ),
      ),
    );
    let attempt;
    try {
      attempt = await this.prisma.$transaction(async (tx) => {
        const created = await tx.proxyRenewalAttempt.create({
          data: {
            sourceOrderId: order.id,
            activeSourceOrderId: order.id,
            userId: order.userId,
            type: data.type,
            ids: idsArray,
            periodId: data.periodId,
            requestKey,
            amount: currentPrice,
            expiresBefore,
            expiresAfter,
            sourceEndDate,
            renewalEndDate,
            status: 'PROCESSING',
          },
        });
        const reserved = await tx.user.updateMany({
          where: { id: order.userId, balance: { gte: currentPrice } },
          data: { balance: { decrement: currentPrice } },
        });
        if (reserved.count !== 1) {
          throw new HttpException('Insufficient balance', 400);
        }
        return created;
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new HttpException('Renewal is pending confirmation', 409);
      }
      throw error;
    }
    let response;
    try {
      response = await this.proxySeller.post(`/prolong/make/${data.type}`, {
        ids: idsArray,
        periodId: data.periodId,
        paymentId: 'balance',
      });
    } catch (error) {
      console.warn('[PRODUCT.SERVICE] Proxy renewal request failed', {
        orderId: order.id,
        type: data.type,
        status: error.response?.status,
      });
      throw new HttpException('Provider renewal request failed', 502);
    }
    if (!response.data?.status) {
      throw new HttpException('Provider renewal requires reconciliation', 503);
    }
    if (response.data.status === 'error') {
      const providerMessage = response.data.errors?.[0]?.message;
      console.warn('[PRODUCT.SERVICE] Proxy renewal rejected', {
        orderId: order.id,
        type: data.type,
        providerMessage:
          typeof providerMessage === 'string'
            ? providerMessage
            : 'Unknown provider error',
      });
      await this.prisma.$transaction(async (tx) => {
        const canceled = await tx.proxyRenewalAttempt.updateMany({
          where: { id: attempt.id, status: 'PROCESSING' },
          data: { status: 'CANCELED', activeSourceOrderId: null },
        });
        if (canceled.count === 1) {
          await tx.user.update({
            where: { id: order.userId },
            data: { balance: { increment: currentPrice } },
          });
        }
      });
      throw new HttpException('Provider rejected renewal', 502);
    }
    if (response.data.status !== 'success') {
      throw new HttpException('Provider renewal requires reconciliation', 503);
    }
    const providerOrderId = response.data.data?.orderId;
    if (!providerOrderId) {
      throw new HttpException('Provider renewal requires reconciliation', 503);
    }
    await this.prisma.proxyRenewalAttempt.update({
      where: { id: attempt.id },
      data: { providerOrderId: String(providerOrderId) },
    });
    let confirmedItems: Array<{
      id: string;
      orderId: string;
      date_end: string;
    }> | null = null;
    for (let read = 0; read < 3; read++) {
      this.invalidateProviderReads(`/proxy/list/${data.type}`);
      try {
        const current = await this.getActiveProxyList(order.userId, data.type);
        if (current.status === 'success' && current.data?.items) {
          const candidates = current.data.items.filter(
            (item) => item.orderId === order.id,
          );
          const byId = new Map(
            candidates.map((item) => [String(item.id), item]),
          );
          const allAdvanced = idsArray.every((id) => {
            const actual = parseProxyExpiry(byId.get(id)?.date_end);
            const before = parseProxyExpiry(expiresBefore[id]);
            return (
              actual &&
              before &&
              actual.getTime() - before.getTime() >=
                months * 30 * 24 * 60 * 60 * 1000
            );
          });
          if (allAdvanced) {
            confirmedItems = candidates;
            break;
          }
        }
      } catch (error) {
        // A paid provider response remains reserved for reconciliation.
      }
      if (read < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    if (!confirmedItems) {
      throw new HttpException('Provider renewal requires reconciliation', 503);
    }
    const confirmedExpiries: Record<string, string> = {};
    for (const id of idsArray) {
      const item = confirmedItems.find(
        (candidate) => String(candidate.id) === id,
      );
      const actual = parseProxyExpiry(item?.date_end);
      if (!actual) {
        throw new HttpException(
          'Provider renewal requires reconciliation',
          503,
        );
      }
      confirmedExpiries[id] = formatProxyExpiry(actual);
    }
    const confirmedSourceEndDate = formatProxyExpiry(
      new Date(
        Math.max(
          ...confirmedItems.map(
            (item) => parseProxyExpiry(item.date_end)?.getTime() ?? 0,
          ),
        ),
      ),
    );
    const confirmedRenewalEndDate = formatProxyExpiry(
      new Date(
        Math.max(
          ...idsArray.map(
            (id) => parseProxyExpiry(confirmedExpiries[id])?.getTime() ?? 0,
          ),
        ),
      ),
    );
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: data.orderId },
          data: { end_date: confirmedSourceEndDate },
        });
        const localOrder = await tx.order.create({
          data: {
            type: order.type,
            userId: order.userId,
            country: order.country,
            quantity: count,
            periodDays: order.periodDays,
            proxyType: order.proxyType,
            status: 'PAID',
            goal: order.goal,
            tariff: order.tariff,
            totalPrice: currentPrice,
            orderId: String(providerOrderId),
            proxySellerId: null,
            end_date: confirmedRenewalEndDate,
          },
        });
        await tx.proxyRenewalAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'PAID',
            activeSourceOrderId: null,
            localOrderId: localOrder.id,
            expiresAfter: confirmedExpiries,
            sourceEndDate: confirmedSourceEndDate,
            renewalEndDate: confirmedRenewalEndDate,
          },
        });
      });
    } catch (error) {
      console.error('[PRODUCT.SERVICE] Provider renewal needs reconciliation', {
        orderId: order.id,
        type: data.type,
        providerOrderId: String(providerOrderId),
      });
      if (error instanceof HttpException) throw error;
      throw new HttpException('Provider renewal requires reconciliation', 503);
    }
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
      const response = await this.proxySeller.post('/residentsubuser/list/rename', {
        id: listId,
        package_key: packageKey,
        title: title,
      });
      if (response.data?.status !== 'success') {
        throw new HttpException('Unable to rename resident proxy list', 502);
      }
      this.invalidateProviderReads(
        '/residentsubuser/packages',
        `/residentsubuser/lists?package_key=${packageKey}`,
      );
    }

    if (rotation !== undefined) {
      const response = await this.proxySeller.post('/residentsubuser/list/rotation', {
        id: listId,
        package_key: packageKey,
        rotation: rotation,
      });
      if (response.data?.status !== 'success') {
        throw new HttpException('Unable to update resident list rotation', 502);
      }
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
