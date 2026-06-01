# Usage and Allowance Architecture

最后更新：2026-06-01

本文档记录生成相关的用量、免费额度、平台额度和未来补偿账本规则。它不定义完整付费钱包，也不记录 provider 价格；provider 成本、限制和计费事实必须在 `docs/integrations/providers.md` 中基于官方资料核验。

## Product Direction

短期产品不做用户余额钱包，也不做充值点数系统。

用户可见语言应优先使用：

- 用量
- 免费额度
- 平台额度

内部代码可以暂时保留 `creditCost` 等历史字段名，但产品语义上不应把它解释成已售卖的付费 credits。

长期只有在明确要卖点数时，才正式引入 `Credits` 作为付费余额产品。

## Current State

### No Wallet Account

当前 `prisma/schema.prisma` 中 `User` 没有 `credits` 或 wallet balance 字段。

旧 migration 曾存在 `User.credits` 和 `Generation.creditsCost`，后续 migration 已将它们移除或迁移为 usage 语义。

当前系统更接近：

```text
BYOK account usage
+ free-tier/platform allowance
+ usage/job audit rows
```

而不是：

```text
paid credit balance
+ charge/refund wallet ledger
```

### Usage Ledger

`ApiUsageLedger` 是当前 API/provider 使用记录。

它记录：

- `userId`
- `generationId`
- `generationJobId`
- `adapterType`
- `provider`
- `modelId`
- `requestCount`
- input/output image count
- width/height/duration
- `wasSuccessful`
- `errorMessage`
- `createdAt`

`src/services/usage.service.ts` owns:

- `createApiUsageEntry`
- `attachUsageEntryToGeneration`
- `getUserUsageSummary`
- `getFreeTierSlotsUsedToday`
- `createGenerationJob`
- `completeGenerationJob`
- `failGenerationJob`
- `atomicReserveFreeTierSlot`

### Free Tier Slot

`FreeTierSlot` currently records:

- `userId`
- `date`

`FREE_TIER.DAILY_LIMIT` is currently `20`.

`atomicReserveFreeTierSlot(userId)` reserves one slot for `(userId, UTC date)` before platform-key free-tier execution.

Current user-facing free allowance display:

- Reservation is based on `FreeTierSlot`.
- `GET /api/usage-summary` displays `freeGenerationsToday` from today's `FreeTierSlot` count, so the visible daily usage count matches the current limiting source of truth.
- Successful `Generation` rows with `isFreeGeneration = true` remain useful for asset-level history and admin success stats, but they are not the daily allowance limit source.

### Generation Usage Fields

`Generation` currently stores:

- `requestCount`
- `isFreeGeneration`

These fields are useful for asset-level display and audit linkage, but they are not a complete financial ledger.

### Model Cost Source

Static model costs live in `src/constants/models/`.

`ModelConfig.cost` also exists in Prisma and `src/services/model-config.service.ts`. Current service behavior merges DB model configs first, then falls back to static `MODEL_OPTIONS`.

Target interpretation:

- `src/constants/models/* cost`: built-in default platform allowance units.
- `ModelConfig.cost`: optional runtime override.
- generation code should eventually use a single `resolveEffectiveModelConfig(modelId)` result instead of scattering cost resolution.

### BYOK Route

BYOK routes use the user's provider key.

They should record usage for observability and history, but they do not consume platform allowance because provider cost is paid by the user's provider account.

## Target Contract

### User-Visible Terms

Use these terms in product docs and UI:

- `usage`: historical usage and audit count
- `free allowance`: limited free access for users without BYOK
- `platform allowance`: platform-funded capacity backed by owner/platform API keys

Avoid using `credits` as user-visible paid balance until the product intentionally introduces paid credits.

### Short-Term Billing Boundary

Short term:

- no recharge flow
- no paid credit balance
- no customer wallet
- no public promise that `cost` equals money

The system may still show model cost as platform allowance units or usage units.

### BYOK Policy

BYOK generation:

- uses the user's selected or active provider key
- does not consume platform allowance
- does not consume free allowance
- writes usage/audit records
- should fail loudly if an explicitly selected key is unavailable or incompatible

This aligns with the BYOK priority defined in `docs/architecture/generation.md`.

### Platform Key Policy

Platform-key generation exists to make the product usable before users bind their own keys.

Because platform keys may spend owner-funded provider quota, platform access must be limited by free/platform allowance.

The purpose of free/platform allowance is abuse and cost control, not monetization.

### Allowance Lifecycle

Target lifecycle:

```text
submit generation
-> reserve allowance
-> execute provider / worker
-> persist Generation
-> confirm allowance consumption
```

Failure lifecycle:

```text
submit generation
-> reserve allowance
-> execution fails or is cancelled
-> release / refund allowance
-> record audit event
```

This is a target rule. Current code reserves `FreeTierSlot` before execution but does not yet have a release/refund ledger.

### Failure Policy

User-visible allowance should not be consumed for failed generations.

This includes:

- platform key missing or misconfigured
- provider temporary failure
- provider timeout
- worker failure
- webhook/callback/internal execution failure
- R2 persistence failure
- provider safety rejection
- invalid prompt or unsupported input
- user-cancelled task

Provider-side real costs may still happen in some of these cases, but that should be treated as platform operational risk unless a future paid product explicitly defines a different policy.

### Model Cost Resolution

Target model cost resolution should be centralized:

```text
resolveEffectiveModelConfig(modelId)
-> available
-> adapter
-> externalModelId
-> costUnits
-> source
```

`source` should indicate whether the value came from static constants or runtime `ModelConfig`.

Generation services should consume the resolved `costUnits` instead of independently reading cost from different places.

### Ledger Direction

The next architecture should introduce a ledger even before paid credits exist.

The ledger should support:

- reservation
- confirmation
- release
- admin adjustment
- audit reason
- actor
- generation/job linkage
- idempotency key

This ledger is for free allowance and platform allowance first. It should be designed so future paid credits can reuse the audit foundation, but it should not force a paid wallet product now.

### Admin Adjustment

Admin adjustment ledger is required as an architecture rule.

It is not the current main path and does not need a full admin UI immediately.

Minimum future path can be:

- internal API, or
- script, then
- admin page later

The important rule is that manual compensation must be auditable and must not be done by directly editing balances or counters without a ledger entry.

## Non-Goals

- Do not implement paid credit purchase flow now.
- Do not expose a user wallet balance now.
- Do not call current free allowance a paid credit system.
- Do not hardcode provider pricing from memory.
- Do not let UI decide final allowance consumption.
- Do not silently charge platform allowance for BYOK routes.

## Unresolved

- Exact schema name for future allowance ledger is unresolved. Candidates include `AllowanceLedger`, `PlatformAllowanceLedger`, or `UsageAllowanceLedger`.
- Exact reservation model is unresolved: whether reservation is its own table or a ledger row type.
- Exact idempotency key strategy is unresolved for retries, callbacks, and worker replays.
- Current `FreeTierSlot` count and successful `Generation` count do not express the full target lifecycle.
- Current failed `ApiUsageLedger` entries are audit records, not refund/release records.
- `GET /api/usage-summary` now displays reserved `FreeTierSlot` attempts. A future ledger still needs to represent reserved, confirmed, and released/refunded allowance states explicitly.
- Whether existing `ModelConfig.cost` should be actively used by every generation route needs implementation review.
- Provider-side cancellation/refund facts have not been checked against official provider docs.

## Source of Truth

- User-confirmed usage/allowance direction in the 2026-06-01 documentation redesign discussion.
- `docs/architecture/generation.md`
- `src/constants/config.ts`
- `src/constants/models.ts`
- `src/constants/models/`
- `src/app/api/usage-summary/route.ts`
- `src/services/usage.service.ts`
- `src/services/generation.service.ts`
- `src/services/model-config.service.ts`
- `src/services/image/generate-image.service.ts`
- `src/lib/model-options.ts`
- `src/types/index.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260315123000_add_usage_tracking/migration.sql`

## Last Verified

- Date: 2026-06-01
- Method: owner direction confirmation plus code inspection
- External docs: not checked; provider cancellation/refund behavior intentionally deferred to provider docs
- Runtime validation: not run
