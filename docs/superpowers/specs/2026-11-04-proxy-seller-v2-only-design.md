# Proxy-Seller v2-only integration

## Intent

Move every outbound Proxy-Seller request, including residential purchase and subpackage management, to API v2 before v1 retirement. Keep this project's own `/v1/...` public routes unchanged because they are a separate API contract.

## Approach

Use the existing v2 Axios client for all runtime calls and remove path-based v1 routing and 403 fallback. Keep resident fulfillment checkpoints and reservation logic unchanged, but send the v2 resident payment selector `balance`. Change standalone maintenance scripts that still contain outbound v1 URLs to v2. A v2 403 must invalidate any stale read cache; residential HTTP 200 business errors must surface as failures. Do not issue paid provider calls during verification.

## Alternatives considered

- Keep v1 fallback: maintains temporary availability during v2 403 but fails the full migration and will stop working when v1 retires.
- Replace all provider access with the vendor SDK: larger behavioral change across paid operations, unnecessary because documented v2 endpoints and payloads match the current HTTP client.

## Constraints and checks

Protect the dirty primary checkout. Test endpoint routing, read errors, resident purchase checkpoints, and reconciliation without paid calls. Deploy only after verifying actual production image, v2 read behavior, and rollback readiness. Provider API key must never enter logs or committed files. The historical Prisma seed performs a live provider update; never use it for migration verification.
