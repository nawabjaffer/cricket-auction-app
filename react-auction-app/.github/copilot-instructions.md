# Copilot Instructions — Cricket Auction SaaS

## Context

This is a React + TypeScript cricket auction app being migrated to a multi-tenant SaaS. Read `.instructions.md` at project root for full architecture details.

## Key Rules

1. **Tenant scoping**: All Firebase RTDB paths must go through `tenantPath()` from `src/services/tenantPath.ts`. Never hardcode paths like `auction/soldPlayers` — use `tenantPath('auction/soldPlayers')`.
2. **Auth**: Custom auth with SHA-256 password hashing. No Firebase Auth SDK. Sessions stored in localStorage with tenantId.
3. **Module-level flags**: `_globalDataLoaded`, `_globalRestoreComplete`, `_globalPreloadComplete` must be reset when switching tenants.
4. **Firebase writes**: Always strip `undefined` values before writing to RTDB (it rejects them). Compress `data:` URLs to thumbnails before saving (see `compressDataUrl` in `auctionPersistence.ts`).
5. **CSS**: Use existing component-level CSS files. Don't add Tailwind classes to components that use vanilla CSS (check if `.css` file exists).
6. **Routes**: All routes must be tenant-prefixed: `/:tenantSlug/...`. Use `useTenant()` hook to get current tenant context.
7. **Services**: Follow singleton pattern with `initialize(db)`. Never create multiple instances.
8. **Types**: Add new types to `src/types/index.ts` or create topic-specific files (e.g., `scoring.ts`, `trials.ts`, `matches.ts`).

## Design Docs

Read these before making changes:
- `docs/SAAS_ARCHITECTURE.md` — Multi-tenant database schema, auth flow, migration plan
- `docs/SCORING_INTEGRATION.md` — Match scorer adapter pattern
- `docs/PLAYER_LIFECYCLE.md` — Trials → Auction → Squad → Match pipeline
