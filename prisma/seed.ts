// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.order.updateMany({
    where: {
      id: '8438a010-ce18-4ce1-bba6-f05764070fa5',
    },
    data: {
      proxySellerId: `3594637`,
    },
  });
}

main()
  .catch((e) => {
    console.error('Ошибка при сидировании базы:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
