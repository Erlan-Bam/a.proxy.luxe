import { HttpException, Injectable } from '@nestjs/common';
import axios, { Axios, AxiosResponse } from 'axios';
import { ConfigService } from '@nestjs/config';
import {
  ReferenceResponse,
  ReferenceSingleResponse,
} from './dto/reference.response';
import {
  ResponseCalcDTO,
  ResponseErrorDTO,
  ResponseReferenceDTO,
  ResponseReferenceSingleDTO,
} from './rdo/response.dto';
import { CalcRequestDTO, CalcResidentRequestDTO } from './dto/request.dto';
import { ActiveProxy, ActiveProxyType } from './rdo/get-active-proxy.rdo';
import { Proxy } from '@prisma/client';
import { OrderInfo } from './dto/order.dto';
import { PrismaService } from '../v1/shared/prisma.service';
import * as path from 'path';
import * as fs from 'fs';
import { ModifyProxyResidentDto } from './dto/modify-proxy.dto';
import { title } from 'process';

@Injectable()
export class ProductService {
  private readonly proxySeller: Axios;

  constructor(
    private readonly configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.proxySeller = axios.create({
      baseURL: `https://proxy-seller.com/personal/api/v1/${configService.get<string>('PROXY_SELLER')}`,
    });
  }

  async addAuth(orderId: string | number, authOrIp: string) {
    try {
      const response = await this.proxySeller.get(
        `/proxy/list?orderId=${orderId}`,
      );

      console.log(response.data.data.items[0]);

      const parts = authOrIp.split(':');
      if (parts.length === 2) {
        await this.proxySeller.post('/auth/add', {
          orderNumber: response.data.data.items[0].order_number,
          generateAuth: authOrIp,
        });
      } else if (parts.length === 4) {
        await this.proxySeller.post('/auth/add/ip', {
          orderNumber: response.data.data.items[0].order_number,
          ip: authOrIp,
        });
      } else {
        throw new Error('Invalid format');
      }

      return { status: response.data.status };
    } catch (error) {
      throw new HttpException('Something went wrong...', 500);
    }
  }

  async getProductReference(): Promise<
    ResponseReferenceDTO | ResponseErrorDTO
  > {
    const response: AxiosResponse<ReferenceResponse> =
      await this.proxySeller.get('/reference/list');

    const reference = response.data;

    if (!reference.data) {
      return {
        status: 'error',
        message: 'Error accessing the service. Repeat the request later!',
      };
    }

    const isp = reference.data.isp;
    const ipv6 = reference.data.ipv6;
    const resident = reference.data.resident;
    const amounts = [
      {
        id: '1',
        text: '1 шт',
      },
      {
        id: '10',
        text: '10 шт',
      },
      {
        id: '20',
        text: '20 шт',
      },
      {
        id: '30',
        text: '30 шт',
      },
      {
        id: '50',
        text: '50 шт',
      },
      {
        id: '100',
        text: '100 шт',
      },
    ];

    return {
      status: 'success',
      isp: {
        country: isp?.country,
        period: isp?.period,
        targets: isp?.target?.map(({ sectionId, name }) => ({
          sectionId,
          name,
        })),
      },
      ipv6: {
        country: ipv6?.country,
        period: ipv6?.period,
        targets: ipv6?.target?.map(({ sectionId, name }) => ({
          sectionId,
          name,
        })),
      },
      resident: {
        tariffs: resident?.tarifs,
        targets: resident?.target?.map(({ sectionId, name }) => ({
          sectionId,
          name,
        })),
      },
      amounts: amounts,
    };
  }

  async getGeoReference() {
    const filePath = path.join(process.cwd(), 'src', 'uploads', 'geo.json');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const geoData = JSON.parse(fileContent);
    return geoData;
  }

  async getProductReferenceByType(
    type: string,
  ): Promise<ResponseReferenceSingleDTO | ResponseErrorDTO> {
    if (!Object.keys(Proxy).includes(type)) {
      throw new HttpException('Invalid type', 400);
    }
    const response: AxiosResponse<ReferenceSingleResponse> =
      await this.proxySeller.get(`/reference/list/${type}`);
    const reference = response.data;

    if (!reference.data) {
      return {
        status: 'error',
        message: 'Error accessing the service. Repeat the request later!',
      };
    }
    const amounts = [
      {
        id: '10',
        text: '10 шт',
      },
      {
        id: '20',
        text: '20 шт',
      },
      {
        id: '30',
        text: '30 шт',
      },
      {
        id: '50',
        text: '50 шт',
      },
      {
        id: '100',
        text: '100 шт',
      },
    ];

    return {
      status: 'success',
      country: reference?.data.items.country,
      targets: reference?.data.items.target.map(({ sectionId, name }) => ({
        sectionId,
        name,
      })),
      period: reference?.data.items.period,
      tariffs: reference?.data.items.tarifs,
      amounts: type !== 'resident' ? amounts : undefined,
    };
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
        where: { userId, proxySellerId: { not: null } },
        select: { proxySellerId: true },
      });

      const proxySellerIds = new Set(
        orders.map((order) => order.proxySellerId),
      );

      if (type !== 'resident') {
        const response: AxiosResponse<ActiveProxy> = await this.proxySeller.get(
          `/proxy/list/${type}`,
        );

        if (response.data.status !== 'success') {
          return {
            status: 'error',
            message: 'Invalid response from proxy provider',
          };
        }

        const filteredItems =
          response.data.data.items
            ?.filter((item) => proxySellerIds.has(item.order_id))
            ?.map(
              ({
                ip,
                protocol,
                port_socks,
                port_http,
                country,
                login,
                password,
              }) => ({
                ip,
                protocol,
                port_socks,
                port_http,
                country,
                login,
                password,
              }),
            ) ?? [];

        return {
          status: 'success',
          data: { items: filteredItems },
        };
      } else {
        const result: any[] = [];

        const traffic = await this.proxySeller.get(`/residentsubuser/packages`);
        const packages = traffic.data.data || [];

        for (const proxySellerId of proxySellerIds) {
          const response = await this.proxySeller.get(
            `/residentsubuser/lists?package_key=${proxySellerId}`,
          );
          if (response.data.status !== 'success') {
            continue;
          }

          const foundPackage = packages.find(
            (p) => p.package_key === proxySellerId,
          );

          result.push({
            package_info: foundPackage,
            package_list: response.data.data ?? null,
          });
        }

        return {
          status: 'success',
          data: { items: result },
        };
      }
    } catch (error) {
      console.error('Error fetching active proxy list:', error);
      return {
        status: 'error',
        message: 'Error fetching active proxy list',
      };
    }
  }

  async placeOrder(orderInfo: OrderInfo) {
    try {
      if (orderInfo.type !== 'resident') {
        const response = await this.proxySeller.post('/order/make', orderInfo);
        return response.data.data.orderId.toString();
      } else {
        await this.proxySeller.post('/order/make', {
          tarifId: orderInfo.tariffId,
          paymentId: 1,
        });
        const tariff = await this.convertToBytes(orderInfo.tariff as string);
        const response = await this.proxySeller.post(
          '/residentsubuser/create',
          {
            is_link_date: false,
            rotation: 1,
            traffic_limit: tariff.toString(),
            expired_at: this.getOneMonthLaterFormatted(),
          },
        );
        return response.data.data.package_key;
      }
    } catch (error) {
      console.log(error);
      throw new HttpException('Failed to place an order', 500);
    }
  }
  async modifyProxyResident(data: ModifyProxyResidentDto) {
    const response = await this.proxySeller.post('residentsubuser/list/add', {
      title: data.title,
      rotation: data.rotation,
      whitelist: data.whitelist,
      export: {
        ports: data.ports,
      },
      geo: {
        country: data.geo.country,
        region: data.geo.region,
        city: data.geo.city,
        isp: data.geo.isp,
      },
      package_key: data.package_key,
    });

    if (response.data.status !== 'success') {
      throw new HttpException(response.data.errors[0].message, 400);
    }

    return {
      status: 'success',
    };
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
    const oneMonthLater = new Date(now);
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

    const day = String(oneMonthLater.getDate()).padStart(2, '0');
    const month = String(oneMonthLater.getMonth() + 1).padStart(2, '0');
    const year = oneMonthLater.getFullYear();

    return `${day}.${month}.${year}`;
  }
}
