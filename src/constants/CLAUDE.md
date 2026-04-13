# src/constants/ — Configuration & Enums

## Risk Level: HIGH (178 files import from this directory)

Constants are imported throughout the entire codebase. Changes here affect provider selection, UI display, billing, and validation rules.

## Key Files

| File                          | Impact   | What It Controls                                                                                          |
| ----------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `models.ts`                   | CRITICAL | AI_MODELS enum + ModelOption configs — drives model selection, provider routing, credit costs, UI display |
| `providers.ts`                | HIGH     | AI_ADAPTER_TYPES enum + ProviderConfig — maps models to provider adapters                                 |
| `config.ts`                   | HIGH     | API_USAGE limits, FREE_TIER config, PAGINATION, PROFILE limits, timeouts                                  |
| `routes.ts`                   | MEDIUM   | URL route constants                                                                                       |
| `studio.ts`                   | MEDIUM   | Studio-specific constants (prompt textarea ID, variant count)                                             |
| `character-card.ts`           | MEDIUM   | CHARACTER_CARD validation limits                                                                          |
| `card-types.ts`               | MEDIUM   | BACKGROUND_CARD, STYLE_CARD, CARD_RECIPE limits                                                           |
| `video-options.ts`            | MEDIUM   | Video duration, resolution constraints                                                                    |
| `audio-options.ts`            | MEDIUM   | Audio format, duration constraints                                                                        |
| `feature-flags.ts`            | LOW      | Feature toggle flags                                                                                      |
| `provider-capabilities.ts`    | MEDIUM   | Per-provider feature matrix                                                                               |
| `video-model-capabilities.ts` | MEDIUM   | Per-model video feature matrix                                                                            |

## Change Checklist

### Adding a New AI Model (most common change)

Follow `sop_add_model.md` in memory. Summary:

1. Add model to `AI_MODELS` enum in `models.ts`
2. Add `ModelOption` config (provider, credit cost, capabilities)
3. Update i18n — all 3 files: `src/messages/en.json`, `ja.json`, `zh.json`
4. Add/update provider adapter if needed
5. Run `npx vitest run src/constants/` to verify

### Modifying config.ts (limits, timeouts, pagination)

These values are used at runtime. Changes affect:

- `FREE_TIER` — free generation limits, affects `usage.service.ts`
- `API_USAGE` — rate limiting, affects API route factory
- `PAGINATION` — gallery/list page sizes
- Timeouts — health check, video polling, general fetch

### Modifying models.ts or providers.ts

1. Grep `AI_MODELS` and `AI_ADAPTER_TYPES` for all consumers
2. Check `src/services/providers/registry.ts` — does the adapter exist?
3. Check `src/services/model-config.service.ts` — capability resolution
4. Check i18n files for model display names
5. Run health check to verify new model works
