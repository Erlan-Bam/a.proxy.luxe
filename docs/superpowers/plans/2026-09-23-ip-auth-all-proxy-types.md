# IP Authorization For Supported Proxy Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver secure IP authorization creation, listing, and deletion for paid IPv6, ISP, and resident proxy orders.

**Architecture:** The backend owns provider identifiers and exposes order-scoped endpoints. It resolves the authenticated user's paid order, validates its proxy type, and calls Proxy-Seller with the stored exact `orderNumber`; frontend controls send only the application order ID and IP. Existing management UI from the prior feature branch is rebased onto the latest frontend and refined to use the order-scoped create endpoint.

**Tech Stack:** NestJS, Prisma, Jest, Next.js, TanStack Query, Vitest, Proxy-Seller API v1.

**Spec:** `docs/superpowers/specs/2026-09-23-ip-auth-all-proxy-types.md`

## Global Constraints

- Permit only paid orders owned by the authenticated user with type `ipv6`, `isp`, or `resident`.
- Never trust a provider order number from the browser for the new endpoint.
- Match provider authorizations by exact stored `orderNumber`.
- Preserve the legacy create endpoint for compatibility.
- Do not expose provider API keys, credentials, or unrelated authorizations.

## Review Focus

- A resident order whose `proxySellerId` is a package key must still list its authorization by exact `orderNumber`.
- An unsupported paid order type must be rejected before any provider call.
- A provider business error returned with HTTP 200 must become a client-visible error.
- A user must not list or delete another user's authorization.
- A successful create/delete mutation must invalidate only the affected order's authorization query.

---

### Task 1: Backend Order-Scoped Authorization API

**Files:**
- Modify: `src/domains/product/product.service.ts`
- Modify: `src/domains/v1/user/user.controller.ts`
- Modify: `src/domains/v1/user/user.service.ts`
- Create: `src/domains/v1/user/dto/create-ip-authorization.dto.ts`
- Modify: `src/domains/product/product.authorization.spec.ts`
- Modify: `src/domains/v1/user/user.ip-authorization.spec.ts`

**Interfaces:**
- Consumes: authenticated user ID, application order ID, validated IP string.
- Produces: `UserService.createIpAuthorization(userId, orderId, ip)`, exact-order-number `ProductService` create/list/delete behavior, and the order-scoped POST controller route.

- [ ] **Step 1: Write failing backend tests**

Add tests proving exact `orderNumber` filtering, resident support when `proxySellerId` differs, supported-type enforcement, order ownership, and the new controller/service create flow.

- [ ] **Step 2: Run backend tests to verify RED**

Run: `npm test -- --runInBand src/domains/product/product.authorization.spec.ts src/domains/v1/user/user.ip-authorization.spec.ts`

Expected: FAIL because the order-scoped create service and exact order-number lookup do not exist.

- [ ] **Step 3: Implement the backend contract**

Create the IP-only DTO, resolve owned orders with `type` and `orderNumber`, backfill eligible legacy ISP/IPv6 order numbers, filter `/auth/list` by exact order number, and add `POST orders/:orderId/ip-authorizations`.

- [ ] **Step 4: Run backend tests to verify GREEN**

Run: `npm test -- --runInBand src/domains/product/product.authorization.spec.ts src/domains/v1/user/user.ip-authorization.spec.ts`

Expected: PASS.

- [ ] **Step 5: Run backend regression verification and commit**

Run: `npm test -- --runInBand`

Expected: all relevant suites pass; any unrelated pre-existing failure is recorded explicitly.

Commit: `feat: scope IP authorization to supported proxy orders`

### Task 2: Frontend Authorization Management

**Files:**
- Cherry-pick existing feature commits: `fcba596`, `67a6cd6`, `e271eac`
- Modify: `entities/auth/api/ip-authorization.api.ts`
- Modify: `entities/auth/api/ip-authorization.api.spec.ts`
- Modify: `entities/auth/hooks/mutations/use-ip-auth.mutation.ts`
- Modify: `features/auth/id-auth.tsx`
- Modify: `features/auth/ip-authorization-list.tsx`
- Modify: `entities/proxy/ui/proxy-list/proxy-list.tsx`
- Modify: `features/auth/ip-authorization-list.spec.tsx`
- Modify: `messages/en/proxy-list.json`
- Modify: `messages/ru/proxy-list.json`

**Interfaces:**
- Consumes: backend order-scoped create/list/delete routes and proxy rows containing `orderId`.
- Produces: `ipAuthorizations.create(orderId, ip)`, supported-type key action, and a responsive popup with create/list/delete controls.

- [ ] **Step 1: Integrate the prior management UI commits**

Cherry-pick the three existing commits onto latest `origin/spark-fixes`, resolving conflicts without changing unrelated payment or proxy-checker work.

- [ ] **Step 2: Write failing frontend tests**

Add tests that expect `POST /api/v1/user/orders/:orderId/ip-authorizations`, query invalidation after create, and key-action eligibility only for `ipv6`, `isp`, and `resident` rows with an internal order ID.

- [ ] **Step 3: Run frontend tests to verify RED**

Run: `npm test -- --run`

Expected: FAIL because creation still uses the legacy endpoint and the action is not type-scoped.

- [ ] **Step 4: Implement frontend contract**

Move creation into the authorization API module, pass only `orderId` and `ip`, invalidate the affected query, and constrain the action to the three supported types.

- [ ] **Step 5: Run frontend tests/build and commit**

Run: `npm test -- --run && npm run build`

Expected: PASS.

Commit: `feat: manage IP authorization for proxy orders`

### Task 3: Production Deployment And Smoke Test

**Files:**
- Deploy backend artifact/container on VPS `85.136.112.203`.
- Deploy frontend release for `proxy.luxe` from the tested commit.

**Interfaces:**
- Consumes: committed backend and frontend builds from Tasks 1-2.
- Produces: production API and UI serving the tested feature with rollback copies retained.

- [ ] **Step 1: Record current production revisions and create rollback backups**

Expected: current container/image and frontend release are identifiable before replacement.

- [ ] **Step 2: Deploy backend and frontend builds**

Expected: containers/processes restart successfully with existing environment variables preserved.

- [ ] **Step 3: Run production smoke tests**

Verify health endpoints, supported proxy-page rendering in Russian and English, popup layout, and order-scoped endpoint authentication behavior. Do not add or remove authorization on a customer order.

- [ ] **Step 4: Record deployment evidence**

Expected: commit SHAs, service status, HTTP responses, and smoke-test results are captured for the final report.
