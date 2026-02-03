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
import { ProlongDto } from './dto/prolog.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { UpdateResident } from './dto/update-resident.dto';

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

  async addAuth(orderNumber: string | number, ip: string) {
    try {
      const parts = ip.split('.');
      if (parts.length === 4) {
        await this.proxySeller.post('/auth/add/ip', {
          orderNumber: orderNumber,
          ip: ip,
        });
      } else {
        throw new Error('Invalid format');
      }

      return { status: 'success' };
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

    return {
      status: 'success',
      isp: {
        country: [
          {
            id: 3758,
            name: 'USA',
            alpha3: 'USA',
          },
          {
            id: 4479,
            name: 'Poland',
            alpha3: 'POL',
          },
          {
            id: 4480,
            name: 'Netherlands',
            alpha3: 'NLD',
          },
          {
            id: 5236,
            name: 'Brazil',
            alpha3: 'BRA',
          },
          {
            id: 5389,
            name: 'Latvia',
            alpha3: 'LVA',
          },
          {
            id: 6269,
            name: 'France',
            alpha3: 'FRA',
          },
          {
            id: 6271,
            name: 'Romania',
            alpha3: 'ROU',
          },
          {
            id: 6272,
            name: 'Canada',
            alpha3: 'CAN',
          },
          {
            id: 6911,
            name: 'Norway',
            alpha3: 'NOR',
          },
          {
            id: 6963,
            name: 'Austria',
            alpha3: 'AUT',
          },
          {
            id: 7738,
            name: 'England',
            alpha3: 'GBR',
          },
          {
            id: 7894,
            name: 'Ukraine',
            alpha3: 'UKR',
          },
          {
            id: 7952,
            name: 'Turkey',
            alpha3: 'TUR',
          },
          {
            id: 7953,
            name: 'Japan',
            alpha3: 'JPN',
          },
          {
            id: 7954,
            name: 'Israel',
            alpha3: 'ISR',
          },
          {
            id: 8658,
            name: 'Taiwan',
            alpha3: 'TWN',
          },
          {
            id: 8659,
            name: 'South Korea',
            alpha3: 'KOR',
          },
          {
            id: 9767,
            name: 'Germany',
            alpha3: 'DEU',
          },
          {
            id: 10257,
            name: 'Singapore',
            alpha3: 'SGP',
          },
          {
            id: 11674,
            name: 'Hong Kong',
            alpha3: 'HKN',
          },
          {
            id: 12245,
            name: 'Thailand',
            alpha3: 'THA',
          },
          {
            id: 15701,
            name: 'Italy',
            alpha3: 'ITA',
          },
        ],
        period: [
          {
            id: '1w',
            name: '1 week',
          },
          {
            id: '2w',
            name: '2 weeks',
          },
          {
            id: '1m',
            name: '1 month',
          },
          {
            id: '2m',
            name: '2 months',
          },
          {
            id: '3m',
            name: '3 months',
          },
          {
            id: '6m',
            name: '6 months',
          },
          {
            id: '9m',
            name: '9 months',
          },
          {
            id: '12m',
            name: '12 months',
          },
        ],
        targets: [
          {
            sectionId: 21,
            name: 'Gaming',
          },
          {
            sectionId: 13,
            name: 'Social media',
          },
          {
            sectionId: 40,
            name: 'For Game bots',
          },
          {
            sectionId: 79,
            name: 'Online Marketplaces',
          },
          {
            sectionId: 39,
            name: 'For Web scraping',
          },
          {
            sectionId: 8,
            name: 'Other purposes',
          },
          {
            sectionId: 78,
            name: 'Sneaker websites',
          },
          {
            sectionId: 86,
            name: 'For Sneaker bots',
          },
          {
            sectionId: 32,
            name: 'For Instagram',
          },
          {
            sectionId: 41,
            name: 'For other program',
          },
          {
            sectionId: 7,
            name: 'Web Scraping',
          },
        ],
      },
      ipv6: {
        country: [
          {
            id: 610,
            name: 'Proxy of Germany',
            alpha3: 'DEU',
          },
          {
            id: 611,
            name: 'Proxy of France',
            alpha3: 'FRA',
          },
          {
            id: 612,
            name: 'Proxy of Netherlands',
            alpha3: 'NLD',
          },
          {
            id: 613,
            name: 'Proxy of Canada',
            alpha3: 'CAN',
          },
          {
            id: 785,
            name: 'Proxy of US',
            alpha3: 'USA',
          },
          {
            id: 1263,
            name: 'Proxy of England',
            alpha3: 'GBR',
          },
          {
            id: 1292,
            name: 'Proxy of Australia',
            alpha3: 'AUS',
          },
          {
            id: 2060,
            name: 'Proxy of Spain',
            alpha3: 'ESP',
          },
          {
            id: 3910,
            name: 'Proxy of Czech',
            alpha3: 'CZE',
          },
          {
            id: 4432,
            name: 'Proxy of Turkey',
            alpha3: 'TUR',
          },
          {
            id: 4433,
            name: 'Proxy of Romania',
            alpha3: 'ROU',
          },
          {
            id: 4477,
            name: 'Proxy of Singapore',
            alpha3: 'SGP',
          },
          {
            id: 4546,
            name: 'Proxy of Japan',
            alpha3: 'JPN',
          },
          {
            id: 4650,
            name: 'Proxy of Bulgaria',
            alpha3: 'BGR',
          },
          {
            id: 8145,
            name: 'Proxy of Portugal',
            alpha3: 'PRT',
          },
          {
            id: 20554,
            name: 'Proxy of Brazil',
            alpha3: 'BRA',
          },
          {
            id: 20562,
            name: 'Proxy of India',
            alpha3: 'IND',
          },
        ],
        period: [
          {
            id: '1w',
            name: '1 week',
          },
          {
            id: '2w',
            name: '2 weeks',
          },
          {
            id: '1m',
            name: '1 month',
          },
          {
            id: '2m',
            name: '2 months',
          },
          {
            id: '3m',
            name: '3 months',
          },
          {
            id: '6m',
            name: '6 months',
          },
          {
            id: '9m',
            name: '9 months',
          },
          {
            id: '12m',
            name: '12 months',
          },
        ],
        targets: [
          {
            sectionId: 32,
            name: 'For Instagram',
          },
          {
            sectionId: 8,
            name: 'Other purposes',
          },
          {
            sectionId: 13,
            name: 'Social media',
          },
          {
            sectionId: 39,
            name: 'For Web scraping',
          },
          {
            sectionId: 7,
            name: 'Web Scraping',
          },
          {
            sectionId: 79,
            name: 'Online Marketplaces',
          },
        ],
      },
      resident: {
        tariffs: [
          {
            id: 6928,
            name: '500 Mb',
            personal: false,
          },
          {
            id: 25208,
            name: '1 Gb',
            personal: true,
          },
          {
            id: 9866,
            name: '1 Gb',
            personal: false,
          },
          {
            id: 25209,
            name: '3 Gb',
            personal: true,
          },
          {
            id: 11403,
            name: '3 Gb',
            personal: false,
          },
          {
            id: 25210,
            name: '10 Gb',
            personal: true,
          },
          {
            id: 25211,
            name: '25 Gb',
            personal: true,
          },
          {
            id: 11404,
            name: '10 Gb',
            personal: false,
          },
          {
            id: 9982,
            name: '25 Gb',
            personal: false,
          },
          {
            id: 6938,
            name: '50 Gb',
            personal: false,
          },
          {
            id: 25212,
            name: '50 Gb',
            personal: true,
          },
          {
            id: 6937,
            name: '100 Gb',
            personal: false,
          },
          {
            id: 17721,
            name: '100 Gb',
            personal: true,
          },
          {
            id: 25213,
            name: '200 Gb',
            personal: true,
          },
          {
            id: 11407,
            name: '200 Gb',
            personal: false,
          },
          {
            id: 6936,
            name: '300 Gb',
            personal: false,
          },
          {
            id: 25214,
            name: '300 Gb',
            personal: true,
          },
          {
            id: 25215,
            name: '500 Gb',
            personal: true,
          },
          {
            id: 11405,
            name: '500 Gb',
            personal: false,
          },
          {
            id: 25216,
            name: '750 Gb',
            personal: true,
          },
          {
            id: 11406,
            name: '750 Gb',
            personal: false,
          },
          {
            id: 6935,
            name: '1000 Gb',
            personal: false,
          },
          {
            id: 25217,
            name: '1000 Gb',
            personal: true,
          },
          {
            id: 25218,
            name: '3000 Gb',
            personal: true,
          },
          {
            id: 11413,
            name: '3000 Gb',
            personal: false,
          },
        ],
        targets: [],
      },
      amounts: [
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
      ],
    };
  }

  async getGeoReference() {
    const filePath = path.join(process.cwd(), 'src', 'uploads', 'geo.json');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const geoData = JSON.parse(fileContent);
    return geoData;
  }

  async updateRotation(data: UpdateResident) {
    try {
      await this.proxySeller.post('/residentsubuser/update', {
        rotation: data.rotation,
        package_key: data.package_key,
      });

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
        select: { proxySellerId: true, id: true },
      });

      const proxySellerMap = new Map(
        orders.map((order) => [order.proxySellerId, order.id]),
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
            ?.filter((item) => proxySellerMap.has(item.order_id))
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
                orderId: proxySellerMap.get(order_id),
                date_end,
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

        const proxySellerIds = orders.map((order) => order.proxySellerId);
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
            orderId: proxySellerMap.get(proxySellerId),
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
        console.log(
          '[PRODUCT.SERVICE] Processing non-resident order type:',
          orderInfo.type,
        );
        const response = await this.proxySeller.post('/order/make', orderInfo);
        console.log(
          '[PRODUCT.SERVICE] Non-resident response:',
          JSON.stringify(response.data, null, 2),
        );
        const result = {
          orderId: response.data.data.orderId.toString(),
          package_key: undefined,
        };
        console.log('[PRODUCT.SERVICE] Returning non-resident result:', result);
        return result;
      } else {
        console.log('[PRODUCT.SERVICE] Processing resident order');
        console.log('[PRODUCT.SERVICE] Tariff ID:', orderInfo.tariffId);
        console.log('[PRODUCT.SERVICE] User ID:', orderInfo.userId);
        console.log('[PRODUCT.SERVICE] Tariff string:', orderInfo.tariff);

        const tariffResponse = await this.proxySeller.post('/order/make', {
          tarifId: orderInfo.tariffId,
          paymentId: 1,
        });
        console.log(
          '[PRODUCT.SERVICE] Tariff response:',
          JSON.stringify(tariffResponse.data, null, 2),
        );

        const tariff = await this.convertToBytes(orderInfo.tariff as string);
        console.log('[PRODUCT.SERVICE] Converted tariff to bytes:', tariff);

        const proxies = await this.getActiveProxyList(
          orderInfo.userId,
          'resident',
        );
        console.log(
          '[PRODUCT.SERVICE] getActiveProxyList returned status:',
          proxies.status,
        );
        console.log('[PRODUCT.SERVICE] Proxies data exists:', !!proxies.data);
        console.log(
          '[PRODUCT.SERVICE] Proxies items exists:',
          !!proxies.data?.items,
        );
        console.log(
          '[PRODUCT.SERVICE] Proxies items length:',
          proxies.data?.items?.length,
        );
        console.log(
          '[PRODUCT.SERVICE] Full proxies response:',
          JSON.stringify(proxies, null, 2),
        );

        const resident = proxies.data?.items[0];
        console.log(
          '[PRODUCT.SERVICE] Resident (first item):',
          resident ? 'EXISTS' : 'NULL/UNDEFINED',
        );
        console.log(
          '[PRODUCT.SERVICE] Resident value:',
          JSON.stringify(resident, null, 2),
        );
        console.log(
          '[PRODUCT.SERVICE] Resident (first item):',
          resident ? 'EXISTS' : 'NULL/UNDEFINED',
        );
        console.log(
          '[PRODUCT.SERVICE] Resident value:',
          JSON.stringify(resident, null, 2),
        );
        if (resident) {
          console.log(
            '[PRODUCT.SERVICE] Resident found, accessing package_info',
          );
          console.log(
            '[PRODUCT.SERVICE] package_info exists:',
            !!resident.package_info,
          );
          console.log(
            '[PRODUCT.SERVICE] package_info value:',
            JSON.stringify(resident.package_info, null, 2),
          );

          if (!resident.package_info) {
            console.error(
              '[PRODUCT.SERVICE] ERROR: package_info is null/undefined!',
            );
            throw new HttpException(
              'Package info is missing for resident proxy',
              500,
            );
          }

          console.log(
            '[PRODUCT.SERVICE] package_key:',
            resident.package_info.package_key,
          );
          console.log(
            '[PRODUCT.SERVICE] traffic_limit:',
            resident.package_info.traffic_limit,
          );

          const response = await this.proxySeller.post(
            '/residentsubuser/update',
            {
              is_link_date: false,
              traffic_limit: String(
                Number(resident.package_info.traffic_limit) + Number(tariff),
              ),
              is_active: true,
              expired_at: await this.getOneMonthLaterFormatted(),
              package_key: resident.package_info.package_key,
            },
          );
          console.log(
            '[PRODUCT.SERVICE] Update response:',
            JSON.stringify(response.data, null, 2),
          );

          // Check if update was successful
          if (response.data.status !== 'success' || !response.data.data) {
            console.error(
              '[PRODUCT.SERVICE] ERROR: Update resident package failed:',
              JSON.stringify(response.data.errors, null, 2),
            );
            throw new HttpException(
              response.data.errors?.[0]?.message ||
                'Failed to update resident package',
              500,
            );
          }

          console.log('[PRODUCT.SERVICE] Returning update result');
          return {
            package_key: response.data.data.package_key,
            orderId: tariffResponse.data.data.orderId.toString(),
          };
        } else {
          console.log(
            '[PRODUCT.SERVICE] No existing resident found, creating new one',
          );
          const response = await this.proxySeller.post(
            '/residentsubuser/create',
            {
              is_link_date: false,
              rotation: 1,
              is_active: true,
              traffic_limit: tariff.toString(),
            },
          );
          console.log(
            '[PRODUCT.SERVICE] Create response:',
            JSON.stringify(response.data, null, 2),
          );
          console.log('[PRODUCT.SERVICE] Returning create result');
          return {
            package_key: response.data.data.package_key,
            orderId: tariffResponse.data.data.orderId.toString(),
          };
        }
      }
    } catch (error) {
      console.error('[PRODUCT.SERVICE] ERROR in placeOrder:');
      console.error('[PRODUCT.SERVICE] Error message:', error.message);
      console.error('[PRODUCT.SERVICE] Error stack:', error.stack);
      console.error('[PRODUCT.SERVICE] Full error:', error);
      console.error(
        '[PRODUCT.SERVICE] OrderInfo that caused error:',
        JSON.stringify(orderInfo, null, 2),
      );
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
      paymentId: '1',
    });
    console.log('response', response.data);
    if (response.data.status !== 'success') {
      throw new HttpException('Invalid data', 400);
    }
    await this.prisma.user.update({
      where: { id: order.userId },
      data: {
        balance: { decrement: currentPrice },
      },
    });
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
    return { status: 'success' };
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
      console.log(response.data);
      throw new HttpException(response.data.errors[0].message, 400);
    }

    return {
      status: 'success',
    };
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
    }

    if (rotation) {
      await this.proxySeller.post('/residentsubuser/list/rotation', {
        id: listId,
        package_key: packageKey,
        rotation: rotation,
      });
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
