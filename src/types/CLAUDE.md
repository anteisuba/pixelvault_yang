# src/types/ — Central Type Hub

## Risk Level: CRITICAL (the most widely imported module in the repo — the grep in Rule 1 gives today's number)

This is the most widely imported module in the project. Changes here cascade to virtually every service, hook, component, and API route.

## Rules

1. **Before modifying any type**: run `grep -r "import.*from.*@/types" src/ --include="*.ts" --include="*.tsx" -l | wc -l` to confirm impact scope
2. **Change every consumer in the same change** when you add a required field, rename, or remove a type — the grep above is the list of files to edit, not a reason to keep the old shape alive (Engineering Principle 1: no compat layers, no shims)
3. All types must be Zod-schema-first: define `z.object(...)`, then `z.infer<typeof Schema>`
4. No `any` — use `unknown` + type guards if the shape is uncertain

## Core Types (highest impact — touch with extreme care)

| Type                    | Used By                                        | Notes                      |
| ----------------------- | ---------------------------------------------- | -------------------------- |
| `GenerateRequest`       | All generation services, API routes, hooks     | Image generation input     |
| `GenerationRecord`      | Gallery, Studio, Arena, all display components | The universal image record |
| `GenerateVideoRequest`  | Video pipeline, studio                         | Video generation input     |
| `CharacterCardRecord`   | Card services, studio, gallery                 | Character card display     |
| `AdvancedParams`        | Studio context, generation services            | Provider-specific params   |
| `StudioGenerateRequest` | Studio-only generation flow                    | Extends GenerateRequest    |

## Change Checklist

When modifying a type in this file:

1. Grep all importers of the specific type being changed
2. Update all service functions that construct or consume the type
3. Update all hooks that pass or receive the type
4. Update all API routes that validate the type (Zod schema changes)
5. Run `npx tsc --noEmit` to verify no type errors
6. Run `npx vitest run` to verify no test regressions

## File Structure

- `index.ts` — All Zod schemas + TypeScript types (single large file)
- `node-workflow.ts` — 画布 v4 契约：`NodeV4` / `NodeV4Data`（按 `kind` 分辨的四类形状）· `NodeWorkflowEdgeV4`（**`slot` 必填**）· `NodeV4SlotBinding` / `NodeV4SlotVersion` · `NodeWorkflowStateV4`（顶层 `version: 4`）。⚠ 落库路径上会 parse 这份 schema——**长度上限改一处就要同步 `src/constants/node-assistant-ops.ts` 的对应 `NODE_ASSISTANT_OP_LIMITS`**（超了不是显示被截断，是整份 project state 落不了库）。v3 的 `NodeWorkflowStateSchema` 是 `z.array()` **无逐项 `.catch()`**，⛔ 回填验证完成前不许删 legacy enum
- `node-assistant-ops.ts` — 助手 op 载荷 schema（`NodeAssistantOpV4Schema`）。⚠ 值域校验有意留在规划器而不是 `z.enum`：schema 拒 = 整批 op 陪葬，规划器拒 = 只拒坏的那一条
- `next-intl.d.ts` — next-intl augmentation
- `advanced-params.test.ts` — Tests for AdvancedParams schema
