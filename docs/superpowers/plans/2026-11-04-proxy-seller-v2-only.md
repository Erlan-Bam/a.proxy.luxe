# Proxy-Seller v2-only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove outbound Proxy-Seller v1 calls while retaining safe resident checkout and truthful read failures.

**Architecture:** One v2 Axios client serves all provider paths. ResidentProvisioner keeps its existing checkpoint and reservation logic; maintenance scripts use v2 directly.

**Tech Stack:** NestJS, Axios, Jest, Prisma.

**Spec:** `docs/superpowers/specs/2026-11-04-proxy-seller-v2-only-design.md`

## Global Constraints

- Never run paid provider operations in tests or verification.
- Never expose provider keys or proxy credentials.
- Never run the admin-log integration suite against Timeweb.

## Review Focus

- v2 HTML 403 must yield an error, not a successful empty list.
- v2 HTML 403 must not reuse a stale successful list.
- Residential purchase and package updates must use v2 without changing replay protection.
- Resident v2 purchases must use `paymentId: "balance"` and reject HTTP 200 business errors on reads and writes.
- Reconciliation must read v2 only and leave ambiguous paid attempts reserved.
- Repo-local `v1` customer routes are unrelated to provider versioning.

### Task 1: Runtime provider client

**Files:** `src/domains/product/product.service.ts`, `src/domains/product/proxy-seller-v2.spec.ts`, `src/domains/product/provider-read-cache.integration.spec.ts`

- [x] Change routing tests to expect v2 for residential and nonresidential calls, and expect v2 HTML 403 to fail closed.
- [x] Run the focused tests and observe their failure.
- [x] Remove v1 Axios client, path interceptor, and fallback; pass v2 client to ResidentProvisioner.
- [x] Run focused tests and confirm they pass.

### Task 2: Standalone scripts and remaining tests

**Files:** `scripts/reconcile-proxy-renewal.cjs`, `prisma/seed.ts`, `prisma/simulate-finish-order.ts`, resident test files, `src/domains/product/proxy-seller-api-version.ts`

- [x] Update standalone provider URLs and resident test client references.
- [x] Remove obsolete version router and tests.
- [x] Audit all outbound Proxy-Seller URLs for v1.
- [x] Run safe full suite and build, then verify clean branch.
