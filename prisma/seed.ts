// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== CHECKING FAILED ORDERS FROM ERROR LOGS ===\n');

  // Order IDs from the error logs
  const failedOrderIds = ['dfc64815-b85e-43ed-814c-ae150fc51069'];

  console.log(
    `Looking for ${failedOrderIds.length} orders from error logs...\n`,
  );

  // Get orders by specific IDs (any status)
  const failedOrders = await prisma.order.findMany({
    where: {
      id: {
        in: failedOrderIds,
      },
    },
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
    `Found ${failedOrders.length} out of ${failedOrderIds.length} orders in database\n`,
  );

  if (failedOrders.length > 0) {
    console.log('=== DETAILED ORDER INFORMATION ===\n');

    failedOrders.forEach((order, index) => {
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
      console.log(`Status: ${order.status} ⚠️`);
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
    console.log(`Total failed orders found: ${failedOrders.length}`);
    console.log(
      `Total failed amount: $${failedOrders.reduce((sum, o) => sum + Number(o.totalPrice), 0).toFixed(2)}`,
    );

    const uniqueUsers = new Set(failedOrders.map((o) => o.userId));
    console.log(`Affected users: ${uniqueUsers.size}`);

    const statusBreakdown = failedOrders.reduce(
      (acc, o) => {
        acc[o.status] = (acc[o.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    console.log('\nOrders by status:');
    Object.entries(statusBreakdown).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    const typeBreakdown = failedOrders.reduce(
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
  }

  const missingIds = failedOrderIds.filter(
    (id) => !failedOrders.some((o) => o.id === id),
  );

  if (missingIds.length > 0) {
    console.log(`\n=== MISSING ORDERS ===`);
    console.log(
      `${missingIds.length} orders not found (may have been deleted):`,
    );
    missingIds.forEach((id) => console.log(`  - ${id}`));
  }

  // Check all order statuses
  console.log(`\n=== ALL ORDERS SUMMARY ===`);

  const processingCount = await prisma.order.count({
    where: { status: 'PROCESSING' },
  });
  console.log(`Processing orders: ${processingCount}`);

  const pendingCount = await prisma.order.count({
    where: { status: 'PENDING' },
  });
  console.log(`Pending orders: ${pendingCount}`);

  const paidCount = await prisma.order.count({
    where: { status: 'PAID' },
  });
  console.log(`Paid orders: ${paidCount}`);

  // Check the user's existing orders with proxySellerId
  console.log(`\n=== USER PROXY SELLER ANALYSIS ===`);

  const affectedUserIds = [...new Set(failedOrders.map((o) => o.userId))];

  for (const userId of affectedUserIds) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, balance: true },
    });

    console.log(`\nUser: ${user?.email} (${userId})`);
    console.log(`Balance: $${user?.balance}`);

    const userOrdersWithProxy = await prisma.order.findMany({
      where: {
        userId,
        proxySellerId: { not: null },
      },
      select: {
        id: true,
        proxySellerId: true,
        type: true,
        status: true,
        tariff: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    console.log(`  Orders with proxySellerId: ${userOrdersWithProxy.length}`);

    if (userOrdersWithProxy.length > 0) {
      console.log(`  Details:`);
      userOrdersWithProxy.forEach((order, idx) => {
        console.log(`    ${idx + 1}. Order ID: ${order.id}`);
        console.log(`       Proxy Seller ID: ${order.proxySellerId}`);
        console.log(`       Type: ${order.type}`);
        console.log(`       Status: ${order.status}`);
        console.log(`       Tariff: ${order.tariff || 'N/A'}`);
        console.log(`       Created: ${order.createdAt}`);
      });

      // Simulate what getActiveProxyList does
      console.log(`\n  ProxySellerMap simulation:`);
      const proxySellerMap = new Map(
        userOrdersWithProxy.map((order) => [order.proxySellerId, order.id]),
      );
      console.log(`    Map size: ${proxySellerMap.size}`);
      console.log(`    Map entries:`, Array.from(proxySellerMap.entries()));
    } else {
      console.log(
        `  ⚠️  NO orders with proxySellerId found - this is why resident is undefined!`,
      );
    }

    // Check all orders for this user
    const allUserOrders = await prisma.order.count({
      where: { userId },
    });
    console.log(`  Total orders (all statuses): ${allUserOrders}`);
  }
}

main()
  .catch((e) => {
    console.error('Ошибка при выполнении скрипта:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
