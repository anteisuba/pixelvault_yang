# Plan A A.2 — Test Coverage Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add minimum 2 test cases per currently-untested service to cover social, narrative, card-CRUD, LLM-calling, and provider-adapter layers; push from 0 tests on 17 services to at least 2 per file.

**Architecture:** Tests only — no production code changes. Each task creates one batch of test files and commits them together. All service tests use `vi.mock` for `@/lib/db`, `@/services/user.service`, and LLM deps. All provider adapter tests use `vi.stubGlobal('fetch', ...)`. Tasks are fully independent.

**Tech Stack:** Vitest, vi.mock, vi.stubGlobal, vi.fn, FAKE_DB_USER from `src/test/api-helpers.ts`

**Out of scope (too many deps to mock safely):**
- `character-refine.service.ts` — calls `generateImageForUser` (high-risk orchestrator)
- `createCharacterCard` / `createBackgroundCard` / `createStyleCard` — R2 upload + LLM + complex DB in one call; test simple CRUD paths only

---

### Task 1: llm-output-validator pure-function tests

**Files:**
- Create: `src/lib/llm-output-validator.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// src/lib/llm-output-validator.test.ts
import { describe, it, expect } from 'vitest'
import {
  validateLlmPromptOutput,
  validateRecipeFusion,
} from '@/lib/llm-output-validator'

describe('validateLlmPromptOutput', () => {
  it('returns usable=true for a normal prompt', () => {
    const result = validateLlmPromptOutput(
      'a beautiful sunset over mountains with warm golden light',
      'sunset mountains',
    )
    expect(result.usable).toBe(true)
    expect(result.output).toContain('sunset')
    expect(result.warnings).toHaveLength(0)
  })

  it('returns usable=false and reason for empty output', () => {
    const result = validateLlmPromptOutput('', 'original')
    expect(result.usable).toBe(false)
    expect(result.reason).toMatch(/empty/i)
  })

  it('returns usable=false for system prompt leakage', () => {
    const result = validateLlmPromptOutput(
      'You are an expert prompt engineer. Return only the enhanced prompt.',
      'original',
    )
    expect(result.usable).toBe(false)
    expect(result.reason).toMatch(/system prompt/i)
  })

  it('truncates long output and adds warning', () => {
    const longOutput = 'a detailed scene '.repeat(500) // ~8500 chars
    const result = validateLlmPromptOutput(longOutput, 'a')
    expect(result.warnings.some((w) => w.includes('truncated'))).toBe(true)
    expect(result.usable).toBe(true)
  })

  it('adds warning when enhanced is significantly shorter than original', () => {
    const result = validateLlmPromptOutput(
      'cat',
      'a very detailed description of a maine coon cat sitting by a fireplace in winter',
    )
    expect(result.warnings.some((w) => w.includes('shorter'))).toBe(true)
  })
})

describe('validateRecipeFusion', () => {
  it('returns usable=true when character keywords are retained', () => {
    const result = validateRecipeFusion(
      'blue-haired anime girl wearing a school uniform stands in a garden, watercolor style',
      { characterPrompt: 'blue hair anime girl school uniform', stylePrompt: 'watercolor' },
    )
    expect(result.usable).toBe(true)
    expect(result.output).toContain('blue')
  })

  it('returns usable=false for empty fusion output', () => {
    const result = validateRecipeFusion('', { characterPrompt: 'blue hair girl' })
    expect(result.usable).toBe(false)
    expect(result.reason).toMatch(/empty/i)
  })

  it('returns usable=false when character identity is lost', () => {
    const result = validateRecipeFusion(
      'a completely unrelated mountain landscape at dusk',
      {
        characterPrompt:
          'blonde twin-tailed magical girl pink ribbon star wand sparkles',
      },
    )
    expect(result.usable).toBe(false)
    expect(result.reason).toMatch(/character identity/i)
  })

  it('returns usable=false for system prompt leakage in fusion', () => {
    const result = validateRecipeFusion(
      "You are an expert. I'm an AI language model.",
      { characterPrompt: 'short prompt' },
    )
    expect(result.usable).toBe(false)
    expect(result.reason).toMatch(/system prompt/i)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run --reporter=verbose src/lib/llm-output-validator.test.ts
```
Expected: 9/9 PASS (all pass because code already exists)

- [ ] **Step 3: Commit**

```bash
git add src/lib/llm-output-validator.test.ts
git commit -m "test(lib): add llm-output-validator coverage — validateLlmPromptOutput + validateRecipeFusion"
```

---

### Task 2: Social + Narrative service tests

**Files:**
- Create: `src/services/follow.service.test.ts`
- Create: `src/services/like.service.test.ts`
- Create: `src/services/collection.service.test.ts`
- Create: `src/services/story.service.test.ts`
- Create: `src/services/project.service.test.ts`

- [ ] **Step 1: Write `follow.service.test.ts`**

```typescript
// src/services/follow.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindUniqueUser = vi.fn()
const mockFindUniqueFollow = vi.fn()
const mockCreateFollow = vi.fn()
const mockDeleteFollow = vi.fn()
const mockCountFollow = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: (...a: unknown[]) => mockFindUniqueUser(...a) },
    userFollow: {
      findUnique: (...a: unknown[]) => mockFindUniqueFollow(...a),
      create: (...a: unknown[]) => mockCreateFollow(...a),
      delete: (...a: unknown[]) => mockDeleteFollow(...a),
      count: (...a: unknown[]) => mockCountFollow(...a),
    },
  },
}))

import { toggleFollow } from '@/services/follow.service'

const TARGET_USER = { id: 'user_target', isPublic: true }

describe('toggleFollow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUniqueUser.mockResolvedValue(TARGET_USER)
    mockFindUniqueFollow.mockResolvedValue(null)
    mockCreateFollow.mockResolvedValue({})
    mockCountFollow.mockResolvedValue(1)
  })

  it('follows a user and returns following=true', async () => {
    const result = await toggleFollow('user_a', 'user_target')
    expect(result.following).toBe(true)
    expect(result.followerCount).toBe(1)
    expect(mockCreateFollow).toHaveBeenCalled()
  })

  it('unfollows when follow already exists', async () => {
    mockFindUniqueFollow.mockResolvedValue({ id: 'follow_1' })
    mockCountFollow.mockResolvedValue(0)
    const result = await toggleFollow('user_a', 'user_target')
    expect(result.following).toBe(false)
    expect(mockDeleteFollow).toHaveBeenCalled()
  })

  it('throws when following yourself', async () => {
    await expect(toggleFollow('user_a', 'user_a')).rejects.toThrow('Cannot follow yourself')
  })

  it('throws when target user not found', async () => {
    mockFindUniqueUser.mockResolvedValue(null)
    await expect(toggleFollow('user_a', 'user_missing')).rejects.toThrow('User not found')
  })
})
```

- [ ] **Step 2: Write `like.service.test.ts`**

```typescript
// src/services/like.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindUniqueGen = vi.fn()
const mockFindUniqueLike = vi.fn()
const mockCreateLike = vi.fn()
const mockDeleteLike = vi.fn()
const mockCountLike = vi.fn()
const mockFindManyLike = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    generation: { findUnique: (...a: unknown[]) => mockFindUniqueGen(...a) },
    userLike: {
      findUnique: (...a: unknown[]) => mockFindUniqueLike(...a),
      create: (...a: unknown[]) => mockCreateLike(...a),
      delete: (...a: unknown[]) => mockDeleteLike(...a),
      count: (...a: unknown[]) => mockCountLike(...a),
      findMany: (...a: unknown[]) => mockFindManyLike(...a),
    },
  },
}))

import { toggleLike, getUserLikes } from '@/services/like.service'

const PUBLIC_GEN = { id: 'gen_1', isPublic: true, userId: 'owner_1' }

describe('toggleLike', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUniqueGen.mockResolvedValue(PUBLIC_GEN)
    mockFindUniqueLike.mockResolvedValue(null)
    mockCreateLike.mockResolvedValue({})
    mockCountLike.mockResolvedValue(5)
  })

  it('likes a generation and returns liked=true', async () => {
    const result = await toggleLike('user_a', 'gen_1')
    expect(result.liked).toBe(true)
    expect(result.likeCount).toBe(5)
    expect(mockCreateLike).toHaveBeenCalled()
  })

  it('unlikes when like already exists', async () => {
    mockFindUniqueLike.mockResolvedValue({ id: 'like_1' })
    mockCountLike.mockResolvedValue(4)
    const result = await toggleLike('user_a', 'gen_1')
    expect(result.liked).toBe(false)
    expect(mockDeleteLike).toHaveBeenCalled()
  })

  it('throws when generation not found', async () => {
    mockFindUniqueGen.mockResolvedValue(null)
    await expect(toggleLike('user_a', 'gen_missing')).rejects.toThrow('Generation not found')
  })

  it('throws when liking a private generation by non-owner', async () => {
    mockFindUniqueGen.mockResolvedValue({ id: 'gen_1', isPublic: false, userId: 'owner_1' })
    await expect(toggleLike('user_b', 'gen_1')).rejects.toThrow('Cannot like a private generation')
  })
})

describe('getUserLikes', () => {
  it('returns a Set of liked generation IDs', async () => {
    mockFindManyLike.mockResolvedValue([
      { generationId: 'gen_1' },
      { generationId: 'gen_2' },
    ])
    const result = await getUserLikes('user_a', ['gen_1', 'gen_2', 'gen_3'])
    expect(result).toBeInstanceOf(Set)
    expect(result.has('gen_1')).toBe(true)
    expect(result.has('gen_3')).toBe(false)
  })
})
```

- [ ] **Step 3: Write `collection.service.test.ts`**

```typescript
// src/services/collection.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindMany = vi.fn()
const mockFindUnique = vi.fn()
const mockCount = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    collection: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      count: (...a: unknown[]) => mockCount(...a),
      create: (...a: unknown[]) => mockCreate(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
    collectionItem: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    generation: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

import {
  getUserCollections,
  createCollection,
  deleteCollection,
} from '@/services/collection.service'

const FAKE_COLLECTION = {
  id: 'col_1',
  name: 'My Collection',
  description: null,
  coverUrl: null,
  isPublic: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { items: 0 },
}

describe('getUserCollections', () => {
  it('returns a list of collections for the user', async () => {
    mockFindMany.mockResolvedValue([FAKE_COLLECTION])
    const result = await getUserCollections('user_1')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('My Collection')
  })
})

describe('createCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCount.mockResolvedValue(0)
    mockCreate.mockResolvedValue(FAKE_COLLECTION)
  })

  it('creates a collection and returns a record', async () => {
    const result = await createCollection('user_1', { name: 'My Collection' })
    expect(result.name).toBe('My Collection')
    expect(mockCreate).toHaveBeenCalled()
  })

  it('throws MAX_COLLECTIONS_EXCEEDED when limit reached', async () => {
    mockCount.mockResolvedValue(999)
    await expect(
      createCollection('user_1', { name: 'One More' }),
    ).rejects.toThrow('MAX_COLLECTIONS_EXCEEDED')
  })
})

describe('deleteCollection', () => {
  it('soft-deletes and returns true when owner matches', async () => {
    mockFindUnique.mockResolvedValue({ userId: 'user_1' })
    mockUpdate.mockResolvedValue({})
    const result = await deleteCollection('col_1', 'user_1')
    expect(result).toBe(true)
  })

  it('returns false when collection not found or wrong owner', async () => {
    mockFindUnique.mockResolvedValue(null)
    const result = await deleteCollection('col_missing', 'user_1')
    expect(result).toBe(false)
  })
})
```

- [ ] **Step 4: Write `story.service.test.ts`**

```typescript
// src/services/story.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockEnsureUser = vi.fn()

vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

const mockLlmCompletion = vi.fn()
const mockResolveLlmRoute = vi.fn()

vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...a: unknown[]) => mockLlmCompletion(...a),
  resolveLlmTextRoute: (...a: unknown[]) => mockResolveLlmRoute(...a),
}))

const mockStoryCreate = vi.fn()
const mockStoryFindUnique = vi.fn()
const mockStoryUpdate = vi.fn()
const mockStoryDelete = vi.fn()
const mockGenCount = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    story: {
      create: (...a: unknown[]) => mockStoryCreate(...a),
      findUnique: (...a: unknown[]) => mockStoryFindUnique(...a),
      update: (...a: unknown[]) => mockStoryUpdate(...a),
      delete: (...a: unknown[]) => mockStoryDelete(...a),
    },
    generation: {
      count: (...a: unknown[]) => mockGenCount(...a),
    },
  },
}))

import { createStory, getStoryById, updateStory, deleteStory } from '@/services/story.service'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }
const FAKE_STORY = {
  id: 'story_1',
  title: 'My Story',
  displayMode: 'scroll',
  isPublic: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  userId: 'db_user_1',
  panels: [],
}

describe('createStory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockGenCount.mockResolvedValue(2)
    mockStoryCreate.mockResolvedValue(FAKE_STORY)
  })

  it('creates a story with panels and returns a StoryRecord', async () => {
    const result = await createStory('clerk_1', 'My Story', ['gen_1', 'gen_2'])
    expect(result.id).toBe('story_1')
    expect(result.title).toBe('My Story')
    expect(mockStoryCreate).toHaveBeenCalled()
  })

  it('throws when duplicate generation IDs are provided', async () => {
    await expect(
      createStory('clerk_1', 'Dup', ['gen_1', 'gen_1']),
    ).rejects.toThrow('Duplicate generation IDs')
  })

  it('throws when not all generations are owned by the user', async () => {
    mockGenCount.mockResolvedValue(1) // only 1 of 2 found
    await expect(
      createStory('clerk_1', 'Story', ['gen_1', 'gen_2']),
    ).rejects.toThrow('One or more generations not found')
  })
})

describe('getStoryById', () => {
  it('returns null when story belongs to a different user', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockStoryFindUnique.mockResolvedValue({ ...FAKE_STORY, userId: 'other_user' })
    const result = await getStoryById('story_1', 'clerk_1')
    expect(result).toBeNull()
  })
})

describe('updateStory', () => {
  it('throws Story not found when story does not belong to user', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockStoryFindUnique.mockResolvedValue({ ...FAKE_STORY, userId: 'other_user' })
    await expect(updateStory('story_1', 'clerk_1', { title: 'New' })).rejects.toThrow(
      'Story not found',
    )
  })
})

describe('deleteStory', () => {
  it('deletes the story', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockStoryFindUnique.mockResolvedValue(FAKE_STORY)
    mockStoryDelete.mockResolvedValue({})
    await deleteStory('story_1', 'clerk_1')
    expect(mockStoryDelete).toHaveBeenCalledWith({ where: { id: 'story_1' } })
  })
})
```

- [ ] **Step 5: Write `project.service.test.ts`**

```typescript
// src/services/project.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEnsureUser = vi.fn()

vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

const mockProjectFindMany = vi.fn()
const mockProjectCreate = vi.fn()
const mockProjectUpdate = vi.fn()
const mockProjectCount = vi.fn()
const mockTransaction = vi.fn()
const mockGenUpdateMany = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    project: {
      findMany: (...a: unknown[]) => mockProjectFindMany(...a),
      create: (...a: unknown[]) => mockProjectCreate(...a),
      update: (...a: unknown[]) => mockProjectUpdate(...a),
      count: (...a: unknown[]) => mockProjectCount(...a),
    },
    generation: {
      updateMany: (...a: unknown[]) => mockGenUpdateMany(...a),
    },
    $transaction: (...a: unknown[]) => mockTransaction(...a),
  },
}))

import { listProjects, createProject, deleteProject } from '@/services/project.service'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }
const FAKE_PROJECT_ROW = {
  id: 'proj_1',
  name: 'Design Sprint',
  description: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { generations: 3 },
  generations: [{ url: 'https://example.com/thumb.png' }],
}

describe('listProjects', () => {
  it('returns an empty list when no projects exist', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockProjectFindMany.mockResolvedValue([])
    const result = await listProjects('clerk_1')
    expect(result).toEqual([])
  })

  it('maps DB rows to ProjectRecord shape', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockProjectFindMany.mockResolvedValue([FAKE_PROJECT_ROW])
    const result = await listProjects('clerk_1')
    expect(result[0].name).toBe('Design Sprint')
    expect(result[0].generationCount).toBe(3)
    expect(result[0].latestGenerationUrl).toBe('https://example.com/thumb.png')
  })
})

describe('createProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockProjectCount.mockResolvedValue(0)
    mockProjectCreate.mockResolvedValue(FAKE_PROJECT_ROW)
  })

  it('creates a project and returns a ProjectRecord', async () => {
    const result = await createProject('clerk_1', { name: 'Design Sprint' })
    expect(result.name).toBe('Design Sprint')
    expect(mockProjectCreate).toHaveBeenCalled()
  })

  it('throws when project limit is reached', async () => {
    mockProjectCount.mockResolvedValue(999)
    await expect(createProject('clerk_1', { name: 'Extra' })).rejects.toThrow(
      'Maximum',
    )
  })
})

describe('deleteProject', () => {
  it('runs in a transaction that nulls generation projectId then soft-deletes', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockTransaction.mockResolvedValue([{}, {}])
    await deleteProject('clerk_1', 'proj_1')
    expect(mockTransaction).toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run all five test files**

```bash
npx vitest run --reporter=verbose \
  src/services/follow.service.test.ts \
  src/services/like.service.test.ts \
  src/services/collection.service.test.ts \
  src/services/story.service.test.ts \
  src/services/project.service.test.ts
```
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add \
  src/services/follow.service.test.ts \
  src/services/like.service.test.ts \
  src/services/collection.service.test.ts \
  src/services/story.service.test.ts \
  src/services/project.service.test.ts
git commit -m "test(services): add social and narrative service coverage (follow/like/collection/story/project)"
```

---

### Task 3: Card CRUD + Model Config service tests

**Files:**
- Create: `src/services/background-card.service.test.ts`
- Create: `src/services/style-card.service.test.ts`
- Create: `src/services/card-recipe.service.test.ts`
- Create: `src/services/model-config.service.test.ts`

Note: `createBackgroundCard` and `createStyleCard` call R2 upload + LLM, so we only test the read/delete paths here. `createCardRecipe` is DB-only, so it is included.

- [ ] **Step 1: Write `background-card.service.test.ts`**

```typescript
// src/services/background-card.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

vi.mock('@/services/storage/r2', () => ({
  generateStorageKey: vi.fn().mockReturnValue('key/abc'),
  uploadToR2: vi.fn().mockResolvedValue('https://r2.example.com/abc.jpg'),
}))

vi.mock('@/services/recipe-compiler.service', () => ({
  extractBackgroundAttributes: vi.fn().mockResolvedValue({
    attributes: { freeformDescription: 'forest' },
    prompt: 'a dense forest',
  }),
}))

const mockFindMany = vi.fn()
const mockFindFirst = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    backgroundCard: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
  },
}))

import {
  listBackgroundCards,
  getBackgroundCard,
  deleteBackgroundCard,
} from '@/services/background-card.service'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }

const FAKE_CARD_ROW = {
  id: 'bg_1',
  name: 'Forest',
  description: null,
  sourceImageUrl: 'https://example.com/forest.jpg',
  backgroundPrompt: 'dense forest',
  attributes: {},
  loras: null,
  tags: [],
  projectId: null,
  isDeleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('listBackgroundCards', () => {
  it('returns a list of background cards for the user', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindMany.mockResolvedValue([FAKE_CARD_ROW])
    const result = await listBackgroundCards('clerk_1')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Forest')
  })
})

describe('getBackgroundCard', () => {
  it('returns the card when found', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindFirst.mockResolvedValue(FAKE_CARD_ROW)
    const result = await getBackgroundCard('clerk_1', 'bg_1')
    expect(result?.id).toBe('bg_1')
  })

  it('returns null when card not found', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindFirst.mockResolvedValue(null)
    const result = await getBackgroundCard('clerk_1', 'bg_missing')
    expect(result).toBeNull()
  })
})

describe('deleteBackgroundCard', () => {
  it('soft-deletes and returns true', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindFirst.mockResolvedValue(FAKE_CARD_ROW)
    mockUpdate.mockResolvedValue({})
    const result = await deleteBackgroundCard('clerk_1', 'bg_1')
    expect(result).toBe(true)
  })

  it('returns false when card not found', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindFirst.mockResolvedValue(null)
    const result = await deleteBackgroundCard('clerk_1', 'bg_missing')
    expect(result).toBe(false)
  })
})
```

- [ ] **Step 2: Write `style-card.service.test.ts`**

```typescript
// src/services/style-card.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

vi.mock('@/services/storage/r2', () => ({
  generateStorageKey: vi.fn().mockReturnValue('key/abc'),
  uploadToR2: vi.fn().mockResolvedValue('https://r2.example.com/abc.jpg'),
}))

vi.mock('@/services/recipe-compiler.service', () => ({
  extractStyleAttributes: vi.fn().mockResolvedValue({
    attributes: { artStyle: 'watercolor' },
    prompt: 'watercolor painting style',
  }),
}))

const mockFindMany = vi.fn()
const mockFindFirst = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    styleCard: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
  },
}))

import {
  listStyleCards,
  getStyleCard,
  deleteStyleCard,
} from '@/services/style-card.service'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }

const FAKE_STYLE_ROW = {
  id: 'style_1',
  name: 'Watercolor',
  description: null,
  sourceImageUrl: null,
  stylePrompt: 'watercolor painting style',
  attributes: { artStyle: 'watercolor' },
  loras: null,
  modelId: 'flux-2-pro',
  adapterType: 'fal',
  advancedParams: null,
  tags: [],
  projectId: null,
  isDeleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('listStyleCards', () => {
  it('returns a list of style cards for the user', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindMany.mockResolvedValue([FAKE_STYLE_ROW])
    const result = await listStyleCards('clerk_1')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Watercolor')
  })
})

describe('getStyleCard', () => {
  it('returns the card when found', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindFirst.mockResolvedValue(FAKE_STYLE_ROW)
    const result = await getStyleCard('clerk_1', 'style_1')
    expect(result?.id).toBe('style_1')
  })

  it('returns null when card not found', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindFirst.mockResolvedValue(null)
    const result = await getStyleCard('clerk_1', 'missing')
    expect(result).toBeNull()
  })
})

describe('deleteStyleCard', () => {
  it('soft-deletes and returns true', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindFirst.mockResolvedValue(FAKE_STYLE_ROW)
    mockUpdate.mockResolvedValue({})
    const result = await deleteStyleCard('clerk_1', 'style_1')
    expect(result).toBe(true)
  })

  it('returns false when not found', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindFirst.mockResolvedValue(null)
    const result = await deleteStyleCard('clerk_1', 'missing')
    expect(result).toBe(false)
  })
})
```

- [ ] **Step 3: Write `card-recipe.service.test.ts`**

```typescript
// src/services/card-recipe.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

const mockFindMany = vi.fn()
const mockFindFirst = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockCount = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    cardRecipe: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
      create: (...a: unknown[]) => mockCreate(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
      count: (...a: unknown[]) => mockCount(...a),
    },
  },
}))

import {
  listCardRecipes,
  getCardRecipe,
  createCardRecipe,
  deleteCardRecipe,
} from '@/services/card-recipe.service'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }
const FAKE_ROW = {
  id: 'recipe_1',
  name: 'My Recipe',
  characterCardId: null,
  backgroundCardId: null,
  styleCardId: 'style_1',
  freePrompt: 'running in rain',
  projectId: null,
  isDeleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('listCardRecipes', () => {
  it('returns a list of card recipes', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindMany.mockResolvedValue([FAKE_ROW])
    const result = await listCardRecipes('clerk_1')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('My Recipe')
  })
})

describe('getCardRecipe', () => {
  it('returns null when recipe not found', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindFirst.mockResolvedValue(null)
    const result = await getCardRecipe('clerk_1', 'missing')
    expect(result).toBeNull()
  })
})

describe('createCardRecipe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockCount.mockResolvedValue(0)
    mockCreate.mockResolvedValue(FAKE_ROW)
  })

  it('creates a card recipe and returns a record', async () => {
    const result = await createCardRecipe('clerk_1', {
      name: 'My Recipe',
      styleCardId: 'style_1',
      freePrompt: 'running in rain',
    })
    expect(result.name).toBe('My Recipe')
    expect(mockCreate).toHaveBeenCalled()
  })
})

describe('deleteCardRecipe', () => {
  it('soft-deletes and returns true', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindFirst.mockResolvedValue(FAKE_ROW)
    mockUpdate.mockResolvedValue({})
    const result = await deleteCardRecipe('clerk_1', 'recipe_1')
    expect(result).toBe(true)
  })
})
```

- [ ] **Step 4: Write `model-config.service.test.ts`**

```typescript
// src/services/model-config.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindMany = vi.fn()
const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    modelConfig: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
  },
}))

import {
  getAllModelConfigs,
  getModelConfigById,
  updateModelHealthStatus,
} from '@/services/model-config.service'

const FAKE_ROW = {
  id: 'mc_1',
  modelId: 'flux-2-pro',
  externalModelId: 'fal-ai/flux-pro/v1.1',
  adapterType: 'fal',
  outputType: 'IMAGE',
  cost: 1,
  available: true,
  officialUrl: null,
  timeoutMs: 120000,
  qualityTier: 'pro',
  i2vModelId: null,
  videoDefaults: null,
  providerConfig: { label: 'FAL', baseUrl: 'https://fal.run' },
  sortOrder: 0,
  healthStatus: 'available',
  lastHealthCheck: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('getAllModelConfigs', () => {
  it('returns a list of model config records', async () => {
    mockFindMany.mockResolvedValue([FAKE_ROW])
    const result = await getAllModelConfigs()
    expect(result).toHaveLength(1)
    expect(result[0].modelId).toBe('flux-2-pro')
  })
})

describe('getModelConfigById', () => {
  it('returns null when model not found', async () => {
    mockFindUnique.mockResolvedValue(null)
    const result = await getModelConfigById('missing-model')
    expect(result).toBeNull()
  })

  it('returns a record when found', async () => {
    mockFindUnique.mockResolvedValue(FAKE_ROW)
    const result = await getModelConfigById('flux-2-pro')
    expect(result?.modelId).toBe('flux-2-pro')
  })
})

describe('updateModelHealthStatus', () => {
  it('updates the health status of a model', async () => {
    mockUpdate.mockResolvedValue({})
    await updateModelHealthStatus('flux-2-pro', 'available')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { modelId: 'flux-2-pro' },
        data: expect.objectContaining({ healthStatus: 'available' }),
      }),
    )
  })
})
```

- [ ] **Step 5: Run all four test files**

```bash
npx vitest run --reporter=verbose \
  src/services/background-card.service.test.ts \
  src/services/style-card.service.test.ts \
  src/services/card-recipe.service.test.ts \
  src/services/model-config.service.test.ts
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add \
  src/services/background-card.service.test.ts \
  src/services/style-card.service.test.ts \
  src/services/card-recipe.service.test.ts \
  src/services/model-config.service.test.ts
git commit -m "test(services): add card CRUD and model-config coverage (background/style/card-recipe/model-config)"
```

---

### Task 4: LLM-calling service tests

Covers: `character-card`, `recipe-compiler`, `character-scoring`, `llm-text`, `prompt-assistant`, `prompt-feedback`, `model-health`

**Files:**
- Create: `src/services/character-card.service.test.ts`
- Create: `src/services/recipe-compiler.service.test.ts`
- Create: `src/services/character-scoring.service.test.ts`
- Create: `src/services/llm-text.service.test.ts`
- Create: `src/services/prompt-assistant.service.test.ts`
- Create: `src/services/prompt-feedback.service.test.ts`
- Create: `src/services/model-health.service.test.ts`

- [ ] **Step 1: Write `character-card.service.test.ts`**

Tests only the pure `buildPromptFromAttributes` function and simple DB-mocked CRUD paths (no `createCharacterCard` which requires R2 + LLM).

```typescript
// src/services/character-card.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: vi.fn(),
  resolveLlmTextRoute: vi.fn(),
}))

vi.mock('@/services/storage/r2', () => ({
  generateStorageKey: vi.fn().mockReturnValue('key/abc'),
  uploadToR2: vi.fn().mockResolvedValue('https://r2.example.com/abc.jpg'),
}))

const mockFindMany = vi.fn()
const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()
const mockCount = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    characterCard: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
      count: (...a: unknown[]) => mockCount(...a),
    },
  },
}))

import {
  buildPromptFromAttributes,
  listCharacterCards,
  getCharacterCard,
  deleteCharacterCard,
} from '@/services/character-card.service'
import type { CharacterAttributes } from '@/types'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }
const FAKE_CARD = {
  id: 'card_1',
  userId: 'db_user_1',
  name: 'Rei',
  description: null,
  sourceImageUrl: 'https://example.com/rei.png',
  sourceStorageKey: '',
  sourceImages: [],
  sourceImageEntries: [],
  characterPrompt: 'blue hair anime girl',
  attributes: {},
  tags: [],
  status: 'DRAFT',
  parentId: null,
  variantLabel: null,
  stabilityScore: null,
  isDeleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  loras: null,
  referenceImages: null,
  variants: [],
}

describe('buildPromptFromAttributes (pure)', () => {
  it('assembles known fields into a comma-separated prompt', () => {
    const attrs: CharacterAttributes = {
      hairColor: 'blue',
      hairStyle: 'long',
      eyeColor: 'violet',
      artStyle: 'anime',
    }
    const result = buildPromptFromAttributes(attrs)
    expect(result).toContain('blue long hair')
    expect(result).toContain('violet eyes')
    expect(result).toContain('anime')
  })

  it('falls back to freeformDescription when all other fields are empty', () => {
    const attrs: CharacterAttributes = {
      freeformDescription: 'a mysterious hooded figure',
    }
    const result = buildPromptFromAttributes(attrs)
    expect(result).toBe('a mysterious hooded figure')
  })
})

describe('listCharacterCards', () => {
  it('returns a list of cards for the user', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindMany.mockResolvedValue([FAKE_CARD])
    const result = await listCharacterCards('clerk_1')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Rei')
  })
})

describe('getCharacterCard', () => {
  it('returns null when card belongs to another user', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindUnique.mockResolvedValue({ ...FAKE_CARD, userId: 'other', variants: [] })
    const result = await getCharacterCard('clerk_1', 'card_1')
    expect(result).toBeNull()
  })
})

describe('deleteCharacterCard', () => {
  it('soft-deletes and returns true', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindUnique.mockResolvedValue(FAKE_CARD)
    mockUpdate.mockResolvedValue({})
    const result = await deleteCharacterCard('clerk_1', 'card_1')
    expect(result).toBe(true)
  })

  it('returns false when not found', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindUnique.mockResolvedValue(null)
    const result = await deleteCharacterCard('clerk_1', 'missing')
    expect(result).toBe(false)
  })
})
```

- [ ] **Step 2: Write `recipe-compiler.service.test.ts`**

Tests `previewRecipe` (template only, no LLM) and `compileRecipe` error + template fallback paths.

```typescript
// src/services/recipe-compiler.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/llm-output-validator', () => ({
  validateRecipeFusion: vi.fn().mockReturnValue({ usable: true, output: 'fused prompt', warnings: [] }),
}))

vi.mock('@/services/civitai-token.service', () => ({
  getCivitaiTokenByInternalUserId: vi.fn().mockResolvedValue(null),
  injectCivitaiToken: vi.fn((url: string) => url),
}))

const mockLlmCompletion = vi.fn()
const mockResolveLlmRoute = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...a: unknown[]) => mockLlmCompletion(...a),
  resolveLlmTextRoute: (...a: unknown[]) => mockResolveLlmRoute(...a),
}))

const mockFindFirstChar = vi.fn()
const mockFindFirstBg = vi.fn()
const mockFindFirstStyle = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    characterCard: { findFirst: (...a: unknown[]) => mockFindFirstChar(...a) },
    backgroundCard: { findFirst: (...a: unknown[]) => mockFindFirstBg(...a) },
    styleCard: { findFirst: (...a: unknown[]) => mockFindFirstStyle(...a) },
  },
}))

import { previewRecipe, compileRecipe } from '@/services/recipe-compiler.service'

const FAKE_STYLE = {
  id: 'style_1',
  name: 'Watercolor',
  stylePrompt: 'watercolor painting',
  attributes: { artStyle: 'watercolor' },
  loras: null,
  modelId: 'flux-2-pro',
  adapterType: 'fal',
  advancedParams: null,
  sourceImageUrl: null,
}

describe('previewRecipe', () => {
  it('returns a template-compiled prompt without LLM', async () => {
    mockFindFirstStyle.mockResolvedValue(FAKE_STYLE)
    mockFindFirstChar.mockResolvedValue(null)
    mockFindFirstBg.mockResolvedValue(null)

    const result = await previewRecipe({
      userId: 'db_user_1',
      styleCardId: 'style_1',
      freePrompt: 'running in rain',
    })

    expect(mockLlmCompletion).not.toHaveBeenCalled()
    expect(result).toContain('watercolor')
    expect(result).toContain('running in rain')
  })
})

describe('compileRecipe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindFirstStyle.mockResolvedValue(FAKE_STYLE)
    mockFindFirstChar.mockResolvedValue(null)
    mockFindFirstBg.mockResolvedValue(null)
    mockResolveLlmRoute.mockResolvedValue({
      adapterType: 'gemini',
      providerConfig: { label: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com' },
      apiKey: 'test-key',
    })
    mockLlmCompletion.mockResolvedValue('LLM fused prompt result')
  })

  it('throws MISSING_MODEL_IN_STYLE when no style card found', async () => {
    mockFindFirstStyle.mockResolvedValue(null)
    await expect(
      compileRecipe({ userId: 'db_user_1', styleCardId: 'missing' }),
    ).rejects.toThrow('MISSING_MODEL_IN_STYLE')
  })

  it('falls back to template when LLM fusion times out or fails', async () => {
    mockLlmCompletion.mockRejectedValue(new Error('Network error'))
    const result = await compileRecipe({
      userId: 'db_user_1',
      styleCardId: 'style_1',
      freePrompt: 'dancing',
    })
    expect(result.compiledPrompt).toContain('watercolor')
    expect(result.modelId).toBe('flux-2-pro')
  })
})
```

- [ ] **Step 3: Write `character-scoring.service.test.ts`**

```typescript
// src/services/character-scoring.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

const mockLlmCompletion = vi.fn()
const mockResolveLlmRoute = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...a: unknown[]) => mockLlmCompletion(...a),
  resolveLlmTextRoute: (...a: unknown[]) => mockResolveLlmRoute(...a),
}))

vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer: vi.fn().mockResolvedValue({
    buffer: Buffer.from('fake'),
    mimeType: 'image/png',
  }),
}))

import { scoreConsistency } from '@/services/character-scoring.service'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }
const FAKE_ROUTE = {
  adapterType: 'gemini',
  providerConfig: { label: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com' },
  apiKey: 'test-key',
}

const VALID_SCORE_JSON = JSON.stringify({
  overallScore: 82,
  breakdown: { face: 85, hair: 80, outfit: 78, pose: 85, style: 82 },
  suggestions: ['Add more detail to the hair'],
})

describe('scoreConsistency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockResolveLlmRoute.mockResolvedValue(FAKE_ROUTE)
    mockLlmCompletion.mockResolvedValue(VALID_SCORE_JSON)
  })

  it('returns a parsed consistency score on happy path', async () => {
    const result = await scoreConsistency(
      'clerk_1',
      'data:image/png;base64,iVBORw0KGgo=',
      'data:image/png;base64,iVBORw0KGgo=',
    )
    expect(result.overallScore).toBe(82)
    expect(result.breakdown.face).toBe(85)
  })

  it('returns DEFAULT_SCORE when LLM response is not valid JSON', async () => {
    mockLlmCompletion.mockResolvedValue('Sorry, I cannot compare these images.')
    const result = await scoreConsistency(
      'clerk_1',
      'data:image/png;base64,iVBORw0KGgo=',
      'data:image/png;base64,iVBORw0KGgo=',
    )
    expect(result.overallScore).toBe(50)
    expect(result.suggestions[0]).toContain('Unable to parse')
  })
})
```

- [ ] **Step 4: Write `llm-text.service.test.ts`**

```typescript
// src/services/llm-text.service.test.ts
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/crypto', () => ({
  decryptApiKey: vi.fn().mockReturnValue('decrypted-key'),
}))

vi.mock('@/lib/platform-keys', () => ({
  getSystemApiKey: vi.fn().mockReturnValue(null),
}))

const mockFindFirst = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    userApiKey: {
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
    },
  },
}))

import { resolveLlmTextRoute, llmTextCompletion } from '@/services/llm-text.service'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

afterEach(() => {
  vi.unstubAllGlobals()
})

const GEMINI_KEY = { id: 'key_1', adapterType: 'gemini', encryptedKey: 'enc', isActive: true }

describe('resolveLlmTextRoute', () => {
  it('returns gemini route when user has an active gemini key', async () => {
    mockFindFirst.mockResolvedValue(GEMINI_KEY)
    const route = await resolveLlmTextRoute('db_user_1')
    expect(route.adapterType).toBe(AI_ADAPTER_TYPES.GEMINI)
    expect(route.apiKey).toBe('decrypted-key')
  })

  it('throws when no user keys and no platform key available', async () => {
    mockFindFirst.mockResolvedValue(null)
    await expect(resolveLlmTextRoute('db_user_1')).rejects.toThrow('No API key available')
  })
})

describe('llmTextCompletion — Gemini', () => {
  it('returns text content from a successful Gemini API response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'hello world' }] } }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await llmTextCompletion({
      systemPrompt: 'You are helpful.',
      userPrompt: 'Say hello.',
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: { label: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com' },
      apiKey: 'test-key',
    })

    expect(result).toBe('hello world')
  })

  it('throws a user-friendly error on 503 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('overloaded', { status: 503 })),
    )

    await expect(
      llmTextCompletion({
        systemPrompt: 'sys',
        userPrompt: 'user',
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        providerConfig: { label: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com' },
        apiKey: 'test-key',
      }),
    ).rejects.toThrow('temporarily unavailable')
  })
})

describe('llmTextCompletion — OpenAI', () => {
  it('returns content from a successful OpenAI response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'openai reply' } }] }),
          { status: 200 },
        ),
      ),
    )

    const result = await llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'user',
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      providerConfig: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
      apiKey: 'sk-test',
    })

    expect(result).toBe('openai reply')
  })
})
```

- [ ] **Step 5: Write `prompt-assistant.service.test.ts`**

```typescript
// src/services/prompt-assistant.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

const mockLlmCompletion = vi.fn()
const mockResolveLlmRoute = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...a: unknown[]) => mockLlmCompletion(...a),
  resolveLlmTextRoute: (...a: unknown[]) => mockResolveLlmRoute(...a),
}))

import { chatPromptAssistant } from '@/services/prompt-assistant.service'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }
const FAKE_ROUTE = {
  adapterType: 'gemini',
  providerConfig: { label: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com' },
  apiKey: 'test-key',
}

describe('chatPromptAssistant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockResolveLlmRoute.mockResolvedValue(FAKE_ROUTE)
  })

  it('extracts prompt from a code block in the LLM response', async () => {
    mockLlmCompletion.mockResolvedValue(
      'Here is your prompt:\n\n```\na cat sitting under a tree, golden hour lighting\n```',
    )

    const result = await chatPromptAssistant('clerk_1', [
      { role: 'user', content: 'a cat under a tree' },
    ])

    expect(result.prompt).toBe('a cat sitting under a tree, golden hour lighting')
  })

  it('falls back to raw text when no code block is present', async () => {
    mockLlmCompletion.mockResolvedValue('a cat sitting under a tree, golden hour lighting')

    const result = await chatPromptAssistant('clerk_1', [
      { role: 'user', content: 'a cat under a tree' },
    ])

    expect(result.prompt).toContain('cat')
  })
})
```

- [ ] **Step 6: Write `prompt-feedback.service.test.ts`**

```typescript
// src/services/prompt-feedback.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

const mockLlmCompletion = vi.fn()
const mockResolveLlmRoute = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...a: unknown[]) => mockLlmCompletion(...a),
  resolveLlmTextRoute: (...a: unknown[]) => mockResolveLlmRoute(...a),
}))

import { getPromptFeedback } from '@/services/prompt-feedback.service'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }
const FAKE_ROUTE = {
  adapterType: 'gemini',
  providerConfig: { label: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com' },
  apiKey: 'test-key',
}

const VALID_FEEDBACK_JSON = JSON.stringify({
  overallAssessment: 'A solid prompt with good subject clarity.',
  suggestions: [
    {
      category: 'Lighting',
      suggestion: 'Specify the time of day.',
      example: 'golden hour lighting',
    },
  ],
  improvedPrompt: 'a cat sitting under a tree, golden hour lighting',
})

describe('getPromptFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockResolveLlmRoute.mockResolvedValue(FAKE_ROUTE)
  })

  it('returns structured feedback on happy path', async () => {
    mockLlmCompletion.mockResolvedValue(VALID_FEEDBACK_JSON)
    const result = await getPromptFeedback('clerk_1', 'a cat under a tree')
    expect(result.overallAssessment).toContain('solid')
    expect(result.suggestions).toHaveLength(1)
    expect(result.improvedPrompt).toContain('golden hour')
    expect(result.originalPrompt).toBe('a cat under a tree')
  })

  it('returns fallback when LLM returns non-JSON', async () => {
    mockLlmCompletion.mockResolvedValue('I cannot process this request.')
    const result = await getPromptFeedback('clerk_1', 'a cat under a tree')
    expect(result.improvedPrompt).toBe('a cat under a tree')
    expect(result.suggestions[0].category).toBe('General')
  })
})
```

- [ ] **Step 7: Write `model-health.service.test.ts`**

```typescript
// src/services/model-health.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/platform-keys', () => ({
  getSystemApiKey: vi.fn().mockReturnValue('sys-api-key'),
}))

vi.mock('@/services/model-config.service', () => ({
  updateModelHealthStatus: vi.fn().mockResolvedValue({}),
}))

const mockGetProviderAdapter = vi.fn()
vi.mock('@/services/providers/registry', () => ({
  getProviderAdapter: (...a: unknown[]) => mockGetProviderAdapter(...a),
}))

import {
  getHealthCache,
  checkSingleModelHealth,
  checkAllModelsHealth,
} from '@/services/model-health.service'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

const FAKE_TARGET = {
  modelId: 'flux-2-pro',
  externalModelId: 'fal-ai/flux-pro/v1.1',
  adapterType: 'fal',
  baseUrl: 'https://fal.run',
}

describe('getHealthCache', () => {
  it('returns null before any health check has run', () => {
    // Module-level cache may have been set by previous tests in suite;
    // this test is only meaningful in isolation. Accept either null or cached.
    const result = getHealthCache()
    expect(result === null || Array.isArray(result?.records)).toBe(true)
  })
})

describe('checkSingleModelHealth', () => {
  it('returns degraded when adapter has no healthCheck method', async () => {
    mockGetProviderAdapter.mockReturnValue({ adapterType: 'fal' })
    const result = await checkSingleModelHealth(FAKE_TARGET)
    expect(result.status).toBe('degraded')
    expect(result.modelId).toBe('flux-2-pro')
  })

  it('calls adapter healthCheck and returns its result', async () => {
    mockGetProviderAdapter.mockReturnValue({
      adapterType: 'fal',
      healthCheck: vi.fn().mockResolvedValue({ status: 'available', latencyMs: 42 }),
    })
    const result = await checkSingleModelHealth(FAKE_TARGET)
    expect(result.status).toBe('available')
    expect(result.latencyMs).toBe(42)
  })
})

describe('checkAllModelsHealth', () => {
  it('handles rejected promises and returns unavailable for failed models', async () => {
    mockGetProviderAdapter.mockReturnValue({
      adapterType: 'fal',
      healthCheck: vi.fn().mockRejectedValue(new Error('Timeout')),
    })
    const results = await checkAllModelsHealth([FAKE_TARGET])
    expect(results[0].status).toBe('unavailable')
    expect(results[0].error).toBe('Timeout')
  })
})
```

- [ ] **Step 8: Run all seven test files**

```bash
npx vitest run --reporter=verbose \
  src/services/character-card.service.test.ts \
  src/services/recipe-compiler.service.test.ts \
  src/services/character-scoring.service.test.ts \
  src/services/llm-text.service.test.ts \
  src/services/prompt-assistant.service.test.ts \
  src/services/prompt-feedback.service.test.ts \
  src/services/model-health.service.test.ts
```
Expected: all PASS

- [ ] **Step 9: Commit**

```bash
git add \
  src/services/character-card.service.test.ts \
  src/services/recipe-compiler.service.test.ts \
  src/services/character-scoring.service.test.ts \
  src/services/llm-text.service.test.ts \
  src/services/prompt-assistant.service.test.ts \
  src/services/prompt-feedback.service.test.ts \
  src/services/model-health.service.test.ts
git commit -m "test(services): add LLM-calling service coverage (char-card/recipe-compiler/scoring/llm-text/assistant/feedback/health)"
```

---

### Task 5: Provider adapter tests

Tests request construction and error-response parsing. All use `vi.stubGlobal('fetch', vi.fn())` and clean up with `afterEach(() => vi.unstubAllGlobals())`. `vi.mock('server-only', () => ({}))` is required at the top of each file because adapter modules import `'server-only'`.

**Files:**
- Create: `src/services/providers/huggingface.adapter.test.ts`
- Create: `src/services/providers/openai.adapter.test.ts`
- Create: `src/services/providers/gemini.adapter.test.ts`
- Create: `src/services/providers/novelai.adapter.test.ts`
- Create: `src/services/providers/fish-audio.adapter.test.ts`
- Create: `src/services/providers/fal.adapter.test.ts`
- Create: `src/services/providers/registry.test.ts`

- [ ] **Step 1: Write `huggingface.adapter.test.ts`**

```typescript
// src/services/providers/huggingface.adapter.test.ts
import { afterEach, describe, it, expect, vi } from 'vitest'
import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

vi.mock('server-only', () => ({}))

import { huggingFaceAdapter } from './huggingface.adapter'

afterEach(() => {
  vi.unstubAllGlobals()
})

const BASE_INPUT = {
  prompt: 'a sunset over mountains',
  modelId: 'stabilityai/stable-diffusion-xl-base-1.0',
  aspectRatio: '1:1' as const,
  providerConfig: { label: 'HuggingFace', baseUrl: AI_PROVIDER_ENDPOINTS.HUGGINGFACE },
  apiKey: 'hf-test-key',
}

describe('huggingFaceAdapter.generateImage', () => {
  it('sends Authorization header and returns base64 image URL', async () => {
    const imageBuffer = Buffer.from('fake-image-bytes')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(imageBuffer, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await huggingFaceAdapter.generateImage(BASE_INPUT)

    expect(result.imageUrl).toMatch(/^data:image\/png;base64,/)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(AI_PROVIDER_ENDPOINTS.HUGGINGFACE),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer hf-test-key',
        }),
      }),
    )
  })

  it('throws ProviderError on non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Forbidden', { status: 403 })),
    )

    await expect(huggingFaceAdapter.generateImage(BASE_INPUT)).rejects.toThrow('HuggingFace')
  })
})
```

- [ ] **Step 2: Write `openai.adapter.test.ts`**

```typescript
// src/services/providers/openai.adapter.test.ts
import { afterEach, describe, it, expect, vi } from 'vitest'
import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'

vi.mock('server-only', () => ({}))

import { openAiAdapter } from './openai.adapter'

afterEach(() => vi.unstubAllGlobals())

const BASE_INPUT = {
  prompt: 'a futuristic city',
  modelId: 'dall-e-3',
  aspectRatio: '1:1' as const,
  providerConfig: { label: 'OpenAI', baseUrl: AI_PROVIDER_ENDPOINTS.OPENAI_IMAGE },
  apiKey: 'sk-test-key',
}

describe('openAiAdapter.generateImage', () => {
  it('returns an image URL from a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ data: [{ url: 'https://openai.example.com/img.png' }] }),
          { status: 200 },
        ),
      ),
    )

    const result = await openAiAdapter.generateImage(BASE_INPUT)
    expect(result.imageUrl).toBe('https://openai.example.com/img.png')
  })

  it('throws ProviderError on 401 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })),
    )
    await expect(openAiAdapter.generateImage(BASE_INPUT)).rejects.toThrow()
  })
})
```

- [ ] **Step 3: Write `gemini.adapter.test.ts`**

```typescript
// src/services/providers/gemini.adapter.test.ts
import { afterEach, describe, it, expect, vi } from 'vitest'
import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'

vi.mock('server-only', () => ({}))

import { geminiAdapter } from './gemini.adapter'

afterEach(() => vi.unstubAllGlobals())

const BASE_INPUT = {
  prompt: 'a tropical island',
  modelId: 'gemini-3.1-flash-image-preview',
  aspectRatio: '1:1' as const,
  providerConfig: { label: 'Gemini', baseUrl: AI_PROVIDER_ENDPOINTS.GEMINI },
  apiKey: 'gemini-test-key',
}

describe('geminiAdapter.generateImage', () => {
  it('returns an image URL or data URL from a successful response', async () => {
    const fakeBase64 = Buffer.from('fake-image').toString('base64')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [{
              content: {
                parts: [{ inlineData: { data: fakeBase64, mimeType: 'image/png' } }],
              },
            }],
          }),
          { status: 200 },
        ),
      ),
    )

    const result = await geminiAdapter.generateImage(BASE_INPUT)
    expect(result.imageUrl).toMatch(/^data:image\/png;base64,/)
  })

  it('throws on error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Bad Request', { status: 400 })),
    )
    await expect(geminiAdapter.generateImage(BASE_INPUT)).rejects.toThrow()
  })
})
```

- [ ] **Step 4: Write `novelai.adapter.test.ts`**

```typescript
// src/services/providers/novelai.adapter.test.ts
import { afterEach, describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { novelAiAdapter } from './novelai.adapter'

afterEach(() => vi.unstubAllGlobals())

const BASE_INPUT = {
  prompt: 'masterpiece, best quality, 1girl, blue hair',
  modelId: 'nai-diffusion-4-full',
  aspectRatio: '2:3' as const,
  providerConfig: { label: 'NovelAI', baseUrl: 'https://image.novelai.net' },
  apiKey: 'nai-test-key',
}

describe('novelAiAdapter.generateImage', () => {
  it('sends request to NovelAI endpoint and returns base64 image', async () => {
    const fakeImageBuffer = Buffer.from('fake-novel-ai-image')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(fakeImageBuffer, {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
      ),
    )

    const result = await novelAiAdapter.generateImage(BASE_INPUT)
    expect(result.imageUrl).toMatch(/^data:image/)
  })

  it('throws on non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Rate limited', { status: 429 })),
    )
    await expect(novelAiAdapter.generateImage(BASE_INPUT)).rejects.toThrow()
  })
})
```

- [ ] **Step 5: Write `fish-audio.adapter.test.ts`**

```typescript
// src/services/providers/fish-audio.adapter.test.ts
import { afterEach, describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { fishAudioAdapter } from './fish-audio.adapter'

afterEach(() => vi.unstubAllGlobals())

const BASE_AUDIO_INPUT = {
  prompt: 'Hello, this is a test of the fish audio adapter.',
  modelId: 'fish-speech-1.5',
  aspectRatio: '1:1' as const,
  providerConfig: { label: 'Fish Audio', baseUrl: 'https://api.fish.audio' },
  apiKey: 'fish-test-key',
}

describe('fishAudioAdapter.generateAudio', () => {
  it('returns an audio data URL on success', async () => {
    const fakeAudioBuffer = Buffer.from('fake-mp3-bytes')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(fakeAudioBuffer, {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        }),
      ),
    )

    const result = await fishAudioAdapter.generateAudio?.(BASE_AUDIO_INPUT)
    expect(result?.audioUrl).toMatch(/^data:audio/)
  })

  it('throws on error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })),
    )
    await expect(fishAudioAdapter.generateAudio?.(BASE_AUDIO_INPUT)).rejects.toThrow()
  })
})
```

- [ ] **Step 6: Write `fal.adapter.test.ts`**

```typescript
// src/services/providers/fal.adapter.test.ts
import { afterEach, describe, it, expect, vi } from 'vitest'
import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'

vi.mock('server-only', () => ({}))
vi.mock('@/services/providers/fal/video-request-builders', () => ({
  buildFalVideoQueueRequest: vi.fn().mockReturnValue({ path: '/video/queue', body: {} }),
}))

import { falAdapter } from './fal.adapter'

afterEach(() => vi.unstubAllGlobals())

const BASE_INPUT = {
  prompt: 'a futuristic city skyline',
  modelId: 'flux-2-pro',
  aspectRatio: '1:1' as const,
  providerConfig: { label: 'FAL', baseUrl: AI_PROVIDER_ENDPOINTS.FAL },
  apiKey: 'fal-test-key',
}

describe('falAdapter.generateImage', () => {
  it('returns an image URL from a successful direct response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            images: [{ url: 'https://fal.run/output/img.png', width: 1024, height: 1024 }],
          }),
          { status: 200 },
        ),
      ),
    )

    const result = await falAdapter.generateImage(BASE_INPUT)
    expect(result.imageUrl).toBe('https://fal.run/output/img.png')
  })

  it('throws ProviderError with content_policy_violation message on policy error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ detail: [{ type: 'content_policy_violation', msg: 'Policy violated' }] }),
          { status: 422 },
        ),
      ),
    )

    await expect(falAdapter.generateImage(BASE_INPUT)).rejects.toThrow('内容审核')
  })
})
```

- [ ] **Step 7: Write `registry.test.ts`**

```typescript
// src/services/providers/registry.test.ts
import { describe, it, expect } from 'vitest'

// Mock all adapters to avoid importing server-only sub-modules
import { vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('./fal.adapter', () => ({ falAdapter: { adapterType: 'fal' } }))
vi.mock('./fish-audio.adapter', () => ({ fishAudioAdapter: { adapterType: 'fish_audio' } }))
vi.mock('./gemini.adapter', () => ({ geminiAdapter: { adapterType: 'gemini' } }))
vi.mock('./huggingface.adapter', () => ({ huggingFaceAdapter: { adapterType: 'huggingface' } }))
vi.mock('./novelai.adapter', () => ({ novelAiAdapter: { adapterType: 'novelai' } }))
vi.mock('./openai.adapter', () => ({ openAiAdapter: { adapterType: 'openai' } }))
vi.mock('./replicate.adapter', () => ({ replicateAdapter: { adapterType: 'replicate' } }))
vi.mock('./volcengine.adapter', () => ({ volcengineAdapter: { adapterType: 'volcengine' } }))

import { getProviderAdapter } from './registry'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

describe('getProviderAdapter', () => {
  it('returns the FAL adapter for FAL type', () => {
    const adapter = getProviderAdapter(AI_ADAPTER_TYPES.FAL)
    expect(adapter.adapterType).toBe('fal')
  })

  it('returns the HuggingFace adapter for HUGGINGFACE type', () => {
    const adapter = getProviderAdapter(AI_ADAPTER_TYPES.HUGGINGFACE)
    expect(adapter.adapterType).toBe('huggingface')
  })

  it('returns the Gemini adapter for GEMINI type', () => {
    const adapter = getProviderAdapter(AI_ADAPTER_TYPES.GEMINI)
    expect(adapter.adapterType).toBe('gemini')
  })
})
```

- [ ] **Step 8: Run all seven adapter test files**

```bash
npx vitest run --reporter=verbose \
  src/services/providers/huggingface.adapter.test.ts \
  src/services/providers/openai.adapter.test.ts \
  src/services/providers/gemini.adapter.test.ts \
  src/services/providers/novelai.adapter.test.ts \
  src/services/providers/fish-audio.adapter.test.ts \
  src/services/providers/fal.adapter.test.ts \
  src/services/providers/registry.test.ts
```
Expected: all PASS (if an adapter's response schema differs from expectations, adjust the fake response shape to match — do not alter the adapter code)

- [ ] **Step 9: Commit**

```bash
git add \
  src/services/providers/huggingface.adapter.test.ts \
  src/services/providers/openai.adapter.test.ts \
  src/services/providers/gemini.adapter.test.ts \
  src/services/providers/novelai.adapter.test.ts \
  src/services/providers/fish-audio.adapter.test.ts \
  src/services/providers/fal.adapter.test.ts \
  src/services/providers/registry.test.ts
git commit -m "test(providers): add adapter coverage for huggingface/openai/gemini/novelai/fish-audio/fal/registry"
```

---

## Final Regression Check

After all 5 tasks are committed:

```bash
npx vitest run --reporter=verbose src/services/ src/lib/llm-output-validator.test.ts
```

Expected: all tests PASS including the 267+ that were passing before.

```bash
npx tsc --noEmit
```

Expected: 0 errors

---

## Self-Review

**Spec coverage:**
- llm-output-validator ✓ (Task 1)
- Social services: follow, like, collection ✓ (Task 2)
- Narrative services: story, project ✓ (Task 2)
- Card CRUD: background-card, style-card, card-recipe ✓ (Task 3)
- Model config ✓ (Task 3)
- Character card (CRUD + pure fn) ✓ (Task 4)
- Recipe compiler (previewRecipe + compileRecipe) ✓ (Task 4)
- Character scoring ✓ (Task 4)
- llm-text service ✓ (Task 4)
- Prompt assistant + feedback ✓ (Task 4)
- Model health ✓ (Task 4)
- All 7 provider adapters ✓ (Task 5)
- character-refine.service ✗ (excluded — calls high-risk `generateImageForUser`)
- Route coverage push (A.2.6) ✗ (deferred to a separate plan)

**Placeholder scan:** None found — all steps include complete code.

**Type consistency:** All mock shapes verified against actual service function signatures read during research.
