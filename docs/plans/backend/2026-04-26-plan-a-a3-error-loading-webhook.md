# Plan A A.3 — Error/Loading 边界 + Clerk Webhook 扩展 + 术语统一

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 5 条路由的缺失 `loading.tsx` / `error.tsx`；扩展 Clerk webhook 支持 `user.updated` 和 `user.deleted`；统一"生成次数"文案三语为 requests/生成次数/リクエスト（现状 en/zh/ja 已是这套，无需改动）。

**现状盘点（已确认）：**

| 路由 | loading.tsx | error.tsx |
|------|-------------|-----------|
| `(main)/gallery/` | ✅ 已有 | ✅ 已有 |
| `(main)/arena/` | ❌ 缺失 | ✅ 已有 |
| `(main)/profile/` | ✅ 已有 | ❌ 缺失 |
| `(main)/studio/` | ❌ 缺失 | ❌ 缺失 |
| `(main)/storyboard/` | ❌ 缺失 | ❌ 缺失 |
| `(main)/u/[username]/` | ❌ 缺失 | ❌ 缺失 |

**A.3.3 术语结论（直接关闭）：**
`Common.creditCount` 在三语文件里已分别是 "# request(s)" / "{count} 次请求" / "{count} リクエスト"，文案已正确。`ImageCard.tsx`、`ImageDetailModal.tsx`、`ModelSelector.tsx`、`StudioQuickRouteSelector.tsx` 均使用 `tCommon('creditCount', { count: ... })` 取值，无硬编码展示文字。**A.3.3 不需要代码改动，直接关闭。**

**模板来源：**
- `error.tsx` 模板：`src/app/[locale]/(main)/error.tsx`（AlertTriangle + Sentry + Retry + Home 三元素）
- `loading.tsx` 模板：`src/app/[locale]/(main)/gallery/loading.tsx`（Skeleton 网格）

**架构约定：**
- 所有 `loading.tsx` 无需 `'use client'`，纯 Skeleton 静态组件
- 所有 `error.tsx` 需要 `'use client'`，使用 `Sentry.captureException` + `useTranslations('ErrorBoundary')`
- Home 按钮的 `href` 用各页面对应的 `ROUTES.*` 常量，不硬编码路径
- Clerk webhook 新 handler 调用已有 service 函数：`syncUserFromClerk`（user.updated）+ 新建 `softDeleteUser`（user.deleted）

---

### Task 1：补齐 5 条路由的 loading.tsx / error.tsx（共 8 个文件）

**Files to create:**
- `src/app/[locale]/(main)/studio/loading.tsx`
- `src/app/[locale]/(main)/studio/error.tsx`
- `src/app/[locale]/(main)/storyboard/loading.tsx`
- `src/app/[locale]/(main)/storyboard/error.tsx`
- `src/app/[locale]/(main)/u/[username]/loading.tsx`
- `src/app/[locale]/(main)/u/[username]/error.tsx`
- `src/app/[locale]/(main)/arena/loading.tsx`
- `src/app/[locale]/(main)/profile/error.tsx`

- [ ] **Step 1：确认 ROUTES 常量**

运行：
```bash
grep -n "STUDIO\|STORYBOARD\|ARENA\|PROFILE\|GALLERY" src/constants/routes.ts
```
记录各路由对应的 `ROUTES.*` key，后续 error.tsx 的 Home 按钮使用。

- [ ] **Step 2：创建所有 loading.tsx 文件（5 个）**

**`src/app/[locale]/(main)/studio/loading.tsx`**
```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function StudioLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
      {/* Sidebar skeleton */}
      <div className="w-64 shrink-0 space-y-3">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
      {/* Canvas skeleton */}
      <div className="flex flex-1 flex-col gap-3">
        <Skeleton className="flex-1 rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </div>
  )
}
```

**`src/app/[locale]/(main)/storyboard/loading.tsx`**
```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function StoryboardLoading() {
  return (
    <div className="mx-auto max-w-content px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 space-y-3">
        <Skeleton className="h-8 w-48 rounded-2xl" />
        <Skeleton className="h-5 w-72 rounded-xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
```

**`src/app/[locale]/(main)/u/[username]/loading.tsx`**
```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function CreatorProfileLoading() {
  return (
    <div className="mx-auto max-w-content px-4 py-8 sm:px-6 lg:px-8">
      {/* Profile header skeleton */}
      <div className="mb-8 flex items-center gap-4">
        <Skeleton className="size-20 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-40 rounded-xl" />
          <Skeleton className="h-4 w-24 rounded-lg" />
        </div>
      </div>
      {/* Grid skeleton */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
```

**`src/app/[locale]/(main)/arena/loading.tsx`**
```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function ArenaLoading() {
  return (
    <div className="mx-auto max-w-content px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 space-y-3">
        <Skeleton className="h-8 w-32 rounded-2xl" />
        <Skeleton className="h-5 w-64 rounded-xl" />
      </div>
      {/* Two-column compare skeleton */}
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="aspect-square rounded-2xl" />
        <Skeleton className="aspect-square rounded-2xl" />
      </div>
    </div>
  )
}
```

**`src/app/[locale]/(main)/profile/error.tsx` — 已有 loading，补 error：**
（同 gallery/error.tsx 模板，Home 按钮指向 `ROUTES.PROFILE` 或 `ROUTES.HOME`）

- [ ] **Step 3：创建所有 error.tsx 文件（4 个）**

所有 error.tsx 使用 `(main)/error.tsx` 的结构（`'use client'` + Sentry + AlertTriangle + Retry + Home）。
唯一差异是 Home 按钮的 `href`：

| 文件 | href |
|------|------|
| `studio/error.tsx` | `ROUTES.STUDIO`（若无则 `ROUTES.HOME`） |
| `storyboard/error.tsx` | `ROUTES.STORYBOARD`（若无则 `ROUTES.HOME`） |
| `u/[username]/error.tsx` | `ROUTES.HOME` |
| `profile/error.tsx` | `ROUTES.PROFILE`（若无则 `ROUTES.HOME`） |

运行 Step 1 的 grep 确认 ROUTES 常量名称后填入正确值。

**error.tsx 通用模板：**
```tsx
'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { AlertTriangle, Home, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function <PageName>ErrorPage({ error, reset }: ErrorPageProps) {
  const t = useTranslations('ErrorBoundary')

  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="editorial-page">
      <div className="editorial-container">
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 text-center">
          <span className="rounded-2xl bg-destructive/10 p-4 text-destructive">
            <AlertTriangle className="size-8" />
          </span>
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-medium tracking-tight">
              {t('title')}
            </h1>
            <p className="max-w-md font-serif text-sm leading-6 text-muted-foreground">
              {t('description')}
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={reset} className="rounded-full">
              <RotateCcw className="size-4" />
              {t('retry')}
            </Button>
            <Button asChild className="rounded-full">
              <a href={ROUTES.<ROUTE_CONSTANT>}>
                <Home className="size-4" />
                {t('home')}
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4：TypeScript 检查**
```bash
npx tsc --noEmit
```

- [ ] **Step 5：Commit**
```bash
git add \
  src/app/\[locale\]/\(main\)/studio/loading.tsx \
  src/app/\[locale\]/\(main\)/studio/error.tsx \
  src/app/\[locale\]/\(main\)/storyboard/loading.tsx \
  src/app/\[locale\]/\(main\)/storyboard/error.tsx \
  "src/app/[locale]/(main)/u/[username]/loading.tsx" \
  "src/app/[locale]/(main)/u/[username]/error.tsx" \
  src/app/\[locale\]/\(main\)/arena/loading.tsx \
  src/app/\[locale\]/\(main\)/profile/error.tsx
git commit -m "fix(a3.1): add missing loading.tsx and error.tsx for studio/storyboard/arena/profile/u routes"
```

---

### Task 2：Clerk webhook 扩展（user.updated + user.deleted）

**Files:**
- Edit: `src/services/user.service.ts`（新增 `softDeleteUser`）
- Edit: `src/app/api/webhooks/clerk/route.ts`（新增两个事件 handler）
- Create: `src/app/api/webhooks/clerk/route.test.ts`（新建测试）

- [ ] **Step 1：写测试文件**

```typescript
// src/app/api/webhooks/clerk/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))
vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(() => ({
    verify: vi.fn(),
  })),
}))
vi.mock('@/services/user.service', () => ({
  createUser: vi.fn(),
  syncUserFromClerk: vi.fn(),
  softDeleteUser: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { POST } from './route'
import { headers } from 'next/headers'
import { Webhook } from 'svix'
import { createUser, syncUserFromClerk, softDeleteUser } from '@/services/user.service'

// Helper: build a minimal fake Request with svix headers
function makeFakeRequest(body: object) {
  return new NextRequest('http://localhost/api/webhooks/clerk', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
  })
}

const VALID_SVIX_HEADERS = {
  'svix-id': 'msg_test',
  'svix-timestamp': String(Math.floor(Date.now() / 1000)),
  'svix-signature': 'v1,fake-sig',
}

function mockHeaders(extra: Record<string, string> = {}) {
  const map = { ...VALID_SVIX_HEADERS, ...extra }
  ;(headers as ReturnType<typeof vi.fn>).mockResolvedValue({
    get: (key: string) => map[key] ?? null,
  })
}

function mockWebhookVerify(result: object) {
  const instance = { verify: vi.fn().mockReturnValue(result) }
  ;(Webhook as ReturnType<typeof vi.fn>).mockImplementation(() => instance)
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CLERK_WEBHOOK_SECRET = 'test-secret'
})

describe('POST /api/webhooks/clerk', () => {
  it('returns 400 when svix headers are missing', async () => {
    ;(headers as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: () => null,
    })

    const res = await POST(makeFakeRequest({}))

    expect(res.status).toBe(400)
  })

  it('handles user.created and calls createUser', async () => {
    mockHeaders()
    mockWebhookVerify({
      type: 'user.created',
      data: {
        id: 'clerk_abc',
        email_addresses: [{ email_address: 'test@example.com' }],
        first_name: 'Test',
        last_name: 'User',
        image_url: null,
        username: null,
      },
    })

    const res = await POST(makeFakeRequest({}))

    expect(res.status).toBe(200)
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ clerkId: 'clerk_abc', email: 'test@example.com' }),
    )
  })

  it('handles user.updated and calls syncUserFromClerk', async () => {
    mockHeaders()
    mockWebhookVerify({
      type: 'user.updated',
      data: {
        id: 'clerk_abc',
        first_name: 'Updated',
        last_name: 'Name',
        image_url: 'https://example.com/avatar.jpg',
        username: 'updateduser',
      },
    })

    const res = await POST(makeFakeRequest({}))

    expect(res.status).toBe(200)
    expect(syncUserFromClerk).toHaveBeenCalledWith(
      'clerk_abc',
      expect.objectContaining({ displayName: 'Updated Name' }),
    )
  })

  it('handles user.deleted and calls softDeleteUser', async () => {
    mockHeaders()
    mockWebhookVerify({
      type: 'user.deleted',
      data: { id: 'clerk_abc', deleted: true },
    })

    const res = await POST(makeFakeRequest({}))

    expect(res.status).toBe(200)
    expect(softDeleteUser).toHaveBeenCalledWith('clerk_abc')
  })

  it('returns 200 and ignores unknown event types', async () => {
    mockHeaders()
    mockWebhookVerify({ type: 'session.created', data: {} })

    const res = await POST(makeFakeRequest({}))

    expect(res.status).toBe(200)
    expect(createUser).not.toHaveBeenCalled()
    expect(syncUserFromClerk).not.toHaveBeenCalled()
    expect(softDeleteUser).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2：运行测试——期待 FAIL**
```bash
npx vitest run src/app/api/webhooks/clerk/route.test.ts --reporter=verbose
```

- [ ] **Step 3：在 user.service.ts 末尾新增 `softDeleteUser`**

```typescript
export async function softDeleteUser(clerkId: string): Promise<void> {
  const user = await db.user.findUnique({ where: { clerkId } })
  if (!user) {
    logger.warn({ clerkId }, 'softDeleteUser: user not found, skipping')
    return
  }
  await db.user.update({
    where: { id: user.id },
    data: { isDeleted: true },
  })
  logger.info({ clerkId, userId: user.id }, 'User soft-deleted via Clerk webhook')
}
```

> **注意**：先用 `grep -n "isDeleted" prisma/schema.prisma` 确认 User 表有 `isDeleted` 字段。
> 若无该字段，改为 `deletedAt: new Date()`（同样先确认字段名）。

- [ ] **Step 4：扩展 `src/app/api/webhooks/clerk/route.ts`**

在文件顶部 import 区域，扩展 service 引用：
```typescript
import { createUser, syncUserFromClerk, softDeleteUser } from '@/services/user.service'
import { logger } from '@/lib/logger'
```

扩展 `ClerkUserCreatedData` 接口（或新增独立接口），加入 `user.updated` 和 `user.deleted` 所需字段：

```typescript
interface ClerkUserData {
  id: string
  email_addresses?: ClerkEmailAddress[]
  first_name?: string | null
  last_name?: string | null
  image_url?: string | null
  username?: string | null
  deleted?: boolean
}

interface ClerkWebhookEvent {
  type: string
  data: ClerkUserData
}
```

把现有的 `if (event.type === 'user.created')` 扩展为完整的事件路由：

```typescript
  // 3. Route by event type
  if (event.type === 'user.created') {
    const { id, email_addresses, first_name, last_name, image_url, username } = event.data
    const email = email_addresses?.[0]?.email_address

    if (!email) {
      return new Response('No email address on user', { status: 400 })
    }

    const displayName = [first_name, last_name].filter(Boolean).join(' ') || null
    await createUser({ clerkId: id, email, displayName: displayName ?? undefined, avatarUrl: image_url ?? undefined, username: username ?? undefined })
    logger.info({ clerkId: id }, 'User created via Clerk webhook')

  } else if (event.type === 'user.updated') {
    const { id, first_name, last_name, image_url, username } = event.data
    const displayName = [first_name, last_name].filter(Boolean).join(' ') || null

    await syncUserFromClerk(id, {
      displayName,
      avatarUrl: image_url ?? null,
      username: username ?? null,
    })
    logger.info({ clerkId: id }, 'User synced via Clerk webhook')

  } else if (event.type === 'user.deleted') {
    const { id } = event.data
    await softDeleteUser(id)

  } else {
    logger.info({ eventType: event.type }, 'Unhandled Clerk webhook event — ignored')
  }
```

> **注意**：检查 `createUser` 函数签名（`src/services/user.service.ts` L145），确认接受哪些参数。若不接受 `displayName`/`avatarUrl`/`username`，只传已有的 `{ clerkId, email }`，将可选字段扩展留到后续单独 PR。

- [ ] **Step 5：运行测试——期待 PASS**
```bash
npx vitest run src/app/api/webhooks/clerk/route.test.ts --reporter=verbose
```

- [ ] **Step 6：全量回归**
```bash
npx vitest run --reporter=verbose
npx tsc --noEmit
```

- [ ] **Step 7：Commit**
```bash
git add \
  src/services/user.service.ts \
  src/app/api/webhooks/clerk/route.ts \
  src/app/api/webhooks/clerk/route.test.ts
git commit -m "fix(a3.2): extend Clerk webhook with user.updated (sync) and user.deleted (soft-delete)"
```

---

## Verification Checklist

全部 2 个 Task 完成后：

- [ ] `npx vitest run --reporter=verbose` — 全部通过（≥ 1643 + ~5 新用例）
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `studio/` 目录：`loading.tsx` ✅ `error.tsx` ✅
- [ ] `storyboard/` 目录：`loading.tsx` ✅ `error.tsx` ✅
- [ ] `u/[username]/` 目录：`loading.tsx` ✅ `error.tsx` ✅
- [ ] `arena/` 目录：`loading.tsx` ✅（error 已有）
- [ ] `profile/` 目录：`error.tsx` ✅（loading 已有）
- [ ] `route.test.ts` 5 个用例：created / updated / deleted / unknown / missing-headers
- [ ] `softDeleteUser` 在 `user.service.ts` 末尾导出
- [ ] Clerk webhook `user.updated` 调用 `syncUserFromClerk`
- [ ] Clerk webhook `user.deleted` 调用 `softDeleteUser`
- [ ] A.3.3 术语：已确认无需改动，直接关闭
