/**
 * 回放用的库：一个内存里的 `db`。⭐ 只这几张表有真内容 —— 用户、他的 key（`seedAssistantRoute`
 * 同一套查法）、助手人设（完整一行）、画布项目（工作区鉴权）；其余每张表读回空、写只记账。
 *
 * ⚠ 写一律记下来（`writes`）：回放的一条硬约束是「一轮助手不建 generation、不记账」，
 *   多出来的写由 `graders.ts` 点名。
 * ⚠ 人设必须是**完整的一行**：只给 `{ routeModel }` 时 `toPersona` 的 schema 不过、整份回落成
 *   默认值 —— 选的型号悄悄变回「自动」，这一题就测错了家（`seedAssistantRoute` 那一格只够
 *   `getAssistantRouteModelByUserId` 用）。
 */
import { vi } from 'vitest'

import { ASSISTANT_PERSONA_DEFAULTS } from '@/constants/assistant-persona'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  assistantKey,
  seedAssistantRoute,
  type AssistantKeyStoreMocks,
} from '@/test/assistant-route-fixture'

export const REPLAY_CLERK_ID = 'clerk_replay'

export const REPLAY_USER = {
  id: 'db_user_1',
  clerkId: REPLAY_CLERK_ID,
  email: 'replay@example.test',
  username: 'replay',
  displayName: '回放',
  avatarUrl: null,
  avatarStorageKey: null,
  bannerUrl: null,
  bannerStorageKey: null,
  bio: null,
  civitaiToken: null,
  isPublic: true,
  isDeleted: false,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
}

export interface ReplayDbWrite {
  readonly model: string
  readonly method: string
  readonly args: unknown
}

const WRITE_METHODS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
])

const READ_DEFAULTS: Record<string, () => unknown> = {
  findMany: () => [],
  findFirst: () => null,
  findUnique: () => null,
  count: () => 0,
  groupBy: () => [],
  aggregate: () => ({ _count: 0, _sum: {}, _max: {}, _min: {} }),
}

type Handler = (args: unknown) => unknown

interface WhereArgs {
  where?: { id?: string; userId?: string; clerkId?: string }
}

function whereOf(args: unknown): NonNullable<WhereArgs['where']> {
  return (args as WhereArgs | undefined)?.where ?? {}
}

/** 一整行人设：默认值 + 选定的型号（`auto` = 库里的 null）。 */
function personaRow(routeModel: string) {
  return {
    name: ASSISTANT_PERSONA_DEFAULTS.name,
    avatarPreset: ASSISTANT_PERSONA_DEFAULTS.avatarPreset,
    avatarUrl: null,
    avatarChoice: ASSISTANT_PERSONA_DEFAULTS.avatarChoice,
    characterCardId: null,
    nameFromCharacter: false,
    toneFromCharacter: false,
    characterCard: null,
    tone: ASSISTANT_PERSONA_DEFAULTS.tone,
    toneCustom: null,
    verbosity: ASSISTANT_PERSONA_DEFAULTS.verbosity,
    planMode: ASSISTANT_PERSONA_DEFAULTS.planMode,
    language: ASSISTANT_PERSONA_DEFAULTS.language,
    routeModel: routeModel === 'auto' ? null : routeModel,
    reasoningEffort: ASSISTANT_PERSONA_DEFAULTS.reasoningEffort,
    nextStepHint: ASSISTANT_PERSONA_DEFAULTS.nextStepHint,
    useMyWords: ASSISTANT_PERSONA_DEFAULTS.useMyWords,
    memoryCapture: ASSISTANT_PERSONA_DEFAULTS.memoryCapture,
    archetype: ASSISTANT_PERSONA_DEFAULTS.archetype,
    addressUserAs: null,
  }
}

function createReplayDb() {
  const keyStore: AssistantKeyStoreMocks = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    personaFindUnique: vi.fn(),
  }
  const state = {
    projectId: '',
    writes: [] as ReplayDbWrite[],
  }

  const handlers: Record<string, Record<string, Handler>> = {
    user: {
      findUnique: (args) => {
        const where = whereOf(args)
        return where.clerkId === REPLAY_CLERK_ID || where.id === REPLAY_USER.id
          ? REPLAY_USER
          : null
      },
    },
    userApiKey: {
      findFirst: (args) => keyStore.findFirst(args),
      findMany: (args) => keyStore.findMany(args),
    },
    assistantPersona: {
      findUnique: (args) => keyStore.personaFindUnique(args),
    },
    nodeWorkflowProject: {
      findFirst: (args) => {
        const where = whereOf(args)
        return where.id === state.projectId && where.userId === REPLAY_USER.id
          ? { id: state.projectId }
          : null
      },
    },
  }

  const models = new Map<string, Record<string, Handler>>()
  const modelProxy = (model: string) => {
    const cached = models.get(model)
    if (cached) return cached
    const proxy = new Proxy({} as Record<string, Handler>, {
      get: (_target, method) => {
        if (typeof method !== 'string') return undefined
        return async (args: unknown) => {
          const handler = handlers[model]?.[method]
          if (handler) return handler(args)
          if (WRITE_METHODS.has(method)) {
            state.writes.push({ model, method, args })
            return method.endsWith('Many') ? { count: 0 } : { id: `${model}_1` }
          }
          const fallback = READ_DEFAULTS[method]
          if (fallback) return fallback()
          throw new Error(`replay db: ${model}.${method} is not stubbed`)
        }
      },
    })
    models.set(model, proxy)
    return proxy
  }

  const db: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (typeof prop !== 'string' || prop === 'then') return undefined
        if (prop === '$transaction')
          return async (input: unknown) =>
            typeof input === 'function'
              ? (input as (tx: unknown) => unknown)(db)
              : Promise.all(input as Promise<unknown>[])
        if (prop === '$executeRaw' || prop === '$executeRawUnsafe')
          return async (...args: unknown[]) => {
            state.writes.push({ model: '$raw', method: prop, args })
            return 0
          }
        if (prop.startsWith('$')) return async () => []
        return modelProxy(prop)
      },
    },
  )

  return {
    db,
    keyStore,
    state,
    /** 每道题开跑前：清账、配 key、写人设、认这块画布。 */
    reset(setup: {
      keys: readonly AI_ADAPTER_TYPES[]
      routeModel: string
      projectId: string
    }) {
      state.writes.length = 0
      state.projectId = setup.projectId
      keyStore.findFirst.mockReset()
      keyStore.findMany.mockReset()
      keyStore.personaFindUnique.mockReset()
      seedAssistantRoute(keyStore, {
        keys: setup.keys.map((adapterType) => assistantKey(adapterType)),
        routeModel: setup.routeModel,
      })
      keyStore.personaFindUnique.mockResolvedValue(personaRow(setup.routeModel))
    },
  }
}

export const replayDb = createReplayDb()

/** 与 `@/lib/db` 同名同义（它被整个桩掉了）。 */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  )
}
