// Run inside the backend container with its existing DATABASE_URL and PROXY_SELLER.
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const attemptId = process.argv[2];
const releaseConfirmed = process.argv.includes('--release-confirmed');
if (!attemptId || !/^[0-9a-f-]{36}$/i.test(attemptId)) {
  process.stderr.write('Usage: node scripts/reconcile-proxy-renewal.cjs <attempt-uuid> [--release-confirmed]\n');
  process.exit(2);
}

function parseDate(value) {
  if (typeof value !== 'string') return null;
  const european = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!european && !iso) return null;
  const year = Number(european?.[3] ?? iso?.[1]);
  const month = Number(european?.[2] ?? iso?.[2]);
  const day = Number(european?.[1] ?? iso?.[3]);
  const date = Date.UTC(year, month - 1, day);
  const check = new Date(date);
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day
    ? date
    : null;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return `${String(date.getUTCDate()).padStart(2, '0')}.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${date.getUTCFullYear()}`;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const attempt = await prisma.proxyRenewalAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new Error('Renewal attempt not found');
    if (attempt.status !== 'PROCESSING') {
      process.stdout.write(`Attempt ${attempt.id}: ${attempt.status}; no action.\n`);
      return;
    }
    if (!process.env.PROXY_SELLER) throw new Error('Provider configuration unavailable');
    const providerPath = `/proxy/list/${attempt.type}`;
    const providerRoot = 'https://proxy-seller.com/personal/api';
    let response;
    try {
      response = await axios.get(
        `${providerRoot}/v2/${process.env.PROXY_SELLER}${providerPath}`,
        { timeout: 15000 },
      );
    } catch (error) {
      const contentType = String(error.response?.headers?.['content-type'] ?? '').toLowerCase();
      if (error.response?.status !== 403 || !contentType.includes('text/html')) throw error;
      response = await axios.get(
        `${providerRoot}/v1/${process.env.PROXY_SELLER}${providerPath}`,
        { timeout: 15000 },
      );
    }
    if (response.data?.status !== 'success' || !Array.isArray(response.data.data?.items)) {
      throw new Error('Provider list unavailable; attempt remains reserved');
    }
    const items = new Map(response.data.data.items.map((item) => [String(item.id), item]));
    const ids = attempt.ids;
    if (!Array.isArray(ids) || ids.some((id) => !items.has(String(id)))) {
      throw new Error('Provider list is incomplete; attempt remains reserved');
    }
    const before = attempt.expiresBefore;
    const expected = attempt.expiresAfter;
    const actual = ids.map((id) => parseDate(items.get(String(id)).date_end));
    if (ids.some((id, index) => actual[index] === null || parseDate(before?.[id]) === null || parseDate(expected?.[id]) === null)) {
      throw new Error('Renewal expiry is unreadable; attempt remains reserved');
    }
    const allRenewed = ids.every((id, index) => actual[index] >= parseDate(expected[id]));
    const noneRenewed = ids.every((id, index) => actual[index] <= parseDate(before[id]));

    if (allRenewed) {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.proxyRenewalAttempt.updateMany({
          where: { id: attempt.id, status: 'PROCESSING' },
          data: { status: 'PAID', activeSourceOrderId: null },
        });
        if (claimed.count !== 1) throw new Error('Attempt changed during reconciliation');
        const source = await tx.order.findUnique({ where: { id: attempt.sourceOrderId } });
        if (!source) throw new Error('Source order missing');
        const sourceExpiry = Math.max(
          parseDate(source.end_date) ?? 0,
          parseDate(attempt.sourceEndDate) ?? 0,
          ...actual,
        );
        await tx.order.update({
          where: { id: source.id },
          data: { end_date: formatDate(sourceExpiry) },
        });
        const local = await tx.order.create({
          data: {
            type: source.type,
            userId: source.userId,
            country: source.country,
            quantity: ids.length,
            periodDays: source.periodDays,
            proxyType: source.proxyType,
            status: 'PAID',
            goal: source.goal,
            tariff: source.tariff,
            totalPrice: attempt.amount,
            orderId: attempt.providerOrderId,
            proxySellerId: null,
            end_date: formatDate(Math.max(...actual)),
          },
        });
        await tx.proxyRenewalAttempt.update({
          where: { id: attempt.id },
          data: { localOrderId: local.id },
        });
      });
      process.stdout.write(`Attempt ${attempt.id}: provider expiry verified; local renewal settled.\n`);
      return;
    }

    if (releaseConfirmed && noneRenewed && Date.now() - attempt.createdAt.getTime() >= 15 * 60 * 1000) {
      await prisma.$transaction(async (tx) => {
        const canceled = await tx.proxyRenewalAttempt.updateMany({
          where: { id: attempt.id, status: 'PROCESSING' },
          data: { status: 'CANCELED', activeSourceOrderId: null },
        });
        if (canceled.count !== 1) throw new Error('Attempt changed during reconciliation');
        await tx.user.update({
          where: { id: attempt.userId },
          data: { balance: { increment: attempt.amount } },
        });
      });
      process.stdout.write(`Attempt ${attempt.id}: confirmed failed; reserved balance released.\n`);
      return;
    }
    process.stdout.write(`Attempt ${attempt.id}: unresolved; balance remains reserved. Confirm provider outcome before release.\n`);
    process.exitCode = 3;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  process.stderr.write('Reconciliation failed; attempt remains reserved. Check provider and database connectivity.\n');
  process.exitCode = 1;
});
