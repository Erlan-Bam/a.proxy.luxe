ALTER TABLE "Order" ADD COLUMN "orderNumber" TEXT;

CREATE INDEX "Order_orderNumber_idx" ON "Order"("orderNumber");
