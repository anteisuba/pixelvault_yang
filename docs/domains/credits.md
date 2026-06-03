# Credits Domain

Last updated: 2026-06-02

This document uses the historical domain name "credits", but the product target is not a paid credits wallet yet.
For current development, user-facing language should be "usage", "free allowance", and "platform allowance".

Provider pricing, provider billing behavior, and provider refund/cancellation rules must not be guessed here.
When provider-specific cost behavior affects product policy, verify against the current official provider documentation first and record it in `docs/integrations/providers.md`.

## Current

The current project does not have a user wallet, paid balance, recharge flow, or `User.credits` account model.

The implemented domain is closer to usage tracking plus free-tier/platform-allowance control:

- `FreeTierSlot` reserves a daily free-tier slot per user and date.
- `ApiUsageLedger` records provider/model usage attempts and links them to `Generation` or `GenerationJob` when available.
- `GenerationJob` records async generation execution state and request counts.
- `Generation.requestCount` and `Generation.isFreeGeneration` preserve generation-level usage metadata.
- `FREE_TIER.DAILY_LIMIT` is currently the per-user free allowance limit.
- `ModelConfig.cost` can override static model cost metadata.
- Historical `creditCost` naming still exists in generation service flows, but this should be treated as internal cost-unit metadata, not as a paid wallet product.

Current user-visible surfaces:

- `GET /api/usage-summary` returns total/success/failed usage counts and daily free allowance display data.
- The sidebar and Studio UI read usage summary through the API client and `useUsageSummary`.
- `GET /api/admin/free-tier-stats` exposes admin-only free-tier statistics.

Current user-facing free allowance display:

- Free-tier limiting currently reserves `FreeTierSlot` rows.
- Free-tier display now counts today's `FreeTierSlot` rows through `GET /api/usage-summary`.
- Successful `Generation` rows where `isFreeGeneration = true` remain asset-level history, not the user-facing daily allowance counter.

## Target

Credits domain should own the product rules around usage, free allowance, platform allowance, and future auditability.
It should not become a paid credits wallet until that is explicitly designed.

Target user-facing language:

- Use "usage" for activity history and consumed generation attempts.
- Use "free allowance" for the user's daily/monthly included usage.
- Use "platform allowance" for owner-funded provider-key usage.
- Avoid presenting this as purchased credits until a wallet/recharge product is intentionally introduced.

Target BYOK boundary:

- BYOK generation should record usage/audit data.
- BYOK generation must not consume free allowance or platform allowance.
- If the user explicitly selects an `apiKeyId`, failure must be loud and must not silently fall back to a platform key.
- API Keys domain owns key lifecycle and selection intent; Generation/provider services own final routing and execution.

Target platform-key allowance lifecycle:

1. Submit generation request.
2. Resolve effective model config and cost units server-side.
3. Reserve the required allowance before provider execution.
4. Execute provider call and persist the final asset.
5. Confirm allowance consumption only after successful generation and required platform persistence.
6. Release or refund the reservation on failed generation, cancellation, safety rejection, or platform storage failure.
7. Write auditable ledger entries for reservation, confirmation, release/refund, and later admin adjustment.

Target model cost resolution:

- Model cost must be resolved server-side through a single effective model config path.
- The effective result should include availability, adapter/provider, external model id, cost units, and config source.
- UI may display cost or allowance impact, but must not decide final deduction or affordability.

Target future ledger requirements:

- Support free/platform allowance reservation.
- Support successful confirmation.
- Support release/refund.
- Support admin adjustment.
- Preserve actor, reason, generation/job linkage, provider/model metadata, and idempotency key.
- Keep auditability even if a later paid credits wallet is introduced.

## Domain Boundaries

Credits domain owns:

- Usage summary semantics.
- Free allowance and platform allowance product rules.
- Cost-unit meaning at the product boundary.
- Reservation, confirmation, release/refund, and adjustment ledger rules.
- Audit requirements for allowance-impacting events.
- Admin adjustment requirements, even before a full admin UI exists.

Credits domain does not own:

- BYOK key binding, validation, encryption, masking, or deletion.
- Provider request payloads.
- Provider execution.
- Model-to-provider routing.
- Provider-specific billing/pricing documentation.
- R2 storage and media persistence.
- Gallery, Assets, Studio, or Project UI behavior.
- Paid wallet, recharge, payment, subscription, or marketplace logic.

## Do Not Break

- Do not let client state decide allowance consumption, affordability, refunds, or user identity.
- Do not silently convert BYOK failure into platform-key usage.
- Do not charge free/platform allowance for BYOK requests.
- Do not present internal `creditCost` fields as paid user balance.
- Do not add a paid credits wallet or recharge flow without a separate product decision.
- Do not hardcode provider pricing or refund assumptions from memory.
- Do not let usage/audit rows lose links to `Generation`, `GenerationJob`, provider, adapter, model, and user where available.
- Do not make admin adjustment a direct balance edit without an auditable ledger entry.
- Do not expose admin usage or allowance statistics without server-side admin authorization.

## Unresolved

- The future allowance ledger schema name and exact fields are not finalized.
- Reservation idempotency strategy is not finalized.
- Release/refund semantics are not implemented as a first-class ledger yet.
- `GET /api/usage-summary.freeGenerationsToday` now aligns with `FreeTierSlot`, but its field name still says "generations" even though the current meaning is reserved free-tier slots.
- User-visible allowance release/refund is still unresolved because current `FreeTierSlot` reservations are not released on failed/cancelled generations.
- `ModelConfig.cost` exists, but every generation route still needs an implementation audit to ensure it uses resolved effective model config consistently.
- Historical `creditCost` naming remains and may confuse future implementation unless it is clearly treated as internal cost units.
- Admin adjustment is required architecturally, but there is no current minimum admin API, script, or UI for it.
- The admin free-tier stats route currently exposes a platform daily limit value separately from `FREE_TIER.DAILY_LIMIT`; the source of truth for platform-wide limits needs to be clarified.
- Provider-side cancellation, refund, and billing behavior have not been verified here and must be checked against official provider docs before product rules depend on them.
- Cross-media consistency across image, video, audio, 3D, and long-video generation needs a focused implementation audit.

## Source of Truth

Current code facts:

- `prisma/schema.prisma`
- `src/constants/config.ts`
- `src/constants/models.ts`
- `src/services/usage.service.ts`
- `src/services/generation.service.ts`
- `src/services/model-config.service.ts`
- `src/services/image/generate-image.service.ts`
- `src/services/generate-video.service.ts`
- `src/services/generate-audio.service.ts`
- `src/services/generate-3d.service.ts`
- `src/app/api/usage-summary/route.ts`
- `src/app/api/admin/free-tier-stats/route.ts`
- `src/types/index.ts`
- `src/lib/api-client/api-keys.ts`
- `src/hooks/use-usage-summary.ts`
- `src/contexts/studio-context.tsx`
- `src/components/layout/AppSidebar.tsx`
- `src/components/business/studio-shared/workflow/StudioModeSelector.tsx`

Related documents:

- `docs/architecture/credits.md`
- `docs/architecture/generation.md`
- `docs/architecture/auth.md`
- `docs/domains/api-keys.md`

## Last Verified

- Date: 2026-06-02
- Method: usage / free-allowance / platform-allowance / BYOK 与 generation 链路的 service / schema / API 代码检查
- External docs: provider 侧的取消 / 退款 / 计费行为须按官方资料复核（见 Unresolved）
- Runtime: not run
- `docs/domains/studio.md`
- `docs/integrations/providers.md`
