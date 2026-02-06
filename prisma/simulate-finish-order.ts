// prisma/simulate-finish-order.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PROXY_SELLER_API_KEY = process.env.PROXY_SELLER || 'YOUR_API_KEY';
const BASE_URL = `https://proxy-seller.com/personal/api/v1/${PROXY_SELLER_API_KEY}`;

async function main() {
  console.log('=== SIMULATING FINISH ORDER FOR ISP TYPE ===\n');

  // Find order by proxySellerId (which is 4337705)
  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { proxySellerId: '4337705' },
        { orderId: '4337705' },
        { id: '4337705' },
      ],
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
  });

  if (!order) {
    console.log('❌ Order not found with ID/proxySellerId: 4337705');
    console.log('\nSearching for orders with similar IDs...');

    const similarOrders = await prisma.order.findMany({
      where: {
        OR: [
          { proxySellerId: { contains: '4337' } },
          { orderId: { contains: '4337' } },
        ],
      },
      take: 5,
    });

    if (similarOrders.length > 0) {
      console.log(`\nFound ${similarOrders.length} similar orders:`);
      similarOrders.forEach((o) => {
        console.log(`  - Order ID: ${o.id}`);
        console.log(`    Proxy Seller ID: ${o.proxySellerId}`);
        console.log(`    Order ID: ${o.orderId}`);
        console.log(`    Type: ${o.type}`);
        console.log(`    Status: ${o.status}\n`);
      });
    }
    return;
  }

  console.log('✅ Found order!\n');
  console.log('=== ORDER DETAILS ===');
  console.log(`Order UUID: ${order.id}`);
  console.log(`User ID: ${order.userId}`);
  console.log(`User Email: ${order.user.email}`);
  console.log(`User Balance: $${order.user.balance}`);
  console.log(`Order Type: ${order.type}`);
  console.log(`Country: ${order.country || 'N/A'}`);
  console.log(`Quantity: ${order.quantity || 'N/A'}`);
  console.log(`Period Days: ${order.periodDays || 'N/A'}`);
  console.log(`Proxy Type: ${order.proxyType}`);
  console.log(`Goal: ${order.goal}`);
  console.log(`Total Price: $${order.totalPrice}`);
  console.log(`Status: ${order.status}`);
  console.log(`Proxy Seller ID: ${order.proxySellerId || 'N/A'}`);
  console.log(`Proxy Seller Order ID: ${order.orderId || 'N/A'}`);
  console.log(`\n`);

  if (order.type !== 'isp') {
    console.log(`⚠️  WARNING: Order type is '${order.type}', not 'isp'`);
    console.log(`Continuing with simulation anyway...\n`);
  }

  // Simulate the finishOrder logic
  console.log('=== SIMULATING FINISH ORDER LOGIC ===\n');

  // Step 1: Check balance
  console.log('Step 1: Check user balance');
  const totalPrice = Number(order.totalPrice);
  const userBalance = Number(order.user.balance);
  console.log(`  Total Price: $${totalPrice}`);
  console.log(`  User Balance: $${userBalance}`);
  if (userBalance < totalPrice) {
    console.log('  ❌ INSUFFICIENT BALANCE\n');
  } else {
    console.log('  ✅ Sufficient balance\n');
  }

  // Step 2: Get reference data
  console.log('Step 2: Get reference data for type:', order.type);

  // Mock reference data for ISP
  const ispCountries = [
    { id: 3758, name: 'USA', alpha3: 'USA' },
    { id: 4479, name: 'Poland', alpha3: 'POL' },
    { id: 4480, name: 'Netherlands', alpha3: 'NLD' },
    { id: 9767, name: 'Germany', alpha3: 'DEU' },
    { id: 7738, name: 'England', alpha3: 'GBR' },
  ];

  const countryId = ispCountries.find(
    (country) => order.country && country.name.endsWith(order.country),
  )?.id;

  console.log(`  Country: ${order.country}`);
  console.log(`  Mapped Country ID: ${countryId || 'NOT FOUND'}\n`);

  // Step 3: Build orderInfo
  console.log('Step 3: Build orderInfo object');
  const orderInfo = {
    type: order.type,
    orderId: order.id,
    paymentId: 1,
    tariff: order.tariff || undefined,
    countryId: countryId,
    customTargetName: order.goal,
    periodId: order.periodDays || undefined,
    quantity: order.quantity || undefined,
    protocol: order.proxyType || undefined,
    userId: order.userId,
  };

  console.log('  OrderInfo:');
  console.log(JSON.stringify(orderInfo, null, 4));
  console.log('');

  // Step 4: Generate curl command for placeOrder
  console.log('Step 4: Generate curl command for placeOrder\n');

  if (order.type !== 'resident') {
    // For ISP/IPv6/other types - single request to /order/make
    const curlCommand = `curl -X POST '${BASE_URL}/order/make' \\
  -H 'Content-Type: application/json' \\
  -d '${JSON.stringify(orderInfo, null, 2).replace(/'/g, "'\\''")}'`;

    console.log('=== CURL COMMAND (ISP/Non-Resident) ===\n');
    console.log(curlCommand);
    console.log('\n');

    console.log('=== REQUEST BODY ===');
    console.log(JSON.stringify(orderInfo, null, 2));
    console.log('\n');

    console.log('=== EXPECTED RESPONSE STRUCTURE ===');
    console.log(`{
  "status": "success",
  "data": {
    "orderId": <number>  // This will be saved as proxySellerId
  }
}`);
    console.log('\n');

    console.log('=== WHAT HAPPENS AFTER SUCCESS ===');
    console.log('1. Extract orderId from response.data.data.orderId');
    console.log('2. Deduct $' + totalPrice + ' from user balance');
    console.log('3. Update order:');
    console.log('   - Set proxySellerId = orderId (from response)');
    console.log('   - Set orderId = orderId (from response)');
    console.log('   - Set status = PAID');
    console.log('4. Send proxy email to user');
    console.log('\n');
  } else {
    // For resident type - multiple requests
    console.log(
      '⚠️  This is a RESIDENT order - would require multiple API calls:',
    );
    console.log('1. POST /order/make (to create tariff)');
    console.log('2. GET /residentsubuser/list (to check existing packages)');
    console.log('3. POST /residentsubuser/update OR /residentsubuser/create');
    console.log('\n');
  }

  // Show database changes that would occur
  console.log('=== DATABASE CHANGES (would be in transaction) ===\n');
  console.log('1. Order update:');
  console.log(
    `   UPDATE "Order" SET status = 'PROCESSING' WHERE id = '${order.id}'`,
  );
  console.log('\n2. User balance update:');
  console.log(
    `   UPDATE "User" SET balance = balance - ${totalPrice} WHERE id = '${order.userId}'`,
  );
  console.log('\n3. Final order update:');
  console.log(`   UPDATE "Order" SET`);
  console.log(`     status = 'PAID',`);
  console.log(`     proxySellerId = '<orderId_from_response>',`);
  console.log(`     orderId = '<orderId_from_response>'`);
  console.log(`   WHERE id = '${order.id}'`);
  console.log('\n');

  // Show summary
  console.log('=== SIMULATION SUMMARY ===');
  console.log(`Order Type: ${order.type}`);
  console.log(`API Endpoint: ${BASE_URL}/order/make`);
  console.log(`Method: POST`);
  console.log(`Order UUID: ${order.id}`);
  console.log(`User Email: ${order.user.email}`);
  console.log(`Amount: $${totalPrice}`);
  console.log(`Current Status: ${order.status}`);
  console.log(`Would become: PAID (if successful)`);
  console.log('\n');

  console.log('✅ Simulation complete!');
  console.log(
    '\n💡 To actually execute this order, call the finishOrder endpoint:',
  );
  console.log(`POST /api/v1/order/finish`);
  console.log(`Body: { "orderId": "${order.id}", "promocode": null }`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
