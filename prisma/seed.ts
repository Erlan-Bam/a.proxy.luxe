// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== SEARCHING FOR STUCK ORDERS ===\n');

  // Get all PROCESSING orders
  const processingOrders = await prisma.order.findMany({
    where: { status: 'PROCESSING' },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          balance: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  console.log(
    `Found ${processingOrders.length} orders stuck in PROCESSING status\n`,
  );

  if (processingOrders.length > 0) {
    console.log('=== DETAILED ORDER INFORMATION ===\n');

    processingOrders.forEach((order, index) => {
      console.log(`--- Order ${index + 1} ---`);
      console.log(`Order ID: ${order.id}`);
      console.log(`User ID: ${order.userId}`);
      console.log(`User Email: ${order.user.email}`);
      console.log(`User Balance: $${order.user.balance}`);
      console.log(`Order Type: ${order.type}`);
      console.log(`Country: ${order.country || 'N/A'}`);
      console.log(`Quantity: ${order.quantity || 'N/A'}`);
      console.log(`Tariff: ${order.tariff || 'N/A'}`);
      console.log(`Period Days: ${order.periodDays || 'N/A'}`);
      console.log(`Proxy Type: ${order.proxyType}`);
      console.log(`Total Price: $${order.totalPrice}`);
      console.log(`Status: ${order.status}`);
      console.log(`Goal: ${order.goal}`);
      console.log(`Proxy Seller ID: ${order.proxySellerId || 'N/A'}`);
      console.log(`Proxy Seller Order ID: ${order.orderId || 'N/A'}`);
      console.log(`Promocode: ${order.promocode || 'N/A'}`);
      console.log(`End Date: ${order.end_date}`);
      console.log(`Created At: ${order.createdAt}`);
      console.log(`Updated At: ${order.updatedAt}`);
      console.log('');
    });

    console.log('=== SUMMARY ===');
    console.log(`Total stuck orders: ${processingOrders.length}`);
    console.log(
      `Total stuck amount: $${processingOrders.reduce((sum, o) => sum + Number(o.totalPrice), 0).toFixed(2)}`,
    );

    const uniqueUsers = new Set(processingOrders.map((o) => o.userId));
    console.log(`Affected users: ${uniqueUsers.size}`);

    const typeBreakdown = processingOrders.reduce(
      (acc, o) => {
        acc[o.type] = (acc[o.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    console.log('\nOrders by type:');
    Object.entries(typeBreakdown).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

    // Get unique order IDs from error logs
    const failedOrderIds = [
      '34fa01e4-8810-462e-af14-085c5118d1ea',
      '8e58a204-fd32-4fd9-aa88-d8fbafe9483b',
      '4e4f6a6c-d852-4fe5-949e-1aed60cb7f0c',
      '50232c4b-b550-4fa8-982d-3e6ed6c91995',
      '6c4de931-6268-43cb-8d77-7e2e853862f1',
      '538bf724-cdea-42c2-8145-23d7aa8aa4d1',
      '526f8b5a-b32e-4bc3-b8a4-7744291819d8',
    ];

    const matchedOrders = processingOrders.filter((o) =>
      failedOrderIds.includes(o.id),
    );
    console.log(`\n=== MATCHED ORDERS FROM ERROR LOGS ===`);
    console.log(
      `Matched ${matchedOrders.length} out of ${failedOrderIds.length} failed order IDs`,
    );

    if (matchedOrders.length < failedOrderIds.length) {
      const missingIds = failedOrderIds.filter(
        (id) => !processingOrders.some((o) => o.id === id),
      );
      console.log(`\nMissing orders (may have been processed or deleted):`);
      missingIds.forEach((id) => console.log(`  - ${id}`));
    }
  }

  // Check for any PENDING orders that might need attention
  const pendingCount = await prisma.order.count({
    where: { status: 'PENDING' },
  });
  console.log(`\n=== ADDITIONAL INFO ===`);
  console.log(`Pending orders: ${pendingCount}`);

  const paidCount = await prisma.order.count({
    where: { status: 'PAID' },
  });
  console.log(`Paid orders: ${paidCount}`);
}

main()
  .catch((e) => {
    console.error('Ошибка при выполнении скрипта:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
