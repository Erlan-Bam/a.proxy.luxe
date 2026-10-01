ALTER TABLE "Order" ADD COLUMN "residentFulfillment" JSONB;

CREATE UNIQUE INDEX "Order_one_pending_resident_fulfillment_per_user"
ON "Order" ("userId")
WHERE "type" = 'resident' AND "status" IN ('PENDING', 'PROCESSING')
AND "residentFulfillment" IS NOT NULL;
