# Article localization implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Article language switches open the matching translation, and search engines see the right language and article content.

**Architecture:** Store an optional, unique EN to RU article link in the backend. Expose the paired article in reads and manage it from the admin edit form. Render article pages on the server, redirect mismatched locale URLs, and publish canonical, alternate language, and sitemap metadata.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Next.js 16, React, Jest, Vitest.

**Spec:** User request of 2026-11-06 and confirmed choice of explicit pairing in admin.

## Global Constraints

- Preserve the dirty primary backend checkout and isolate edits in clean branches.
- Do not expose credentials or run destructive integration tests against the Timeweb database.
- Deploy backend migration before frontend and verify the public Fire Accs pair afterward.

## Review Focus

- A requested locale with an existing translation resolves to that translation.
- A requested locale without a translation never renders text in the wrong language.
- Linking an article to itself, the same language, or a translation already paired elsewhere is rejected.
- Deleting one article leaves the remaining article readable.
- Server HTML contains the article title and canonical URL, with alternate language only for a real pair.

### Task 1: Backend translation link

**Files:** `prisma/schema.prisma`, a new migration, `src/domains/v1/articles/article/article.service.ts`, controller, service tests.

- [ ] Write failing tests for paired lookups, locale mismatch, and invalid pairing.
- [ ] Add nullable unique EN to RU link with `ON DELETE SET NULL` and backfill the verified Fire Accs pair.
- [ ] Implement link update and return paired `id`, `slug`, `lang` in article GET.
- [ ] Run focused Jest tests and backend build.
- [ ] Commit.

### Task 2: Admin pairing control

**Files:** `src/lib/api/articles.ts`, `src/components/articles/ArticleForm.tsx`.

- [ ] Add an API function to update a translation link.
- [ ] Add opposite-language selector on the edit form and save its value after the article update.
- [ ] Run admin tests and build.
- [ ] Commit.

### Task 3: Frontend locale navigation and indexing

**Files:** article route/client, header, article API types, locale metadata, sitemap and focused tests.

- [ ] Write failing tests for article URL selection and locale mismatch.
- [ ] Resolve language switches through the article translation link; unmatched articles go to the article listing.
- [ ] Server render the article and redirect wrong-locale URLs; add article metadata and a dynamic sitemap.
- [ ] Run frontend tests and build.
- [ ] Commit.

### Task 4: Production release

- [ ] Verify deployed versions, migration state, and rollback paths.
- [ ] Deploy backend, admin, then frontend, keeping previous releases available.
- [ ] Verify both Fire Accs URLs, language switch, response HTML, sitemap, and all service health checks.
- [ ] Push clean branches and record the release commits.
