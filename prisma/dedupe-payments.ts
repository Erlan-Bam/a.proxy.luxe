// prisma/dedupe-payments.ts
//
// Removes duplicate Payment rows that share the same (inv, method), keeps the
// OLDEST payment per group, and reverses the user-balance credits that came
// from the extra rows. Runs in a single transaction so it is all-or-nothing.
//
// Usage:
//   yarn ts-node prisma/dedupe-payments.ts           # dry run (no writes)
//   yarn ts-node prisma/dedupe-payments.ts --apply   # actually mutate data
//
// IMPORTANT: Take a DB backup before running with --apply.

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const ALLOW_NEGATIVE = process.argv.includes('--allow-negative');
const CLAMP_ZERO = process.argv.includes('--clamp-zero');
// Leave balance untouched for users where the refund would drive it negative —
// duplicate rows are still deleted, but the user keeps the full double-credit
// as a write-off. Use this when users have already spent the extra balance.
const KEEP_BALANCE_IF_NEGATIVE = process.argv.includes(
  '--keep-balance-if-negative',
);

interface DuplicateGroup {
  inv: number;
  method: string;
  copies: number;
  keepId: string;
  deleteIds: string[];
  userId: string;
  refundAmount: Prisma.Decimal;
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
        keepId: row.id,
        deleteIds: [],
        userId: row.userId,
        refundAmount: new Prisma.Decimal(0),
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
    existing.refundAmount = existing.refundAmount.plus(row.price);
  }

  return [...groups.values()].filter((g) => g.copies > 1);
}

async function checkBalanceImpact(groups: DuplicateGroup[]) {
  const refundByUser = new Map<string, Prisma.Decimal>();
  for (const g of groups) {
    const current = refundByUser.get(g.userId) ?? new Prisma.Decimal(0);
    refundByUser.set(g.userId, current.plus(g.refundAmount));
  }

  const users = await prisma.user.findMany({
    where: { id: { in: [...refundByUser.keys()] } },
    select: { id: true, balance: true, email: true },
  });

  const impact = users.map((u) => {
    const refund = refundByUser.get(u.id) as Prisma.Decimal;
    const wouldBeAfter = u.balance.minus(refund);
    const goesNegative = wouldBeAfter.lt(0);
    // When clamping, the effective refund is capped to the current balance —
    // the user can't be driven below zero; the difference is written off.
    const effectiveRefund =
      goesNegative && KEEP_BALANCE_IF_NEGATIVE
        ? new Prisma.Decimal(0)
        : goesNegative && CLAMP_ZERO
          ? u.balance
          : refund;
    const after = u.balance.minus(effectiveRefund);
    return {
      userId: u.id,
      email: u.email,
      balance: u.balance,
      refund,
      effectiveRefund,
      writeOff: refund.minus(effectiveRefund),
      after,
      goesNegative,
    };
  });

  return impact;
}

async function main() {
  console.log(`=== Payment dedupe (${APPLY ? 'APPLY' : 'DRY RUN'}) ===\n`);

  const groups = await findDuplicateGroups();

  if (groups.length === 0) {
    console.log('✅ No duplicate (inv, method) groups found. Nothing to do.');
    return;
  }

  console.log(`Found ${groups.length} duplicate groups:\n`);
  for (const g of groups) {
    console.log(
      `  inv=${g.inv} method=${g.method} copies=${g.copies} ` +
        `user=${g.userId} refund=${g.refundAmount.toString()} ` +
        `keep=${g.keepId} delete=[${g.deleteIds.join(', ')}]`,
    );
  }

  console.log('\n=== Balance impact ===\n');
  const impact = await checkBalanceImpact(groups);
  for (const row of impact) {
    const flag = row.goesNegative
      ? CLAMP_ZERO
        ? `clamped (write-off ${row.writeOff.toString()})`
        : '⚠️  NEGATIVE'
      : 'ok';
    console.log(
      `  user=${row.userId} (${row.email}) ` +
        `balance=${row.balance.toString()} - ${row.effectiveRefund.toString()} ` +
        `= ${row.after.toString()}  [${flag}]`,
    );
  }

  const negatives = impact.filter((r) => r.goesNegative);
  if (negatives.length > 0 && !ALLOW_NEGATIVE && !CLAMP_ZERO) {
    console.error(
      `\n❌ ${negatives.length} user(s) would go to a negative balance. ` +
        `Re-run with --clamp-zero (write off the excess) or --allow-negative ` +
        `(let balance go below zero).`,
    );
    process.exitCode = 1;
    return;
  }

  if (CLAMP_ZERO) {
    const totalWriteOff = impact.reduce(
      (sum, r) => sum.plus(r.writeOff),
      new Prisma.Decimal(0),
    );
    console.log(
      `\nℹ️  --clamp-zero: total write-off = ${totalWriteOff.toString()} across ` +
        `${negatives.length} user(s).`,
    );
  }

  if (!APPLY) {
    console.log(
      '\nℹ️  Dry run complete. Re-run with --apply to mutate the database.',
    );
    return;
  }

  console.log('\n=== Applying changes in a single transaction ===\n');

  // Use the impact table as the source of truth — it already applied --clamp-zero.
  const refundByUser = new Map<string, Prisma.Decimal>();
  for (const r of impact) {
    refundByUser.set(r.userId, r.effectiveRefund);
  }
  const allDeleteIds: string[] = [];
  for (const g of groups) {
    allDeleteIds.push(...g.deleteIds);
  }

  const result = await prisma.$transaction(async (tx) => {
    let balanceUpdates = 0;
    for (const [userId, refund] of refundByUser) {
      await tx.user.update({
        where: { id: userId },
        data: { balance: { decrement: refund } },
      });
      balanceUpdates += 1;
    }

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

    return { balanceUpdates, deleted: deleted.count };
  });

  console.log(
    `✅ Done. users_updated=${result.balanceUpdates} rows_deleted=${result.deleted}`,
  );
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
