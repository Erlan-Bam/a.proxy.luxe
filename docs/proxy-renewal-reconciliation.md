# Reconcile a pending ISP or IPv6 renewal

Use this runbook when an attempt remains `PROCESSING` after an uncertain Proxy-Seller response. The user's price is reserved in the local balance before the paid provider request. A pending attempt blocks another renewal for the same source order. Do not send a second paid request while it is pending.

## Deploy prerequisite

Apply `prisma/migrations/20261026100000_proxy_renewal_attempt` with `prisma migrate deploy` using the backend's existing database environment **before** starting the backend image that contains this code. Confirm the migration reports success. The Docker build generates the Prisma client; it does not apply database migrations.

## Inspect and settle

1. Find the attempt UUID in `ProxyRenewalAttempt` for the affected `sourceOrderId`. Check `status`, `providerOrderId`, `ids`, `createdAt`, and the reserved `amount`. Keep the database URL and provider key out of shared logs.
2. Run the command inside the deployed backend container with its existing environment:

   ```sh
   node scripts/reconcile-proxy-renewal.cjs <attempt-uuid>
   ```

   The command reads the provider's current proxy list. If every requested address has reached its expected expiry, it records the paid renewal in the local order history and releases the source-order lock. It does not charge the balance again. A second run reports the terminal status without another write.

3. If the command reports `unresolved`, inspect the provider order and exact expiry dates with Proxy-Seller. The local balance remains reserved. A partial extension also remains unresolved and requires provider support before changing local state.
4. Release the reservation only after Proxy-Seller confirms the renewal was **not** performed, the provider dates have not advanced, and at least 15 minutes have elapsed. Then run:

   ```sh
   node scripts/reconcile-proxy-renewal.cjs <attempt-uuid> --release-confirmed
   ```

   The command rechecks the provider list, marks the attempt canceled, and returns the reserved amount to the user's balance in one database transaction. If provider data has advanced, it settles the renewal instead of refunding.

## Verify

Confirm the attempt is `PAID` with one linked `localOrderId`, or `CANCELED` with the reservation returned. Check the customer's balance, the paid order history, and the live provider expiry. If provider data is unavailable or incomplete, leave the attempt pending and retry the read-only inspection later.
