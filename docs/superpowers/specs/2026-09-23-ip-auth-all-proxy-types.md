# IP Authorization For Supported Proxy Types

## Goal

Customers can create, inspect, and remove Proxy-Seller IP authorizations for paid `ipv6`, `isp`, and `resident` orders from the existing proxy list interface.

## Provider Contract

- Create with `POST /auth/add/ip` and `{ orderNumber, ip }`.
- List with `GET /auth/list`.
- Delete with `DELETE /auth/delete` and `{ id }`.
- Proxy-Seller can return business failures inside an HTTP 200 response; those failures must be surfaced without reporting success.

## Application Contract

- The browser sends the internal application order ID, never a provider order number supplied by the user.
- The backend resolves a paid order owned by the authenticated user and permits only `ipv6`, `isp`, or `resident`.
- The stored provider `orderNumber` is the authorization boundary. This is required for resident orders because their `proxySellerId` is a package key rather than the provider order ID prefix.
- Legacy ISP/IPv6 orders with a missing stored `orderNumber` may be backfilled from the owned provider proxy list.
- Creation, listing, and deletion remain scoped to the authenticated user's exact order.
- IP input accepts valid IPv4 and IPv6 addresses through backend validation.

## Interface

- `POST /v1/user/orders/:orderId/ip-authorizations` body: `{ "ip": "203.0.113.10" }`.
- `GET /v1/user/orders/:orderId/ip-authorizations` response: `{ "items": IpAuthorization[] }`.
- `DELETE /v1/user/orders/:orderId/ip-authorizations/:authorizationId` response: `{ "success": true }`.
- The existing legacy `POST /v1/user/add-auth` endpoint remains compatible while the UI migrates to the order-scoped endpoint.

## User Experience

- The key action is enabled only for `ipv6`, `isp`, and `resident` rows that have an internal order ID.
- The existing popup contains the IP input plus current authorization rows.
- Successful creation refreshes the current list; deletion requires explicit confirmation and refreshes the list.
- Russian and English messages use the existing proxy-list translation namespace.

## Verification

- Backend unit tests cover all three supported types, unsupported types, ownership, exact order-number filtering, resident package-key mismatch, provider errors, and deletion ownership.
- Frontend tests cover the order-scoped create request, cache invalidation, list/delete calls, supported-type action visibility, and popup behavior.
- Production smoke tests confirm authenticated UI rendering and API health without exposing secrets or changing customer authorizations.
