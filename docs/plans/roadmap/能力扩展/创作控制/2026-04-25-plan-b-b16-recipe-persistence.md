# Plan B B.1.6 — Recipe Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Recipe` Prisma table and a complete CRUD service + four API routes (`POST /api/recipes`, `GET /api/recipes`, `GET /api/recipes/[id]`, `DELETE /api/recipes/[id]`) so users can save, list, retrieve, and soft-delete generation recipes from their Profile/Library.

**Architecture:** The `Recipe` model stores the full generation intent and compiled output (prompt, model, params, referenceAssets) as a self-contained record — separate from the existing `CardRecipe` system. All four routes use the `createApiRoute` / `createApiGetRoute` / `createApiGetByIdRoute` / `createApiDeleteRoute` factories from `src/lib/api-route-factory.ts`. The service takes `clerkId` and calls `ensureUser` internally, consistent with `character-scoring.service.ts`. A dedicated `src/lib/api-client/recipes.ts` follows the `projects.ts` client pattern.

**Tech Stack:** TypeScript · Zod · Prisma 7 · `createApiRoute` factory family · Vitest · `fetch` (client)

---

## Context: What Already Exists

Read before starting:

- `src/lib/api-route-factory.ts` — exposes `createApiRoute` (POST body), `createApiGetRoute` (GET query), `createApiGetByIdRoute` (GET /[id]), `createApiDeleteRoute` (DELETE /[id])
- `src/lib/api-client/projects.ts` — template for api-client file structure (raw `fetch`, `{ success, data, error }` pattern)
- `prisma/schema.prisma` — `OutputType` enum (IMAGE | VIDEO | AUDIO) already exists; `User` model is around line 80, needs `recipes Recipe[]` back-relation
- `src/types/index.ts` — `ImageIntentSchema` and `ReferenceAssetSchema` already exported; append new schemas at the end
- `src/test/api-helpers.ts` — `FAKE_DB_USER`, `mockAuthenticated`, `mockUnauthenticated`, `createPOST`, `createGET`, `parseJSON` are available
- `src/constants/config.ts` — `API_ENDPOINTS` object at L120–145; add `RECIPES` constant

**Important:** `parentGenerationId` is stored as a plain `String?` column without a Prisma `@relation` directive — this avoids modifying the high-risk `Generation` model.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/types/index.ts` | Append `CreateRecipeRequestSchema`, `ListRecipesQuerySchema`, `RecipeRecord` type |
| Create | `src/types/recipe-schema.test.ts` | Schema validation tests |
| Modify | `prisma/schema.prisma` | Add `Recipe` model + `recipes Recipe[]` to `User` |
| Create | `src/services/recipe.service.ts` | `createRecipe`, `listRecipes`, `getRecipe`, `deleteRecipe` |
| Create | `src/services/recipe.service.test.ts` | Service tests (mock Prisma + ensureUser) |
| Modify | `src/constants/config.ts` | Add `RECIPES: '/api/recipes'` to `API_ENDPOINTS` |
| Create | `src/app/api/recipes/route.ts` | `POST` (create) + `GET` (list) |
| Create | `src/app/api/recipes/route.test.ts` | POST + GET route tests |
| Create | `src/app/api/recipes/[id]/route.ts` | `GET` (single) + `DELETE` |
| Create | `src/app/api/recipes/[id]/route.test.ts` | GET + DELETE route tests |
| Create | `src/lib/api-client/recipes.ts` | Client functions for all four routes |

---

### Task 1: Schemas + Prisma migration

**Files:**
- Modify: `src/types/index.ts` (append)
- Create: `src/types/recipe-schema.test.ts`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Write the failing schema tests**

Create `src/types/recipe-schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

import {
  CreateRecipeRequestSchema,
  ListRecipesQuerySchema,
} from '@/types'

describe('CreateRecipeRequestSchema', () => {
  const MINIMAL = {
    compiledPrompt: 'a beautiful sunset',
    modelId: 'flux-2-pro',
    provider: 'fal',
  }

  it('accepts minimal valid input', () => {
    expect(CreateRecipeRequestSchema.safeParse(MINIMAL).success).toBe(true)
  })

  it('defaults name to empty string', () => {
    const result = CreateRecipeRequestSchema.safeParse(MINIMAL)
    expect(result.success && result.data.name).toBe('')
  })

  it('defaults outputType to IMAGE', () => {
    const result = CreateRecipeRequestSchema.safeParse(MINIMAL)
    expect(result.success && result.data.outputType).toBe('IMAGE')
  })

  it('rejects when compiledPrompt is missing', () => {
    const { compiledPrompt: _omit, ...rest } = MINIMAL
    expect(CreateRecipeRequestSchema.safeParse(rest).success).toBe(false)
  })

  it('rejects when compiledPrompt is empty', () => {
    expect(
      CreateRecipeRequestSchema.safeParse({ ...MINIMAL, compiledPrompt: '' })
        .success,
    ).toBe(false)
  })

  it('rejects an invalid outputType', () => {
    expect(
      CreateRecipeRequestSchema.safeParse({ ...MINIMAL, outputType: 'TEXT' })
        .success,
    ).toBe(false)
  })

  it('accepts VIDEO outputType', () => {
    expect(
      CreateRecipeRequestSchema.safeParse({ ...MINIMAL, outputType: 'VIDEO' })
        .success,
    ).toBe(true)
  })
})

describe('ListRecipesQuerySchema', () => {
  it('defaults page to 1 and limit to 20', () => {
    const result = ListRecipesQuerySchema.safeParse({})
    expect(result.success && result.data.page).toBe(1)
    expect(result.success && result.data.limit).toBe(20)
  })

  it('coerces string numbers from query params', () => {
    const result = ListRecipesQuerySchema.safeParse({ page: '2', limit: '10' })
    expect(result.success && result.data.page).toBe(2)
    expect(result.success && result.data.limit).toBe(10)
  })

  it('rejects limit above 50', () => {
    expect(
      ListRecipesQuerySchema.safeParse({ limit: '100' }).success,
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/types/recipe-schema.test.ts --reporter=verbose
```

Expected: all 10 tests FAIL with missing export error.

- [ ] **Step 3: Append schemas to `src/types/index.ts`**

After the `GenerateEvaluationRequest` export (end of file), append:

```ts
// ─── Creative Control: Recipe Persistence ────────────────────────

export const CreateRecipeRequestSchema = z.object({
  /** Display name for the recipe */
  name: z.string().max(200).default(''),
  /** Media type this recipe produces */
  outputType: z.enum(['IMAGE', 'VIDEO', 'AUDIO']).default('IMAGE'),
  /** Structured intent parsed from the user's natural language */
  userIntent: ImageIntentSchema.optional(),
  /** Compiled, model-ready prompt string */
  compiledPrompt: z.string().min(1).max(5000),
  /** Negative prompt (optional) */
  negativePrompt: z.string().max(1000).optional(),
  /** AI model ID (AI_MODELS enum value) */
  modelId: z.string().min(1),
  /** Provider adapter identifier */
  provider: z.string().min(1),
  /** Advanced generation parameters (guidance, steps, loras, etc.) */
  params: z.record(z.string(), z.unknown()).optional(),
  /** Reference images with roles */
  referenceAssets: z.array(ReferenceAssetSchema).max(5).optional(),
  /** Generation seed for reproducibility */
  seed: z.coerce.bigint().optional(),
  /** ID of the Generation this recipe was saved from */
  parentGenerationId: z.string().optional(),
})

export type CreateRecipeRequest = z.infer<typeof CreateRecipeRequestSchema>

export const ListRecipesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
})

export type ListRecipesQuery = z.infer<typeof ListRecipesQuerySchema>

/** Wire-format recipe record returned from the API (dates are ISO strings) */
export type RecipeRecord = {
  id: string
  userId: string
  outputType: 'IMAGE' | 'VIDEO' | 'AUDIO'
  name: string
  compiledPrompt: string
  negativePrompt: string | null
  modelId: string
  provider: string
  version: number
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 4: Add the `Recipe` model to `prisma/schema.prisma`**

At the end of the schema file (after `FreeTierSlot`), add:

```prisma
model Recipe {
  id                 String     @id @default(cuid())
  userId             String
  user               User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  outputType         OutputType @default(IMAGE)
  name               String     @default("")
  userIntent         Json?
  compiledPrompt     String     @db.Text
  negativePrompt     String?    @db.Text
  modelId            String
  provider           String
  params             Json?
  referenceAssets    Json?
  seed               BigInt?
  parentGenerationId String?
  version            Int        @default(1)
  evaluationSummary  Json?
  isDeleted          Boolean    @default(false)
  createdAt          DateTime   @default(now())
  updatedAt          DateTime   @updatedAt

  @@index([userId, isDeleted, createdAt(sort: Desc)])
}
```

Also add the back-relation on the `User` model. Find the `User` model's relation fields (near the `cardRecipes CardRecipe[]` line) and add:

```prisma
  recipes          Recipe[]
```

- [ ] **Step 5: Run the Prisma migration**

```bash
npx prisma migrate dev --name add_recipe_table
```

Expected: `The following migration(s) have been created and applied ... add_recipe_table`

- [ ] **Step 6: Run schema tests to confirm all 10 pass**

```bash
npx vitest run src/types/recipe-schema.test.ts --reporter=verbose
```

Expected: 10/10 PASS

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/types/recipe-schema.test.ts prisma/schema.prisma prisma/migrations/
git commit -m "feat(plan-b): add recipe schemas and Recipe table migration"
```

---

### Task 2: Recipe service (CRUD)

**Files:**
- Create: `src/services/recipe.service.ts`
- Create: `src/services/recipe.service.test.ts`

- [ ] **Step 1: Write the failing service tests**

Create `src/services/recipe.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockEnsureUser = vi.fn()
const mockCreate = vi.fn()
const mockFindMany = vi.fn()
const mockCount = vi.fn()
const mockFindFirst = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

vi.mock('@/lib/db', () => ({
  db: {
    recipe: {
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}))

import {
  createRecipe,
  listRecipes,
  getRecipe,
  deleteRecipe,
} from '@/services/recipe.service'

const FAKE_USER = { id: 'db_user_123', clerkId: 'clerk_test_user' }

const FAKE_RECIPE = {
  id: 'recipe_abc',
  userId: 'db_user_123',
  outputType: 'IMAGE',
  name: 'My Recipe',
  compiledPrompt: 'a beautiful sunset',
  negativePrompt: null,
  modelId: 'flux-2-pro',
  provider: 'fal',
  version: 1,
  isDeleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const VALID_INPUT = {
  compiledPrompt: 'a beautiful sunset',
  modelId: 'flux-2-pro',
  provider: 'fal',
  name: '',
  outputType: 'IMAGE' as const,
}

describe('createRecipe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockCreate.mockResolvedValue(FAKE_RECIPE)
  })

  it('calls db.recipe.create with the user id and input', async () => {
    await createRecipe('clerk_test_user', VALID_INPUT)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'db_user_123',
          compiledPrompt: 'a beautiful sunset',
          modelId: 'flux-2-pro',
        }),
      }),
    )
  })

  it('returns the created recipe record', async () => {
    const result = await createRecipe('clerk_test_user', VALID_INPUT)
    expect(result.id).toBe('recipe_abc')
  })
})

describe('listRecipes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindMany.mockResolvedValue([FAKE_RECIPE])
    mockCount.mockResolvedValue(1)
  })

  it('returns paginated recipes and total count', async () => {
    const result = await listRecipes('clerk_test_user', 1, 20)
    expect(result.recipes).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('queries only non-deleted recipes for the user', async () => {
    await listRecipes('clerk_test_user', 1, 20)
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'db_user_123',
          isDeleted: false,
        }),
      }),
    )
  })
})

describe('getRecipe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindFirst.mockResolvedValue(FAKE_RECIPE)
  })

  it('returns the recipe when found', async () => {
    const result = await getRecipe('clerk_test_user', 'recipe_abc')
    expect(result?.id).toBe('recipe_abc')
  })

  it('returns null when db returns null', async () => {
    mockFindFirst.mockResolvedValue(null)
    const result = await getRecipe('clerk_test_user', 'recipe_missing')
    expect(result).toBeNull()
  })
})

describe('deleteRecipe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindFirst.mockResolvedValue(FAKE_RECIPE)
    mockUpdate.mockResolvedValue({ ...FAKE_RECIPE, isDeleted: true })
  })

  it('soft-deletes the recipe and returns true', async () => {
    const result = await deleteRecipe('clerk_test_user', 'recipe_abc')
    expect(result).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'recipe_abc' },
        data: { isDeleted: true },
      }),
    )
  })

  it('returns false when recipe is not found', async () => {
    mockFindFirst.mockResolvedValue(null)
    const result = await deleteRecipe('clerk_test_user', 'recipe_missing')
    expect(result).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/services/recipe.service.test.ts --reporter=verbose
```

Expected: all 8 tests FAIL with `Cannot find module '@/services/recipe.service'`

- [ ] **Step 3: Implement the service**

Create `src/services/recipe.service.ts`:

```ts
import 'server-only'

import { db } from '@/lib/db'
import { ensureUser } from '@/services/user.service'
import type { CreateRecipeRequest } from '@/types'

export async function createRecipe(
  clerkId: string,
  input: CreateRecipeRequest,
) {
  const dbUser = await ensureUser(clerkId)

  return db.recipe.create({
    data: {
      userId: dbUser.id,
      outputType: input.outputType ?? 'IMAGE',
      name: input.name ?? '',
      userIntent: input.userIntent ?? undefined,
      compiledPrompt: input.compiledPrompt,
      negativePrompt: input.negativePrompt,
      modelId: input.modelId,
      provider: input.provider,
      params: input.params ?? undefined,
      referenceAssets: input.referenceAssets ?? undefined,
      seed: input.seed,
      parentGenerationId: input.parentGenerationId,
    },
  })
}

export async function listRecipes(
  clerkId: string,
  page: number,
  limit: number,
) {
  const dbUser = await ensureUser(clerkId)

  const skip = (page - 1) * limit

  const [recipes, total] = await Promise.all([
    db.recipe.findMany({
      where: { userId: dbUser.id, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.recipe.count({
      where: { userId: dbUser.id, isDeleted: false },
    }),
  ])

  return { recipes, total }
}

export async function getRecipe(clerkId: string, id: string) {
  const dbUser = await ensureUser(clerkId)

  return db.recipe.findFirst({
    where: { id, userId: dbUser.id, isDeleted: false },
  })
}

export async function deleteRecipe(
  clerkId: string,
  id: string,
): Promise<boolean> {
  const dbUser = await ensureUser(clerkId)

  const existing = await db.recipe.findFirst({
    where: { id, userId: dbUser.id, isDeleted: false },
    select: { id: true },
  })

  if (!existing) return false

  await db.recipe.update({
    where: { id },
    data: { isDeleted: true },
  })

  return true
}
```

- [ ] **Step 4: Run tests to confirm all 8 pass**

```bash
npx vitest run src/services/recipe.service.test.ts --reporter=verbose
```

Expected: 8/8 PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/recipe.service.ts src/services/recipe.service.test.ts
git commit -m "feat(plan-b): add recipe service with CRUD (createRecipe, listRecipes, getRecipe, deleteRecipe)"
```

---

### Task 3: POST + GET /api/recipes routes

**Files:**
- Modify: `src/constants/config.ts`
- Create: `src/app/api/recipes/route.ts`
- Create: `src/app/api/recipes/route.test.ts`

- [ ] **Step 1: Write the failing route tests**

Create `src/app/api/recipes/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createPOST,
  createGET,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockCreate = vi.fn()
const mockList = vi.fn()

vi.mock('@/services/recipe.service', () => ({
  createRecipe: (...args: unknown[]) => mockCreate(...args),
  listRecipes: (...args: unknown[]) => mockList(...args),
}))

import { POST, GET } from '@/app/api/recipes/route'

const FAKE_RECIPE = {
  id: 'recipe_abc',
  userId: 'db_user_123',
  outputType: 'IMAGE',
  name: '',
  compiledPrompt: 'a beautiful sunset',
  negativePrompt: null,
  modelId: 'flux-2-pro',
  provider: 'fal',
  version: 1,
  isDeleted: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('POST /api/recipes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockCreate.mockResolvedValue(FAKE_RECIPE)
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockUnauthenticated()
    const req = createPOST('/api/recipes', {
      compiledPrompt: 'a cat',
      modelId: 'flux-2-pro',
      provider: 'fal',
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when compiledPrompt is missing', async () => {
    const req = createPOST('/api/recipes', {
      modelId: 'flux-2-pro',
      provider: 'fal',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when modelId is missing', async () => {
    const req = createPOST('/api/recipes', {
      compiledPrompt: 'a cat',
      provider: 'fal',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 201 with the created recipe', async () => {
    const req = createPOST('/api/recipes', {
      compiledPrompt: 'a beautiful sunset',
      modelId: 'flux-2-pro',
      provider: 'fal',
    })
    const res = await POST(req)
    const body = await parseJSON<{ success: boolean; data: typeof FAKE_RECIPE }>(
      res,
    )

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('recipe_abc')
  })

  it('calls createRecipe with the authenticated clerkId', async () => {
    const req = createPOST('/api/recipes', {
      compiledPrompt: 'a cat',
      modelId: 'flux-2-pro',
      provider: 'fal',
    })
    await POST(req)
    expect(mockCreate).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({ compiledPrompt: 'a cat' }),
    )
  })
})

describe('GET /api/recipes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockList.mockResolvedValue({ recipes: [FAKE_RECIPE], total: 1 })
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockUnauthenticated()
    const req = createGET('/api/recipes')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 200 with paginated recipes', async () => {
    const req = createGET('/api/recipes')
    const res = await GET(req)
    const body = await parseJSON<{
      success: boolean
      data: { recipes: typeof FAKE_RECIPE[]; total: number }
    }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.recipes).toHaveLength(1)
    expect(body.data.total).toBe(1)
  })

  it('passes page and limit query params to listRecipes', async () => {
    const req = createGET('/api/recipes', { page: '2', limit: '5' })
    await GET(req)
    expect(mockList).toHaveBeenCalledWith('clerk_test_user', 2, 5)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/app/api/recipes/route.test.ts --reporter=verbose
```

Expected: all 8 tests FAIL with `Cannot find module '@/app/api/recipes/route'`

- [ ] **Step 3: Add the endpoint constant**

In `src/constants/config.ts`, find `GENERATION_PLAN: '/api/generation/plan',` and add `RECIPES` next to it:

```ts
  GENERATION_PLAN: '/api/generation/plan',
  GENERATION_EVALUATE: '/api/generation/evaluate',
  RECIPES: '/api/recipes',
```

- [ ] **Step 4: Create the route**

Create `src/app/api/recipes/route.ts`:

```ts
import 'server-only'

import { NextResponse } from 'next/server'
import { createApiRoute, createApiGetRoute } from '@/lib/api-route-factory'
import {
  CreateRecipeRequestSchema,
  ListRecipesQuerySchema,
} from '@/types'
import {
  createRecipe,
  listRecipes,
} from '@/services/recipe.service'

export const POST = async (...args: Parameters<ReturnType<typeof createApiRoute>>) => {
  const inner = createApiRoute<typeof CreateRecipeRequestSchema, Awaited<ReturnType<typeof createRecipe>>>({
    schema: CreateRecipeRequestSchema,
    routeName: 'POST /api/recipes',
    handler: async (clerkId, data) => {
      return createRecipe(clerkId, data)
    },
  })
  const res = await inner(...args)
  // Return 201 for resource creation
  return new NextResponse(res.body, { status: res.status === 200 ? 201 : res.status, headers: res.headers })
}

export const GET = createApiGetRoute<typeof ListRecipesQuerySchema, Awaited<ReturnType<typeof listRecipes>>>({
  schema: ListRecipesQuerySchema,
  routeName: 'GET /api/recipes',
  requireAuth: true,
  handler: async ({ clerkId, data }) => {
    return listRecipes(clerkId!, data.page, data.limit)
  },
})
```

- [ ] **Step 5: Run tests to confirm all 8 pass**

```bash
npx vitest run src/app/api/recipes/route.test.ts --reporter=verbose
```

Expected: 8/8 PASS

- [ ] **Step 6: Commit**

```bash
git add src/constants/config.ts src/app/api/recipes/route.ts src/app/api/recipes/route.test.ts
git commit -m "feat(plan-b): add POST /api/recipes (create) and GET /api/recipes (list) routes"
```

---

### Task 4: GET + DELETE /api/recipes/[id] routes + api-client

**Files:**
- Create: `src/app/api/recipes/[id]/route.ts`
- Create: `src/app/api/recipes/[id]/route.test.ts`
- Create: `src/lib/api-client/recipes.ts`

- [ ] **Step 1: Write the failing route tests**

Create `src/app/api/recipes/[id]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  createDELETE,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockGet = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/services/recipe.service', () => ({
  getRecipe: (...args: unknown[]) => mockGet(...args),
  deleteRecipe: (...args: unknown[]) => mockDelete(...args),
}))

import { GET, DELETE } from '@/app/api/recipes/[id]/route'

const FAKE_RECIPE = {
  id: 'recipe_abc',
  userId: 'db_user_123',
  outputType: 'IMAGE',
  name: 'My Recipe',
  compiledPrompt: 'a beautiful sunset',
  negativePrompt: null,
  modelId: 'flux-2-pro',
  provider: 'fal',
  version: 1,
  isDeleted: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const FAKE_CONTEXT = {
  params: Promise.resolve({ id: 'recipe_abc' }),
}

describe('GET /api/recipes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockGet.mockResolvedValue(FAKE_RECIPE)
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockUnauthenticated()
    const req = createGET('/api/recipes/recipe_abc')
    const res = await GET(req, FAKE_CONTEXT)
    expect(res.status).toBe(401)
  })

  it('returns 404 when recipe is not found', async () => {
    mockGet.mockResolvedValue(null)
    const req = createGET('/api/recipes/recipe_missing')
    const res = await GET(req, { params: Promise.resolve({ id: 'recipe_missing' }) })
    expect(res.status).toBe(404)
  })

  it('returns 200 with the recipe on success', async () => {
    const req = createGET('/api/recipes/recipe_abc')
    const res = await GET(req, FAKE_CONTEXT)
    const body = await parseJSON<{ success: boolean; data: typeof FAKE_RECIPE }>(
      res,
    )
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('recipe_abc')
  })
})

describe('DELETE /api/recipes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockDelete.mockResolvedValue(true)
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockUnauthenticated()
    const req = createDELETE('/api/recipes/recipe_abc')
    const res = await DELETE(req, FAKE_CONTEXT)
    expect(res.status).toBe(401)
  })

  it('returns 404 when recipe is not found', async () => {
    mockDelete.mockResolvedValue(false)
    const req = createDELETE('/api/recipes/recipe_missing')
    const res = await DELETE(req, { params: Promise.resolve({ id: 'recipe_missing' }) })
    expect(res.status).toBe(404)
  })

  it('returns 200 on successful deletion', async () => {
    const req = createDELETE('/api/recipes/recipe_abc')
    const res = await DELETE(req, FAKE_CONTEXT)
    const body = await parseJSON<{ success: boolean; data: null }>(res)
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/app/api/recipes/[id]/route.test.ts --reporter=verbose
```

Expected: all 6 tests FAIL with `Cannot find module`.

- [ ] **Step 3: Create the [id] route**

Create `src/app/api/recipes/[id]/route.ts`:

```ts
import 'server-only'

import {
  createApiGetByIdRoute,
  createApiDeleteRoute,
} from '@/lib/api-route-factory'
import { getRecipe, deleteRecipe } from '@/services/recipe.service'

export const GET = createApiGetByIdRoute({
  routeName: 'GET /api/recipes/[id]',
  notFoundMessage: 'Recipe not found',
  handler: async (clerkId, id) => {
    return getRecipe(clerkId, id)
  },
})

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/recipes/[id]',
  notFoundMessage: 'Recipe not found',
  handler: async (clerkId, id) => {
    return deleteRecipe(clerkId, id)
  },
})
```

- [ ] **Step 4: Run [id] route tests to confirm all 6 pass**

```bash
npx vitest run "src/app/api/recipes/[id]/route.test.ts" --reporter=verbose
```

Expected: 6/6 PASS

- [ ] **Step 5: Create the api-client file**

Create `src/lib/api-client/recipes.ts`:

```ts
import { API_ENDPOINTS } from '@/constants/config'
import type { CreateRecipeRequest } from '@/types'

import { getErrorMessage } from '@/lib/api-client/shared'

export async function createRecipeAPI(
  data: CreateRecipeRequest,
): Promise<{ success: boolean; data?: { id: string }; error?: string }> {
  try {
    const response = await fetch(API_ENDPOINTS.RECIPES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, `Failed with status ${response.status}`),
      }
    }
    return await response.json()
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

export async function listRecipesAPI(
  page = 1,
  limit = 20,
): Promise<{ success: boolean; data?: { recipes: unknown[]; total: number }; error?: string }> {
  try {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    const response = await fetch(`${API_ENDPOINTS.RECIPES}?${params.toString()}`)
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, `Failed with status ${response.status}`),
      }
    }
    return await response.json()
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

export async function getRecipeAPI(
  id: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const response = await fetch(`${API_ENDPOINTS.RECIPES}/${id}`)
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, `Failed with status ${response.status}`),
      }
    }
    return await response.json()
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

export async function deleteRecipeAPI(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_ENDPOINTS.RECIPES}/${id}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, `Failed with status ${response.status}`),
      }
    }
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}
```

- [ ] **Step 6: Run full suite to check for regressions**

```bash
npx vitest run src/services/ src/types/ src/app/api/recipes/ --reporter=verbose
```

Expected: all passing

- [ ] **Step 7: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add src/app/api/recipes/[id]/route.ts "src/app/api/recipes/[id]/route.test.ts" src/lib/api-client/recipes.ts
git commit -m "feat(plan-b): add GET + DELETE /api/recipes/[id] routes and recipe api-client"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ `Recipe` Prisma table with all required fields (id, userId, outputType, userIntent, compiledPrompt, negativePrompt, modelId, provider, params, referenceAssets, seed, parentGenerationId, version, evaluationSummary, timestamps)
- ✅ `POST /api/recipes` — create
- ✅ `GET /api/recipes` — list with pagination
- ✅ `GET /api/recipes/[id]` — get single
- ✅ `DELETE /api/recipes/[id]` — soft delete
- ⏭ `POST /api/recipes/[id]/remix` — deferred to B.1.5 (requires Studio integration for generation triggering)
- ✅ Gallery not affected (user boundary respected)

**2. Placeholder scan:** No TBD or vague instructions. All code is complete.

**3. Type consistency:**
- `CreateRecipeRequest` used identically in service, route, and api-client
- `createRecipe(clerkId: string, input: CreateRecipeRequest)` → consistent across service + route + tests
- `deleteRecipe` returns `Promise<boolean>` → consistent with `createApiDeleteRoute` handler contract (`false` → 404)

**Note on Task 3 POST route:** The `createApiRoute` factory returns 200 by default. This plan wraps it to return 201 for resource creation. If the project convention prefers 200 everywhere, remove the 201 wrapper and change the test assertion to `toBe(200)`.

## Verification Contract

```bash
# After Task 1
npx vitest run src/types/recipe-schema.test.ts --reporter=verbose
# Expected: 10/10 PASS

# After Task 2
npx vitest run src/services/recipe.service.test.ts --reporter=verbose
# Expected: 8/8 PASS

# After Task 3
npx vitest run src/app/api/recipes/route.test.ts --reporter=verbose
# Expected: 8/8 PASS

# After Task 4
npx vitest run "src/app/api/recipes/[id]/route.test.ts" --reporter=verbose
# Expected: 6/6 PASS

npx tsc --noEmit
# Expected: 0 errors
```
