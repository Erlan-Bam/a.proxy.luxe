// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.order.updateMany({
    where: {
      id: 'd2bb3a97-f1f1-4bbd-a8fb-595459a7156d',
    },
    data: {
      proxySellerId: `3594638`,
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
