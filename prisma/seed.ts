// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.order.findMany({ where: { status: 'PROCESSING' } });
  s;
}

main()
  .catch((e) => {
    console.error('Ошибка при сидировании базы:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
