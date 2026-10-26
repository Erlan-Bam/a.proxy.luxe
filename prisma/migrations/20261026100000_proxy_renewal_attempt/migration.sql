CREATE TABLE "ProxyRenewalAttempt" (
    "id" TEXT NOT NULL,
    "sourceOrderId" TEXT NOT NULL,
    "activeSourceOrderId" TEXT,
    "userId" TEXT NOT NULL,
    "type" "Proxy" NOT NULL,
    "ids" JSONB NOT NULL,
    "periodId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "expiresBefore" JSONB NOT NULL,
    "expiresAfter" JSONB NOT NULL,
    "sourceEndDate" TEXT NOT NULL,
    "renewalEndDate" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PROCESSING',
    "providerOrderId" TEXT,
    "localOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProxyRenewalAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProxyRenewalAttempt_activeSourceOrderId_key"
ON "ProxyRenewalAttempt"("activeSourceOrderId");

CREATE INDEX "ProxyRenewalAttempt_sourceOrderId_requestKey_createdAt_idx"
ON "ProxyRenewalAttempt"("sourceOrderId", "requestKey", "createdAt");
