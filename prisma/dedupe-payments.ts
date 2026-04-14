// prisma/dedupe-payments.ts
//
// Removes duplicate Payment rows that share the same (inv, method), keeping
// the OLDEST row per group. Balances are NOT modified — every user keeps
// whatever balance they currently have. The full price of each deleted
// duplicate is effectively a write-off.
//
// Usage:
//   yarn ts-node prisma/dedupe-payments.ts           # dry run (no writes)
//   yarn ts-node prisma/dedupe-payments.ts --apply   # actually delete rows
//
// IMPORTANT: Take a DB backup before running with --apply.

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

interface DuplicateGroup {
  inv: number;
  method: string;
  copies: number;
  userId: string;
  keepId: string;
  deleteIds: string[];
  writeOff: Prisma.Decimal;
}

async function findDuplicateGroups(): Promise<DuplicateGroup[]> {
  const rows = await prisma.payment.findMany({
    where: { inv: { not: null } },
    orderBy: [{ inv: 'asc' }, { method: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, inv: true, method: true, userId: true, price: true },
  });

  const groups = new Map<string, DuplicateGroup>();
  for (const row of rows) {
    const key = `${row.inv}|${row.method}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        inv: row.inv as number,
        method: row.method,
        copies: 1,
        userId: row.userId,
        keepId: row.id,
        deleteIds: [],
        writeOff: new Prisma.Decimal(0),
      });
      continue;
    }

    if (existing.userId !== row.userId) {
      throw new Error(
        `Duplicate group inv=${row.inv} method=${row.method} spans multiple users ` +
          `(${existing.userId} vs ${row.userId}). Investigate manually.`,
      );
    }

    existing.copies += 1;
    existing.deleteIds.push(row.id);
    existing.writeOff = existing.writeOff.plus(row.price);
  }

  return [...groups.values()].filter((g) => g.copies > 1);
}

async function main() {
  console.log(`=== Payment dedupe (${APPLY ? 'APPLY' : 'DRY RUN'}) ===\n`);

  const groups = await findDuplicateGroups();

  if (groups.length === 0) {
    console.log('✅ No duplicate (inv, method) groups found. Nothing to do.');
    return;
  }

  console.log(`Found ${groups.length} duplicate groups:\n`);
  let totalWriteOff = new Prisma.Decimal(0);
  let totalToDelete = 0;
  for (const g of groups) {
    totalWriteOff = totalWriteOff.plus(g.writeOff);
    totalToDelete += g.deleteIds.length;
    console.log(
      `  inv=${g.inv} method=${g.method} copies=${g.copies} ` +
        `user=${g.userId} write_off=${g.writeOff.toString()} ` +
        `keep=${g.keepId} delete=[${g.deleteIds.join(', ')}]`,
    );
  }

  console.log(
    `\nTotals: rows_to_delete=${totalToDelete}, write_off=${totalWriteOff.toString()} ` +
      `(balances untouched).`,
  );

  if (!APPLY) {
    console.log(
      '\nℹ️  Dry run complete. Re-run with --apply to delete the duplicate rows.',
    );
    return;
  }

  console.log('\n=== Applying changes in a single transaction ===\n');

  const allDeleteIds = groups.flatMap((g) => g.deleteIds);

  const result = await prisma.$transaction(async (tx) => {
    const deleted = await tx.payment.deleteMany({
      where: { id: { in: allDeleteIds } },
    });

    const remaining = await tx.payment.groupBy({
      by: ['inv', 'method'],
      where: { inv: { not: null } },
      _count: { _all: true },
      having: { inv: { _count: { gt: 1 } } },
    });

    if (remaining.length > 0) {
      throw new Error(
        `Post-check failed: ${remaining.length} duplicate groups still present. ` +
          `Rolling back.`,
      );
    }

    return { deleted: deleted.count };
  });

  console.log(`✅ Done. rows_deleted=${result.deleted}`);
  console.log(
    '\nNow re-run:  yarn prisma db push   to add the @@unique([inv, method]) constraint.',
  );
}

main()
  .catch((err) => {
    console.error('❌', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
