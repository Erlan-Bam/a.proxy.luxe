// prisma/simulate-finish-order.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PROXY_SELLER_API_KEY = process.env.PROXY_SELLER || 'YOUR_API_KEY';
const BASE_URL = `https://proxy-seller.com/personal/api/v1/${PROXY_SELLER_API_KEY}`;

async function main() {
  console.log('=== FINDING FAILED ORDERS (11 AM - 1 PM) ===\n');

  // Get today's date or specify a date
  const today = new Date();
  const startTime = new Date(today);
  startTime.setHours(11, 0, 0, 0); // 11:00 AM

  const endTime = new Date(today);
  endTime.setHours(13, 0, 0, 0); // 1:00 PM

  console.log(`Searching for orders created between:`);
  console.log(`  Start: ${startTime.toLocaleString()}`);
  console.log(`  End: ${endTime.toLocaleString()}\n`);

  // Find orders created between 11 AM - 1 PM where orderId is null (failed orders)
  const failedOrders = await prisma.order.findMany({
    where: {
      createdAt: {
        gte: startTime,
        lte: endTime,
      },
      orderId: null, // Orders where orderId was not updated
      type: 'isp', // Optional: filter by type
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
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (failedOrders.length === 0) {
    console.log('❌ No failed orders found in this time range');
    console.log(
      '\nTrying broader search (all orders between 11 AM - 1 PM)...\n',
    );

    const allOrders = await prisma.order.findMany({
      where: {
        createdAt: {
          gte: startTime,
          lte: endTime,
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
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (allOrders.length > 0) {
      console.log(
        `Found ${allOrders.length} total orders in this time range:\n`,
      );
      allOrders.forEach((o, idx) => {
        console.log(`${idx + 1}. Order ID: ${o.id}`);
        console.log(`   Type: ${o.type}`);
        console.log(`   Status: ${o.status}`);
        console.log(`   OrderId: ${o.orderId || 'NULL ❌'}`);
        console.log(`   ProxySellerId: ${o.proxySellerId || 'NULL'}`);
        console.log(`   Created: ${o.createdAt}`);
        console.log(`   User: ${o.user.email}\n`);
      });
    }
    return;
  }

  console.log(
    `✅ Found ${failedOrders.length} failed order(s) where orderId is NULL!\n`,
  );

  // Process first order for simulation
  const order = failedOrders[0];

  console.log('=== FAILED ORDERS LIST ===\n');
  failedOrders.forEach((o, idx) => {
    console.log(`${idx + 1}. Order UUID: ${o.id}`);
    console.log(`   User: ${o.user.email}`);
    console.log(`   Type: ${o.type}`);
    console.log(`   Status: ${o.status}`);
    console.log(`   Price: $${o.totalPrice}`);
    console.log(`   Created: ${o.createdAt}`);
    console.log(`   OrderId: NULL ❌`);
    console.log(`   ProxySellerId: ${o.proxySellerId || 'NULL'}\n`);
  });

  console.log(`\n=== SIMULATING FIRST ORDER: ${order.id} ===\n`);
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

  // Fetch real reference data from Proxy Seller API
  console.log('  Fetching real reference data from API...');
  let countryId: number | undefined;
  
  try {
    const referenceUrl = `${BASE_URL}/reference/list`;
    const response = await fetch(referenceUrl);
    const referenceData = await response.json();

    if (referenceData.status === 'success' && referenceData.data) {
      const typeData = referenceData.data[order.type];
      
      if (typeData && typeData.country) {
        console.log(`  ✅ Fetched ${typeData.country.length} countries for ${order.type} type`);
        
        // Find matching country
        const matchedCountry = typeData.country.find(
          (country: any) => 
            order.country && 
            (country.name.toLowerCase().includes(order.country.toLowerCase()) ||
             country.alpha3.toLowerCase() === order.country.toLowerCase())
        );
        
        if (matchedCountry) {
          countryId = matchedCountry.id;
          console.log(`  ✅ Matched Country: ${matchedCountry.name} (ID: ${countryId})`);
        } else {
          console.log(`  ❌ Country '${order.country}' not found in reference data`);
          console.log(`  Available countries:`, typeData.country.map((c: any) => c.name).join(', '));
        }
      } else {
        console.log(`  ❌ No country data found for type '${order.type}'`);
      }
    } else {
      console.log(`  ❌ Failed to fetch reference data: ${referenceData.message || 'Unknown error'}`);
    }
  } catch (error) {
    console.error(`  ❌ Error fetching reference data:`, error.message);
  }

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
