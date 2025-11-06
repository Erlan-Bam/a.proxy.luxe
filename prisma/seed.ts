// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.user.update({
    where: { email: 'erlanzh.gg@gmail.com' },
    data: {
      type: 'USER',
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
