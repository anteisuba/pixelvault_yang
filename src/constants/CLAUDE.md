# src/constants/ — Configuration & Enums

## Risk Level: HIGH (imported by most of `src/` — run the grep before changing)

Constants are imported throughout the entire codebase. Changes here affect provider selection, UI display, billing, and validation rules.

## Key Files

| File                          | Impact   | What It Controls                                                                                                                                                                   |
| ----------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `models.ts`                   | CRITICAL | AI_MODELS enum + ModelOption configs — drives model selection, provider routing, credit costs, UI display                                                                          |
| `providers.ts`                | HIGH     | AI_ADAPTER_TYPES enum + ProviderConfig — maps models to provider adapters                                                                                                          |
| `config.ts`                   | HIGH     | API_USAGE limits, PAGINATION, PROFILE limits, timeouts                                                                                                                             |
| `routes.ts`                   | MEDIUM   | URL route constants                                                                                                                                                                |
| `studio.ts`                   | MEDIUM   | Studio-specific constants (prompt textarea ID, variant count)                                                                                                                      |
| `character-card.ts`           | MEDIUM   | CHARACTER_CARD validation limits                                                                                                                                                   |
| `card-types.ts`               | MEDIUM   | BACKGROUND_CARD, STYLE_CARD, CARD_RECIPE limits                                                                                                                                    |
| `video-options.ts`            | MEDIUM   | Video duration, resolution constraints                                                                                                                                             |
| `audio-options.ts`            | MEDIUM   | Audio format, duration constraints                                                                                                                                                 |
| `feature-flags.ts`            | LOW      | Feature toggle flags                                                                                                                                                               |
| `provider-capabilities.ts`    | MEDIUM   | Per-provider feature matrix                                                                                                                                                        |
| `video-model-capabilities.ts` | MEDIUM   | Per-model video feature matrix                                                                                                                                                     |
| `assistant-operator.ts`       | HIGH     | 统一助手工具表 · SSE 事件名 · 确认三档 · 花钱工具表 · 项目规则限额。⚠ 钱闸总纲那段注释是宪法，改前读它                                                                             |
| `assistant-plan-visuals.ts`   | MEDIUM   | 计划卡待定项图示**封闭词表**（7 组 32 项）+ `ASSISTANT_PLAN_SWATCH_MIX`。词表外一律退化纯文字，⛔ 不猜图标                                                                         |
| `assistant-persona.ts`        | MEDIUM   | 助手 persona 取值表 + `ASSISTANT_PERSONA_DEFAULTS` + 预设头像 id（两款，画法住组件）                                                                                               |
| `node-types.ts`               | HIGH     | 画布 v4 四类 kind + 每类子型（`NODE_V4_*_SUBTYPE_IDS`）。ReactFlow 的 `node.type` 就是 kind                                                                                        |
| `node-slots.ts`               | HIGH     | 具名槽 · 端口表 `NODE_V4_PORTS` · 文本槽角色 · 容量。**连线合法性的唯一静态判据**；`inputs` 的数组顺序就是槽自上而下的顺序，也是排布顺序                                           |
| `node-assistant-ops.ts`       | HIGH     | v4 op 词表 + 确认三档 `tier` + `inverse` 形状 + 能否自动落。⚠ `generate` 是唯一扣 credit 的 op，钱闸那段注释是宪法                                                                 |
| `canvas-add-catalog.ts`       | MEDIUM   | ＋添加 菜单词表（四类分组，项 = `{kind, subtype}`）。⚠ 它同时是助手 `add_node` 的载荷词表，有测试锁住两处同步                                                                      |
| `node-studio.ts`              | HIGH     | 画布几何与文案常量：`NODE_V4_CARD`（320/400/480/720 + 槽卡 100+8 那段算术）· `NODE_V4_SNAPSHOT` · `NODE_V4_SUBTYPE_LABELS`（**稳定名的构件，不是 UI 文案**，一改存量节点名字就漂） |

## Change Checklist

### Adding a New AI Model (most common change)

Follow `docs/scenes/new-model.md` (workflow, 5 questions, checklist). The four things that must move together: `AI_MODELS` enum + `ModelOption` config here, the i18n entry in all three of `src/messages/{en,ja,zh}.json`, and the provider adapter in `src/services/providers/`. Verify with `npx vitest run src/constants/`.

Image entries declare their role with `imageKind` (`edit` = must-have-image endpoint, `lora-base` = exists to mount LoRA; omitted = `generate`). Generation surfaces read `getAvailableImageModels(IMAGE_KIND.GENERATE)`; ⛔ don't infer the role from `supportsLora` / `requiresReferenceImage`.

### Modifying config.ts (limits, timeouts, pagination)

These values are used at runtime. Changes affect:

- `API_USAGE` — rate limiting, affects API route factory
- `PAGINATION` — gallery/list page sizes
- Timeouts — health check, video polling, general fetch

### Modifying models.ts or providers.ts

1. Grep `AI_MODELS` and `AI_ADAPTER_TYPES` for all consumers
2. Check `src/services/providers/registry.ts` — does the adapter exist?
3. Check `src/services/model-config.service.ts` — capability resolution
4. Check i18n files for model display names
5. Run health check to verify new model works
