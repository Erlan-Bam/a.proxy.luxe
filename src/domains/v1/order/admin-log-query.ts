import { BadRequestException } from '@nestjs/common';
import { PaymentStatus, Prisma, Proxy } from '@prisma/client';

export const ORDER_LOG_SORT_FIELDS = [
  'email', 'id', 'type', 'createdAt', 'updatedAt', 'amount',
  'orderId', 'orderNumber', 'goal', 'status',
] as const;
export const PAYMENT_LOG_SORT_FIELDS = [
  'email', 'id', 'method', 'createdAt', 'updatedAt', 'amount',
] as const;

type RangeFilters = {
  CreatedFrom?: string;
  CreatedTo?: string;
  UpdatedFrom?: string;
  UpdatedTo?: string;
  AmountMin?: string;
  AmountMax?: string;
  Email?: string;
  Id?: string;
};
export type AdminLogQuery = {
  [K in keyof RangeFilters as `orders${K}`]: RangeFilters[K];
} & {
  [K in keyof RangeFilters as `payments${K}`]: RangeFilters[K];
} & {
  ordersSortBy?: (typeof ORDER_LOG_SORT_FIELDS)[number];
  ordersSortDirection?: 'asc' | 'desc';
  paymentsSortBy?: (typeof PAYMENT_LOG_SORT_FIELDS)[number];
  paymentsSortDirection?: 'asc' | 'desc';
  ordersType?: Proxy;
  ordersProviderOrder?: string;
  ordersGoal?: string;
  paymentsMethod?: string;
};

const invalid = (key: string): never => {
  throw new BadRequestException(`Invalid admin log parameter: ${key}`);
};

function dateBound(value: string, end: boolean): Date {
  // Date-only bounds cover the whole UTC day; timestamps must include a zone.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z`);
  }
  return new Date(value);
}

export function parseAdminLogQuery(raw: Record<string, unknown>): AdminLogQuery {
  const query: Record<string, string> = {};
  const scalar = (key: string) => {
    const value = raw[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || value.length > 500) return invalid(key);
    return value.trim() || undefined;
  };
  const choice = (key: string, values: readonly string[], fallback?: string) => {
    const value = scalar(key) ?? fallback;
    if (value !== undefined) {
      if (!values.includes(value)) invalid(key);
      query[key] = value;
    }
  };
  choice('ordersSortBy', ORDER_LOG_SORT_FIELDS, 'createdAt');
  choice('paymentsSortBy', PAYMENT_LOG_SORT_FIELDS, 'createdAt');
  choice('ordersSortDirection', ['asc', 'desc'], 'desc');
  choice('paymentsSortDirection', ['asc', 'desc'], 'desc');
  choice('ordersType', Object.values(Proxy));
  for (const key of [
    'ordersEmail', 'ordersId', 'ordersProviderOrder', 'ordersGoal',
    'paymentsEmail', 'paymentsId', 'paymentsMethod',
  ]) {
    const value = scalar(key);
    if (value) query[key] = value;
  }
  for (const prefix of ['orders', 'payments']) {
    for (const field of ['Created', 'Updated']) {
      for (const bound of ['From', 'To']) {
        const key = `${prefix}${field}${bound}`;
        const value = scalar(key);
        if (!value) continue;
        if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) invalid(key);
        const day = value.slice(0, 10);
        const dayDate = new Date(`${day}T00:00:00.000Z`);
        if (!Number.isFinite(dayDate.getTime()) || dayDate.toISOString().slice(0, 10) !== day ||
            !Number.isFinite(dateBound(value, bound === 'To').getTime()) ||
            (value.length > 10 && Number(value.slice(11, 13)) > 23)) invalid(key);
        query[key] = value;
      }
      const from = query[`${prefix}${field}From`];
      const to = query[`${prefix}${field}To`];
      if (from && to && dateBound(from, false) > dateBound(to, true)) invalid(`${prefix}${field}From/To`);
    }
    for (const bound of ['Min', 'Max']) {
      const key = `${prefix}Amount${bound}`;
      const value = scalar(key);
      if (!value) continue;
      if (!/^\d{1,35}(?:\.\d{1,30})?$/.test(value)) invalid(key);
      query[key] = value;
    }
    const min = query[`${prefix}AmountMin`];
    const max = query[`${prefix}AmountMax`];
    if (min && max && new Prisma.Decimal(min).gt(max)) invalid(`${prefix}AmountMin/Max`);
  }
  return query as AdminLogQuery;
}

function literalContains(value: string) {
  return { contains: value.trim().replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' as const };
}

function dateRange(from?: string, to?: string) {
  return from || to ? {
    ...(from ? { gte: dateBound(from, false) } : {}),
    ...(to ? { lte: dateBound(to, true) } : {}),
  } : undefined;
}

function amountRange(min?: string, max?: string) {
  return min || max ? { ...(min ? { gte: min } : {}), ...(max ? { lte: max } : {}) } : undefined;
}

export function buildAdminLogQueries(params: AdminLogQuery & { search?: string; status?: PaymentStatus }) {
  const q = parseAdminLogQuery(params);
  const search = params.search?.trim();
  const contains = search ? literalContains(search) : undefined;
  const orderWhere: Prisma.OrderWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    ...(contains ? { OR: [
      { id: contains }, { orderId: contains }, { orderNumber: contains },
      { userId: contains }, { user: { email: contains } },
    ] } : {}),
    ...(q.ordersEmail ? { user: { email: literalContains(q.ordersEmail) } } : {}),
    ...(q.ordersId ? { id: literalContains(q.ordersId) } : {}),
    ...(q.ordersType ? { type: q.ordersType } : {}),
    ...(q.ordersGoal ? { goal: literalContains(q.ordersGoal) } : {}),
    ...(q.ordersProviderOrder ? { AND: [{ OR: [
      { orderId: literalContains(q.ordersProviderOrder) },
      { orderNumber: literalContains(q.ordersProviderOrder) },
    ] }] } : {}),
  };
  const paymentWhere: Prisma.PaymentWhereInput = {
    ...(contains ? { OR: [
      { id: contains }, { userId: contains }, { method: contains }, { user: { email: contains } },
    ] } : {}),
    ...(q.paymentsEmail ? { user: { email: literalContains(q.paymentsEmail) } } : {}),
    ...(q.paymentsId ? { id: literalContains(q.paymentsId) } : {}),
    ...(q.paymentsMethod ? { method: literalContains(q.paymentsMethod) } : {}),
  };
  const orderCreated = dateRange(q.ordersCreatedFrom, q.ordersCreatedTo);
  const orderUpdated = dateRange(q.ordersUpdatedFrom, q.ordersUpdatedTo);
  const paymentCreated = dateRange(q.paymentsCreatedFrom, q.paymentsCreatedTo);
  const paymentUpdated = dateRange(q.paymentsUpdatedFrom, q.paymentsUpdatedTo);
  const orderAmount = amountRange(q.ordersAmountMin, q.ordersAmountMax);
  const paymentAmount = amountRange(q.paymentsAmountMin, q.paymentsAmountMax);
  if (orderCreated) orderWhere.createdAt = orderCreated;
  if (orderUpdated) orderWhere.updatedAt = orderUpdated;
  if (orderAmount) orderWhere.totalPrice = orderAmount;
  if (paymentCreated) paymentWhere.createdAt = paymentCreated;
  if (paymentUpdated) paymentWhere.updatedAt = paymentUpdated;
  if (paymentAmount) paymentWhere.price = paymentAmount;

  const orderDirection = q.ordersSortDirection!;
  const paymentDirection = q.paymentsSortDirection!;
  const orderField = q.ordersSortBy!;
  const paymentField = q.paymentsSortBy!;
  const orderBy: Prisma.OrderOrderByWithRelationInput[] = [
    orderField === 'email' ? { user: { email: orderDirection } } :
      { [orderField === 'amount' ? 'totalPrice' : orderField]: orderDirection },
    ...(orderField === 'id' ? [] : [{ id: orderDirection }]),
  ];
  const paymentOrderBy: Prisma.PaymentOrderByWithRelationInput[] = [
    paymentField === 'email' ? { user: { email: paymentDirection } } :
      { [paymentField === 'amount' ? 'price' : paymentField]: paymentDirection },
    ...(paymentField === 'id' ? [] : [{ id: paymentDirection }]),
  ];
  return { orderWhere, paymentWhere, orderBy, paymentOrderBy };
}
