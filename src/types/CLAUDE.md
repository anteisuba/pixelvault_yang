# src/types/ — Central Type Hub

## Risk Level: CRITICAL (189 files depend on this)

This is the most widely imported module in the project. Changes here cascade to virtually every service, hook, component, and API route.

## Rules

1. **Before modifying any type**: run `grep -r "import.*from.*@/types" src/ --include="*.ts" --include="*.tsx" -l | wc -l` to confirm impact scope
2. **Only add optional fields** to existing types — adding required fields breaks all existing call sites
3. **Never rename or remove** existing exported types without updating ALL consumers first
4. All types must be Zod-schema-first: define `z.object(...)`, then `z.infer<typeof Schema>`
5. No `any` — use `unknown` + type guards if the shape is uncertain

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

- `index.ts` — All Zod schemas + TypeScript types (single file, ~2000 lines)
- `next-intl.d.ts` — next-intl augmentation
- `advanced-params.test.ts` — Tests for AdvancedParams schema
