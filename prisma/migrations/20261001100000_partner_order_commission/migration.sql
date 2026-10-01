-- Keep commission attribution after the unpaid transaction is cleared on payout.
ALTER TABLE "Order"
  ADD COLUMN "partnerId" TEXT,
  ADD COLUMN "partnerCommission" DECIMAL(65,30),
  ADD COLUMN "partnerCommissionRecordedAt" TIMESTAMP(3);
