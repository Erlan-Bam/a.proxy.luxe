import { HttpException } from '@nestjs/common';
import { Axios } from 'axios';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../v1/shared/prisma.service';
import { OrderInfo } from './dto/order.dto';

export type ResidentCheckpoint = {
  stage:
    | 'purchase_requested'
    | 'purchased'
    | 'create_requested'
    | 'update_requested'
    | 'updated'
    | 'applied'
    | 'canceled';
  packageKey?: string;
  baseline: string;
  target: string;
  desiredExpiry: string;
  expiry?: string;
  sourceOrderId?: string;
  charge?: string;
  discountCode?: string;
  couponReserved?: boolean;
  fundsReserved?: boolean;
  fundsCaptured?: boolean;
  lastError?: string;
};

const day = 86400000;

export function parseResidentDate(value: unknown): Date {
  const raw =
    typeof value === 'object' && value !== null
      ? (value as { date?: unknown }).date
      : value;
  if (typeof raw !== 'string')
    throw new HttpException('Invalid main package expiry', 502);
  const dmy = /^(\d{2})\.(\d{2})\.(\d{4})(?: |$)/.exec(raw);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]|$)/.exec(raw);
  const parts = dmy
    ? [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])]
    : iso
      ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
      : null;
  if (!parts) throw new HttpException('Invalid main package expiry', 502);
  const result = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (
    result.getUTCFullYear() !== parts[0] ||
    result.getUTCMonth() !== parts[1] - 1 ||
    result.getUTCDate() !== parts[2]
  ) {
    throw new HttpException('Invalid main package expiry', 502);
  }
  return result;
}

function formatDate(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, '0')}.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${date.getUTCFullYear()}`;
}

export function desiredResidentExpiry(now = new Date()): string {
  const year = now.getUTCFullYear(),
    month = now.getUTCMonth();
  const lastNextMonthDay = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  const next = new Date(
    Date.UTC(year, month + 1, Math.min(now.getUTCDate(), lastNextMonthDay)) -
      day,
  );
  return formatDate(next);
}

export function safeResidentExpiry(
  desired: string,
  parent: unknown,
  now = new Date(),
  upperBound?: string,
): string {
  const limits = [
    parseResidentDate(desired).getTime(),
    parseResidentDate(parent).getTime(),
  ];
  if (upperBound) limits.push(parseResidentDate(upperBound).getTime() - day);
  const expiry = new Date(Math.min(...limits));
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  if (expiry.getTime() <= today)
    throw new HttpException(
      'Main package must be renewed before allocating traffic',
      409,
    );
  return formatDate(expiry);
}

function providerError(response: any): string {
  return response?.errors?.[0]?.message || 'Invalid resident provider response';
}

function preserveExpiry(expiry: string, pkg: { expired_at: unknown }): void {
  if (parseResidentDate(expiry) < parseResidentDate(pkg.expired_at)) {
    throw new HttpException(
      'Renew the main package first; refusing to shorten customer expiry',
      409,
    );
  }
}

// The caller holds a per-user database lock through provisioning and local billing.
export class ResidentProvisioner {
  constructor(
    private readonly prisma: PrismaService,
    private readonly api: Axios,
  ) {}

  async provision(info: OrderInfo) {
    const order = await this.prisma.order.findUnique({
      where: { id: info.orderId },
    });
    if (!order || order.userId !== info.userId || order.type !== 'resident') {
      throw new HttpException('Resident order not found', 404);
    }
    let checkpoint =
      order.residentFulfillment as unknown as ResidentCheckpoint | null;
    let persisted = structuredClone(order.residentFulfillment);
    let ownsCheckpoint = !!checkpoint;
    let providerOrderId = order.orderId,
      orderNumber = order.orderNumber;
    const save = async (
      extra: { orderId?: string | null; orderNumber?: string | null } = {},
    ) => {
      const saved = await this.prisma.order.updateMany({
        where: {
          id: order.id,
          status: 'PROCESSING',
          residentFulfillment: { equals: persisted as Prisma.InputJsonValue },
        },
        data: {
          residentFulfillment: checkpoint as unknown as Prisma.InputJsonValue,
          ...extra,
        },
      });
      if (saved.count !== 1) {
        ownsCheckpoint = false;
        throw new HttpException(
          'Resident operation advanced in another worker; retry the same order',
          409,
        );
      }
      persisted = structuredClone(checkpoint) as unknown as Prisma.JsonValue;
    };
    const readMain = async () => {
      const response = (
        await this.api.get('/resident/package', { timeout: 20000 })
      ).data;
      if (response?.status !== 'success' || !response.data?.is_active) {
        throw new HttpException(providerError(response), 502);
      }
      return response.data;
    };
    const readSubs = async () => {
      const response = (
        await this.api.get('/residentsubuser/packages', { timeout: 20000 })
      ).data;
      if (response?.status !== 'success' || !Array.isArray(response.data)) {
        throw new HttpException(providerError(response), 502);
      }
      return response.data;
    };

    try {
      if (!checkpoint) {
        if (providerOrderId)
          throw new HttpException(
            'Resident purchase requires reconciliation; no new purchase made',
            409,
          );
        const main = await readMain();
        let desiredExpiry = desiredResidentExpiry();
        safeResidentExpiry(desiredExpiry, main.expired_at);
        const owned = await this.prisma.order.findFirst({
          where: {
            userId: info.userId,
            type: 'resident',
            status: 'PAID',
            proxySellerId: { not: null },
            ...(info.sourceOrderId && { id: info.sourceOrderId }),
          },
          orderBy: { createdAt: 'desc' },
        });
        const pkg = owned
          ? (await readSubs()).find(
              (p) => p.package_key === owned.proxySellerId,
            )
          : null;
        if (info.sourceOrderId && !owned)
          throw new HttpException('Resident package ownership changed', 409);
        if (owned && !pkg)
          throw new HttpException(
            'Resident package not found; contact support',
            409,
          );
        if (pkg?.package_key === main.package_key)
          throw new HttpException(
            'Cannot allocate a main package to a customer',
            409,
          );
        if (pkg) {
          desiredExpiry = formatDate(
            new Date(
              Math.max(
                parseResidentDate(desiredExpiry).getTime(),
                parseResidentDate(pkg.expired_at).getTime(),
              ),
            ),
          );
          preserveExpiry(
            safeResidentExpiry(desiredExpiry, main.expired_at),
            pkg,
          );
        }
        const baseline = pkg ? String(pkg.traffic_limit) : '0';
        const match = /^(\d+(?:\.\d+)?)\s+Gb$/i.exec(info.tariff || '');
        const added = match ? Number(match[1]) * 1073741824 : NaN;
        if (
          !/^\d+$/.test(baseline) ||
          !Number.isSafeInteger(added) ||
          added <= 0
        ) {
          throw new HttpException('Invalid resident traffic limit', 400);
        }
        checkpoint = {
          stage: 'purchase_requested',
          baseline,
          target: String(BigInt(baseline) + BigInt(added)),
          desiredExpiry,
          charge: info.charge ?? String(order.totalPrice),
          ...(info.discountCode && { discountCode: info.discountCode }),
          ...(pkg ? { packageKey: String(pkg.package_key) } : {}),
          ...(info.sourceOrderId && { sourceOrderId: info.sourceOrderId }),
        };
        // A timeout/crash after this marker must never cause another paid request.
        await this.prisma.$transaction(async (tx) => {
          // This fence also survives loss of the separate advisory-lock session.
          await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${info.userId} FOR UPDATE`;
          const conflicting = await tx.order.findFirst({
            where: {
              userId: info.userId,
              type: 'resident',
              id: { not: order.id },
              OR: [
                {
                  status: { in: ['PENDING', 'PROCESSING'] },
                  residentFulfillment: { not: Prisma.DbNull },
                },
                ...(order.createdAt
                  ? [
                      {
                        status: 'PAID' as const,
                        updatedAt: { gt: order.createdAt },
                      },
                    ]
                  : []),
              ],
            },
          });
          if (conflicting)
            throw new HttpException(
              'Resident package changed or another purchase is pending; refresh this checkout',
              409,
            );
          const charge = new Decimal(checkpoint!.charge!);
          if (!charge.isFinite() || charge.lt(0))
            throw new HttpException('Invalid resident charge', 400);
          const reservedFunds = await tx.user.updateMany({
            where: { id: info.userId, balance: { gte: charge } },
            data: { balance: { decrement: charge } },
          });
          if (reservedFunds.count !== 1)
            throw new HttpException('Insufficient balance', 400);
          checkpoint!.fundsReserved = true;
          if (checkpoint!.discountCode) {
            const reserved = await tx.coupon.updateMany({
              where: { code: checkpoint!.discountCode, limit: { gt: 0 } },
              data: { limit: { decrement: 1 } },
            });
            if (reserved.count !== 1)
              throw new HttpException('Promocode is no longer available', 409);
            checkpoint!.couponReserved = true;
          }
          const claimed = await tx.order.updateMany({
            where: {
              id: order.id,
              status: 'PROCESSING',
              residentFulfillment: { equals: Prisma.DbNull },
            },
            data: {
              residentFulfillment:
                checkpoint as unknown as Prisma.InputJsonValue,
            },
          });
          if (claimed.count !== 1)
            throw new HttpException(
              'Resident purchase already claimed; retry the same order',
              409,
            );
        });
        ownsCheckpoint = true;
        persisted = structuredClone(checkpoint) as unknown as Prisma.JsonValue;
        const response = (
          await this.api.post(
            '/order/make',
            {
              tarifId: info.tariffId,
              paymentId: 1,
            },
            { timeout: 30000 },
          )
        ).data;
        if (response?.status !== 'success' || !response.data?.orderId) {
          if (response?.status === 'error') {
            const canceled = {
              ...checkpoint!,
              stage: 'canceled' as const,
              fundsReserved: false,
              couponReserved: false,
              lastError: providerError(response),
            };
            await this.prisma.$transaction(async (tx) => {
              const changed = await tx.order.updateMany({
                where: {
                  id: order.id,
                  status: 'PROCESSING',
                  residentFulfillment: {
                    equals: persisted as Prisma.InputJsonValue,
                  },
                },
                data: { status: 'CANCELED', residentFulfillment: canceled },
              });
              if (changed.count !== 1)
                throw new HttpException(
                  'Resident cancellation requires reconciliation',
                  409,
                );
              await tx.user.update({
                where: { id: info.userId },
                data: {
                  balance: { increment: new Decimal(checkpoint!.charge!) },
                },
              });
              if (checkpoint!.couponReserved && checkpoint!.discountCode)
                await tx.coupon.update({
                  where: { code: checkpoint!.discountCode },
                  data: { limit: { increment: 1 } },
                });
            });
            ownsCheckpoint = false;
          }
          throw new HttpException(providerError(response), 502);
        }
        providerOrderId = String(response.data.orderId);
        orderNumber = response.data.listBaseOrderNumbers?.[0] || null;
        checkpoint.stage = 'purchased';
        await save({ orderId: providerOrderId, orderNumber });
      }
      if (
        checkpoint.stage === 'purchase_requested' ||
        checkpoint.stage === 'create_requested' ||
        checkpoint.stage === 'update_requested'
      ) {
        ownsCheckpoint = false;
        throw new HttpException(
          'Provider result is uncertain; contact support. No repeat purchase was made',
          409,
        );
      }
      if (!providerOrderId)
        throw new HttpException(
          'Purchased tariff ID missing; contact support',
          409,
        );

      if (checkpoint.stage === 'purchased') {
        const main = await readMain();
        let expiry = safeResidentExpiry(
          checkpoint.desiredExpiry,
          main.expired_at,
        );
        if (checkpoint.packageKey) {
          const pkg = (await readSubs()).find(
            (p) => p.package_key === checkpoint!.packageKey,
          );
          if (
            !pkg ||
            !/^\d+$/.test(String(pkg.traffic_limit)) ||
            BigInt(pkg.traffic_limit) > BigInt(checkpoint.target) ||
            BigInt(pkg.traffic_limit) < BigInt(checkpoint.baseline)
          ) {
            throw new HttpException(
              'Resident allocation changed; contact support before retrying',
              409,
            );
          }
          preserveExpiry(expiry, pkg);
          // Only a confirmed rejection may be retried; a delayed request could overwrite a later purchase.
          for (let attempt = 0; attempt < 2; attempt++) {
            checkpoint.expiry = expiry;
            checkpoint.stage = 'update_requested';
            await save();
            const response = (
              await this.api.post(
                '/residentsubuser/update',
                {
                  is_link_date: false,
                  traffic_limit: checkpoint.target,
                  is_active: true,
                  expired_at: expiry,
                  package_key: checkpoint.packageKey,
                },
                { timeout: 30000 },
              )
            ).data;
            if (
              response?.status === 'success' &&
              response.data?.package_key === checkpoint.packageKey
            ) {
              checkpoint.stage = 'updated';
              await save();
              break;
            }
            if (response?.status === 'error') {
              checkpoint.stage = 'purchased';
              await save();
            }
            const message = providerError(response);
            const bound =
              /\[ expired_at \].*less than (\d{2}\.\d{2}\.\d{4})/.exec(message);
            if (attempt || !bound || response?.status !== 'error')
              throw new HttpException(message, 502);
            const refreshed = await readMain();
            expiry = safeResidentExpiry(
              checkpoint.desiredExpiry,
              refreshed.expired_at,
              new Date(),
              bound[1],
            );
            preserveExpiry(expiry, pkg);
          }
        } else {
          checkpoint.stage = 'create_requested';
          checkpoint.expiry = expiry;
          await save();
          const response = (
            await this.api.post(
              '/residentsubuser/create',
              {
                is_link_date: false,
                rotation: 1,
                is_active: true,
                traffic_limit: checkpoint.target,
                expired_at: expiry,
              },
              { timeout: 30000 },
            )
          ).data;
          if (response?.status !== 'success' || !response.data?.package_key) {
            // Explicit rejection is retryable; a lost response is not.
            if (response?.status === 'error') {
              checkpoint.stage = 'purchased';
              await save();
            }
            throw new HttpException(providerError(response), 502);
          }
          if (response.data.package_key === main.package_key)
            throw new HttpException(
              'Provider returned main package; reconciliation required',
              502,
            );
          checkpoint.packageKey = response.data.package_key;
          checkpoint.stage = 'updated';
          await save();
        }
      }
      if (checkpoint.stage === 'updated') {
        const confirmed = (await readSubs()).find(
          (p) => p.package_key === checkpoint!.packageKey,
        );
        if (
          !confirmed ||
          !confirmed.is_active ||
          String(confirmed.traffic_limit) !== checkpoint.target ||
          parseResidentDate(confirmed.expired_at).getTime() !==
            parseResidentDate(checkpoint.expiry).getTime()
        ) {
          throw new HttpException(
            'Resident allocation not confirmed; retry the same order',
            502,
          );
        }
        checkpoint.stage = 'applied';
        delete checkpoint.lastError;
        await save();
      }
      if (checkpoint.stage !== 'applied')
        throw new HttpException(
          'Resident fulfillment requires reconciliation',
          409,
        );
      return {
        orderId: providerOrderId,
        orderNumber,
        package_key: checkpoint.packageKey!,
        end_date: checkpoint.expiry!,
      };
    } catch (error) {
      if (checkpoint && ownsCheckpoint) {
        checkpoint.lastError =
          error instanceof HttpException
            ? error.message
            : 'Provider transport or persistence failure; retry only through this order';
        // A stale worker must not overwrite a newer key, applied state, or reservation.
        await this.prisma.order
          .updateMany({
            where: {
              id: order.id,
              status: 'PROCESSING',
              residentFulfillment: {
                equals: persisted as Prisma.InputJsonValue,
              },
            },
            data: {
              orderId: providerOrderId,
              orderNumber,
              residentFulfillment:
                checkpoint as unknown as Prisma.InputJsonValue,
            },
          })
          .catch(() => {});
      }
      throw error;
    }
  }
}
