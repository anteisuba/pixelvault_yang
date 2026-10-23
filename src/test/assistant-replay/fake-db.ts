/**
 * 回放用的库：一个内存里的 `db`。⭐ 只这几张表有真内容 —— 用户、他的 key（`seedAssistantRoute`
 * 同一套查法）、助手人设（完整一行）、画布项目（工作区鉴权）；其余每张表读回空、写只记账。
 *
 * ⚠ 写一律记下来（`writes`）：回放的一条硬约束是「一轮助手不建 generation、不记账」，
 *   多出来的写由 `graders.ts` 点名。
 * ⭐ 唯一的例外是每轮的过程记录（`assistantTurnRecord`）：它是这一轮**该写**的那一行，存进
 *   `turnRecords`（不进 `writes`），回放题再拿它原样转回一道题（`from-turn-record.ts`）对账。
 * ⚠ 人设必须是**完整的一行**：只给 `{ routeModel }` 时 `toPersona` 的 schema 不过、整份回落成
 *   默认值 —— 选的型号悄悄变回「自动」，这一题就测错了家（`seedAssistantRoute` 那一格只够
 *   `getAssistantRouteModelByUserId` 用）。
 */
import { vi } from 'vitest'

import { ASSISTANT_PERSONA_DEFAULTS } from '@/constants/assistant-persona'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import { Prisma } from '@/lib/generated/prisma/client'
import {
  assistantKey,
  seedAssistantRoute,
  type AssistantKeyRow,
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

/** 过程记录的一行（库里那一行的形状：列名照 schema，JSON 列原样存）。 */
export type ReplayTurnRecordRow = Record<string, unknown> & {
  id: string
  userId: string
  turnId: string
  hops: number
  createdAt: Date
}

interface TurnRecordArgs {
  where?: {
    id?: string
    userId?: string
    userId_turnId?: { userId: string; turnId: string }
    hops?: { lte?: number }
  }
  data?: Record<string, unknown>
}

/** `Prisma.DbNull` 落库就是 SQL NULL：读回来是 `null`。 */
function dbValue(value: unknown): unknown {
  return value === Prisma.DbNull ? null : value
}

function rowData(data: Record<string, unknown> | undefined) {
  return Object.fromEntries(
    Object.entries(data ?? {}).map(([key, value]) => [key, dbValue(value)]),
  )
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
    /** 这位的那一段会话（长对话那一题带 `conversationId`）；空 = 库里没有会话。 */
    conversationId: '',
    writes: [] as ReplayDbWrite[],
    turnRecords: [] as ReplayTurnRecordRow[],
  }

  /** 过程记录：`assistant-turn-record.service.ts` 用到的那几种查法，照 Prisma 的语义。 */
  const turnRecordOf = (args: unknown) => (args as TurnRecordArgs).where ?? {}
  const turnRecordHandlers: Record<string, Handler> = {
    findUnique: (args) => {
      const key = turnRecordOf(args).userId_turnId
      return (
        state.turnRecords.find(
          (row) => row.userId === key?.userId && row.turnId === key?.turnId,
        ) ?? null
      )
    },
    create: (args) => {
      const data = rowData((args as TurnRecordArgs).data)
      if (
        state.turnRecords.some(
          (row) => row.userId === data.userId && row.turnId === data.turnId,
        )
      )
        throw Object.assign(new Error('Unique constraint failed'), {
          code: 'P2002',
        })
      const row: ReplayTurnRecordRow = {
        snapshotBytes: 0,
        truncated: [],
        ...data,
        id: `turn_record_${state.turnRecords.length + 1}`,
        userId: String(data.userId),
        turnId: String(data.turnId),
        hops: Number(data.hops),
        createdAt: new Date(),
      }
      state.turnRecords.push(row)
      return row
    },
    updateMany: (args) => {
      const where = turnRecordOf(args)
      const data = rowData((args as TurnRecordArgs).data)
      let count = 0
      for (const row of state.turnRecords) {
        if (where.id !== undefined && row.id !== where.id) continue
        if (where.userId !== undefined && row.userId !== where.userId) continue
        if (where.hops?.lte !== undefined && !(row.hops <= where.hops.lte))
          continue
        Object.assign(row, data)
        count += 1
      }
      return { count }
    },
    // 回放里一个人只有几行，删旧的那两刀都落空。
    findMany: () => [],
    deleteMany: () => ({ count: 0 }),
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
    assistantTurnRecord: turnRecordHandlers,
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
        // 认会话那一句（`findOwnConversation`）：只认这一题的那段、这一位的。
        if (prop === '$queryRaw')
          return async (query: unknown) =>
            query instanceof Prisma.Sql &&
            state.conversationId &&
            query.sql.includes('FROM "AssistantConversation"') &&
            query.values.includes(state.conversationId) &&
            query.values.includes(REPLAY_USER.id)
              ? [{ id: state.conversationId }]
              : []
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
      /** 整行给的 key（实跑评测用库里那把真密文）；给了就不用 `keys`。 */
      keyRows?: readonly AssistantKeyRow[]
      routeModel: string
      projectId: string
      conversationId?: string
    }) {
      state.writes.length = 0
      state.turnRecords.length = 0
      state.projectId = setup.projectId
      state.conversationId = setup.conversationId ?? ''
      keyStore.findFirst.mockReset()
      keyStore.findMany.mockReset()
      keyStore.personaFindUnique.mockReset()
      seedAssistantRoute(keyStore, {
        keys:
          setup.keyRows ??
          setup.keys.map((adapterType) => assistantKey(adapterType)),
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
