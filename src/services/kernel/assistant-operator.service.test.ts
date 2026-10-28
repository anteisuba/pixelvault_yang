import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPromptDialect } from '@/constants/prompt-dialects'
import { resolveAdapterType } from '@/constants/models'

vi.mock('server-only', () => ({}))
/**
 * `after` 换成记下来：v3 收尾把后台抽记忆那一跳交给它（P2 §2.5），用例据此验
 * 「函数等它跑完再退」，并在断言前把它等完。
 */
const mockAfter = vi.hoisted(() => vi.fn())
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: unknown) => mockAfter(task),
}))

/**
 * 参考图尺寸探针走的真实取图。⚠ 默认一律失败 —— 单测不去打真地址；要尺寸的那一条
 * 自己塞一张 sharp 现造的图。
 */
const mockSafeFetch = vi.fn(async (..._args: unknown[]): Promise<Response> => {
  throw new Error('network disabled in tests')
})
vi.mock('@/lib/url-guard', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/url-guard')>('@/lib/url-guard')
  return {
    ...actual,
    safeFetch: (...args: unknown[]) => mockSafeFetch(...args),
  }
})

/** NAI 标签核对（拆分与反推 B3）—— 默认原样放行，要验的用例自己塞结果。 */
const mockCheckNovelAiPromptTags = vi.fn()
vi.mock('@/services/novelai-tags.service', () => ({
  checkNovelAiPromptTags: (...args: unknown[]) =>
    mockCheckNovelAiPromptTags(...args),
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

const mockLlmTextCompletion = vi.fn()
const mockResolveLlmTextRoute = vi.fn()
/**
 * 「助手那一家」走**真的** `resolveAssistantRoute`（owner 2026-10-15「全跟助手」），只桩
 * `db.userApiKey` 那两跳：按厂商列 key（`findMany`）与按厂商查 key（`findFirst`）。
 * 缺省「库里那一把就是 `mockResolveLlmTextRoute` 此刻给的那一家」—— 见 `beforeEach`。
 * ⚠ 其余表照旧走真模块（这一层本来就不碰它们）。
 */
const keyStore = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
}))
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const userApiKey = {
    findFirst: keyStore.findFirst,
    findMany: keyStore.findMany,
  }
  return {
    ...actual,
    db: new Proxy(actual.db, {
      get: (target, property, receiver) =>
        property === 'userApiKey'
          ? userApiKey
          : Reflect.get(target, property, receiver),
    }),
  }
})
/**
 * 所选模型自带联网（owner 2026-09-30）。缺省**不支持** —— 现存的查证用例验的是
 * Serper 那条路；验自带联网的用例自己打开。
 */
const mockSupportsNativeWebSearch = vi.fn<(adapter: string) => boolean>(
  () => false,
)
const mockLlmNativeWebSearch = vi.fn()
/** 搜 X 那一跳：只认 Grok 自己那把 key（创作者点名搜 X 才问）。缺省没有。 */
const mockFindXSearchRoute = vi.fn(async (): Promise<unknown> => null)
vi.mock('@/services/kernel/research-route.service', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/services/kernel/research-route.service')
  >()),
  findXSearchRoute: () => mockFindXSearchRoute(),
}))
/**
 * 工具环那一轮走的是 `llmTextStream`（2026-09-06 的逐字流），**桩到同一颗
 * `mockLlmTextCompletion` 上**：这一层要验的是「模型这一轮说了什么会怎么样」，
 * 不是分块怎么切。现存的几十条 `mockLlmTextCompletion.mockResolvedValueOnce(...)`
 * 因此一条都不用改。
 *
 * ⚠ 想验分块行为的用例自己覆盖 `mockLlmTextStreamChunks` —— 它按块吐，
 * 增量帧的条数由它决定。
 */
const mockLlmTextStreamChunks = vi.fn<(raw: string) => Iterable<string> | null>(
  () => null,
)
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...args: unknown[]) => mockLlmTextCompletion(...args),
  llmTextStream: async function* (...args: unknown[]) {
    const raw = (await mockLlmTextCompletion(...args)) as string
    const chunks = mockLlmTextStreamChunks(raw)
    if (chunks) {
      yield* chunks
      return
    }
    yield raw
  },
  resolveLlmTextRoute: (...args: unknown[]) => mockResolveLlmTextRoute(...args),
  supportsNativeWebSearch: (adapter: string) =>
    mockSupportsNativeWebSearch(adapter),
  llmNativeWebSearch: (...args: unknown[]) => mockLlmNativeWebSearch(...args),
  isLlmTextContextLimitError: () => false,
  isLlmTextTransientError: () => false,
}))

const mockGetPublicGenerationPage = vi.fn()
/**
 * 审核态两条（切片 X）。⚠ 桩掉是因为它们真的会查库 —— 这一层要验的是
 * 「读到 blocked 之后会发生什么」，不是那条 SQL 本身（那条锁在
 * `generation.service.test.ts` 里）。
 */
const mockReadGenerationReviewStates = vi.fn(
  async (..._args: unknown[]) => new Map<string, string>(),
)
const mockSetGenerationReviewState = vi.fn()
vi.mock('@/services/generation.service', () => ({
  getPublicGenerationPage: (...args: unknown[]) =>
    mockGetPublicGenerationPage(...args),
  readGenerationReviewStates: (...args: unknown[]) =>
    mockReadGenerationReviewStates(...args),
  setGenerationReviewState: (...args: unknown[]) =>
    mockSetGenerationReviewState(...args),
}))

const mockListAssistantAssetFolders = vi.fn()
const mockInspectAssistantAssetFolder = vi.fn()
const mockCheckCharacterLook = vi.fn()
vi.mock('@/services/kernel/assistant-character-look.service', () => ({
  checkCharacterLook: (...args: unknown[]) => mockCheckCharacterLook(...args),
}))

// 看片（2b）：截帧规划照真的跑，只把「取帧 + 看图」那一跳换掉。
const mockLookAtEditFrames = vi.fn()
vi.mock(
  '@/services/kernel/assistant-edit-look.service',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/services/kernel/assistant-edit-look.service')
    >()),
    lookAtEditFrames: (...args: unknown[]) => mockLookAtEditFrames(...args),
  }),
)

const mockInspectWebImageCandidates = vi.fn()
vi.mock('@/services/kernel/assistant-web-image-vision.service', () => ({
  inspectWebImageCandidates: (...args: unknown[]) =>
    mockInspectWebImageCandidates(...args),
}))

vi.mock('@/services/kernel/assistant-asset-folder-vision.service', () => ({
  listAssistantAssetFolders: (...args: unknown[]) =>
    mockListAssistantAssetFolders(...args),
  inspectAssistantAssetFolder: (...args: unknown[]) =>
    mockInspectAssistantAssetFolder(...args),
}))

/**
 * 联网搜图（P3-B）。⚠ **全程 mock，一个真 Serper credit 都不花** ——
 * 免费池只有 2500 次，让单元测试去打真接口是把额度当柴烧。
 */
const mockWebImageSearch = vi.fn()
const mockIsWebImageSearchConfigured = vi.fn()
/** 联网**查文字**（切片 3b）—— 同一条论据、同一份 mock 家族，一个 credit 都不花。 */
const mockWebSearch = vi.fn()
const mockIsWebSearchConfigured = vi.fn()
/**
 * 多语言变体搜图与读正文（2026-09-06）—— 同一条论据、同一份 mock 家族。
 * ⚠ `extractFocusedExcerpt` **走真实现**：它是纯函数，桩掉它等于把「按 focus
 * 截段」这件事从这一层的验收里删掉，而那正是这条工具的全部价值。
 */
const mockWebImageSearchMulti = vi.fn()
const mockReadUrl = vi.fn()
/**
 * `read_url` 走 `readUrlDetailed`（2026-10-15）：默认照 `mockReadUrl` 的桩翻（读到 = Jina，
 * 读不到 = failed），要验「站点挡了」的用例自己桩这一个。
 */
const mockReadUrlDetailed = vi.fn()
vi.mock('@/services/web-research.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/web-research.service')
  >('@/services/web-research.service')
  return {
    extractFocusedExcerpt: actual.extractFocusedExcerpt,
    webImageSearch: (...args: unknown[]) => mockWebImageSearch(...args),
    webImageSearchMulti: (...args: unknown[]) =>
      mockWebImageSearchMulti(...args),
    isWebImageSearchConfigured: () => mockIsWebImageSearchConfigured(),
    webSearch: (...args: unknown[]) => mockWebSearch(...args),
    isWebSearchConfigured: () => mockIsWebSearchConfigured(),
    readUrl: (...args: unknown[]) => mockReadUrl(...args),
    readUrlDetailed: (...args: unknown[]) => mockReadUrlDetailed(...args),
  }
})

/**
 * 联网找视频（搜索期第二片）—— 同一条论据：⛔ 一个 Serper credit 都不花、⛔ 不打 B站。
 * ⚠ `wantsBilibiliVideos` 走真实现：「中文 / 点名 B站才另问 B站」正是这一层要验的判断。
 */
const mockSearchWebVideos = vi.fn()
const mockIsWebVideoSearchConfigured = vi.fn(() => true)
vi.mock('@/services/web-video-search.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/web-video-search.service')
  >('@/services/web-video-search.service')
  return {
    wantsBilibiliVideos: actual.wantsBilibiliVideos,
    searchWebVideos: (...args: unknown[]) => mockSearchWebVideos(...args),
    isWebVideoSearchConfigured: () => mockIsWebVideoSearchConfigured(),
  }
})

/**
 * 检索扇出（2026-09-06）。⚠ **全程 mock，一次都不打萌百 / danbooru / Serper** ——
 * 与联网搜图那条同一条论据：让单元测试去打真上游是把别人的服务器当柴烧，
 * 而这一层要验的是「几轮、怎么讲给模型听」，不是上游返回什么。
 */
const mockRunAssistantResearch = vi.fn()
vi.mock(
  '@/services/research/research-fanout.service',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/services/research/research-fanout.service')
      >()
    return {
      ...actual,
      // ⚠ 只桩掉**打源**那一支：结论压缩（§9.1 ④）是纯函数，桩掉它等于把要验的
      //   东西一起桩掉。
      runAssistantResearch: (...args: unknown[]) =>
        mockRunAssistantResearch(...args),
    }
  },
)

/**
 * **查证的改写 + 选源**（§9.1 ① ②，commit #16）。桩掉理由与扇出同源：它真的会
 * 去查库找 key、真的会调一次 LLM，而这一层要验的是「四步怎么串、讲给模型听的是
 * 什么」。⚠ 默认**回落**（返回启发式那份），单独的用例再验改写生效那一支。
 */
const mockPlanResearchWithLlm = vi.fn(
  async (params: { heuristic: unknown }) => params.heuristic,
)
vi.mock('@/services/research/research-planner.service', () => ({
  planResearchWithLlm: (...args: unknown[]) =>
    mockPlanResearchWithLlm(...(args as [{ heuristic: unknown }])),
}))

/**
 * 每轮结账的两条落库腿（v2 §7.2 / §7.3）。⚠ **必须桩掉**：它们真的会写库，
 * 而这一层要验的是「结账写了什么、失败了会怎样」，不是那两条 SQL。
 */
const mockAppendAssistantConversationRound = vi.fn(
  async (
    _clerkId: string,
    _conversationId: string,
    round: Record<string, unknown>,
  ) => ({ ...round, roundIndex: 3 }),
)
/** 下一轮注入要读的那几条（§7.6）—— 同样桩掉，⛔ 这一层不验那条 SQL。 */
const mockListAssistantConversationRounds = vi.fn(
  async (..._args: unknown[]) => [] as Record<string, unknown>[],
)
vi.mock('@/services/assistant-conversation.service', () => ({
  assertAssistantWorkspaceAccess: vi.fn(async () => undefined),
  assertAssistantConversationWorkspaceAccess: vi.fn(async () => undefined),
  appendAssistantConversationRound: (...args: unknown[]) =>
    mockAppendAssistantConversationRound(
      ...(args as [string, string, Record<string, unknown>]),
    ),
  listAssistantConversationRounds: (...args: unknown[]) =>
    mockListAssistantConversationRounds(...args),
}))

const mockAppendAssistantEvidenceBook = vi.fn(async (..._args: unknown[]) => ({
  refs: [] as string[],
  researchRunIds: [] as string[],
}))
/** 按编号翻证据本（§7.3）—— 桩掉，这一层验的是规划器那三道闸。 */
const mockRecallAssistantEvidence = vi.fn(async (..._args: unknown[]) => ({
  items: [] as Record<string, unknown>[],
  missing: [] as string[],
}))
vi.mock('@/services/research/assistant-evidence-book.service', () => ({
  appendAssistantEvidenceBook: (...args: unknown[]) =>
    mockAppendAssistantEvidenceBook(...args),
  recallAssistantEvidence: (...args: unknown[]) =>
    mockRecallAssistantEvidence(...args),
}))

/**
 * 抽帧落库（第二期）。⚠ **全程 mock，一个字节都不写 R2** —— 这一层要验的是
 * 「三帧怎么被读、怎么被汇总」，不是 R2 客户端。⛔ 也别在这里放真实现：那会让
 * 单测去打对象存储。
 */
const mockPersistVideoFrameSet = vi.fn()
vi.mock('@/services/video-frames/video-frame-set.service', () => ({
  persistVideoFrameSet: (...args: unknown[]) =>
    mockPersistVideoFrameSet(...args),
}))

/**
 * LoRA 检索（P4-C）。⚠ **全程 mock，一次都不打 Civitai / HF** —— 与联网搜图那条
 * 同一条论据：让单元测试去打真上游是把别人的额度当柴烧，而且这一层要验的是
 * 「候选怎么投影、装不上的怎么说」，不是上游返回什么。
 */
const mockSearchLoraCandidates = vi.fn()
vi.mock('@/services/lora/lora-candidates.service', () => ({
  // lora-assistant §13：LoRA 域照库页条件搜 —— 沿用同一个 mock，断言照旧读它。
  searchLoraLibraryCandidates: (...args: unknown[]) =>
    mockSearchLoraCandidates(...args),
  resolveLibraryBaseModel: (family: string | null | undefined) =>
    family === 'illustrious' ? 'Illustrious' : null,
}))

/**
 * persona 与项目规则（§8.5 / §10）。⚠ **必须桩掉**：`prepareOperatorTurn` 开跑前
 * 就会各读一次库，不桩的话这份测试的每一条用例都会撞真 Prisma 客户端。
 * 默认返回「代码默认值 + 零条规则」= 今天绝大多数用户的真实形状。
 */
const mockGetAssistantPersonaByUserId = vi.fn()
vi.mock('@/services/assistant-persona.service', async () => {
  const { ASSISTANT_PERSONA_DEFAULTS } =
    await import('@/constants/assistant-persona')
  const { sanitizePrompt } = await import('@/services/kernel/prompt-guard')
  return {
    getAssistantPersonaByUserId: (...args: unknown[]) =>
      mockGetAssistantPersonaByUserId(...args),
    // 清洗那一跳是真的跑 —— 它决定风格段里那句话长什么样。
    sanitizeToneCustom: (persona: {
      tone: string
      toneCustom: string | null
    }) =>
      persona.tone === 'custom' && persona.toneCustom
        ? sanitizePrompt(persona.toneCustom).trim()
        : null,
    // 称呼那一格同样真的过清洗 —— 它直连系统提示。
    sanitizeAddressUserAs: (persona: { addressUserAs: string | null }) =>
      persona.addressUserAs
        ? sanitizePrompt(persona.addressUserAs).trim() || null
        : null,
    // 角色设定的清洗 / 填宏 / 截断在 persona 服务自己的测试里验；这里原样透传。
    sanitizePromptCharacter: (persona: { promptCharacter?: unknown }) =>
      persona.promptCharacter ?? null,
    sanitizePromptRoleplay: (persona: { roleplay?: unknown }) =>
      persona.roleplay ?? null,
    ASSISTANT_PERSONA_DEFAULTS,
  }
})

/**
 * 学出来的创作偏好（§8.3）—— **默认没有**（这张表多数用户是空的），
 * 要验那几行的用例自己 `mockResolvedValue`。
 */
const mockGetCreativePreferenceDigest = vi.fn(
  async (..._args: unknown[]) => null as unknown,
)
vi.mock('@/services/user-preference.service', () => ({
  getCreativePreferenceDigest: (...args: unknown[]) =>
    mockGetCreativePreferenceDigest(...args),
}))

/**
 * 来源白 / 黑名单（v2 §9.3）—— 项目规则表现在只装这两种；普通规则住记忆表
 * （助手设置 B），见下面记忆那一份 mock。
 */
const mockListProjectSourceRules = vi.fn()
const mockAddProjectRule = vi.fn()
vi.mock('@/services/project-rule.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/project-rule.service')
  >('@/services/project-rule.service')
  return {
    ProjectRuleLimitError: actual.ProjectRuleLimitError,
    listProjectSourceRules: (...args: unknown[]) =>
      mockListProjectSourceRules(...args),
    addProjectRule: (...args: unknown[]) => mockAddProjectRule(...args),
  }
})

/**
 * 素材库四条写操作（v2 §10，commit #18）—— 与规则那一份同形。
 *
 * ⚠ 真实实现的「做 → 撤 → 回到原状」由 `asset-library-write.service.test.ts`
 * 用一份内存假库验；这一层验的是**入口派发与协议**：`apply` 的四个 action
 * 落到哪个函数、`inverse` 有没有原样带出去、够不着时拒得对不对。
 */
const mockTagAssets = vi.fn()
const mockSetAssetFavorites = vi.fn()
const mockCreateAssetFolder = vi.fn()
const mockAddAssetsToFolder = vi.fn()
vi.mock('@/services/asset-library-write.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/asset-library-write.service')
  >('@/services/asset-library-write.service')
  return {
    AssetFolderLimitError: actual.AssetFolderLimitError,
    tagAssets: (...args: unknown[]) => mockTagAssets(...args),
    setAssetFavorites: (...args: unknown[]) => mockSetAssetFavorites(...args),
    createAssetFolder: (...args: unknown[]) => mockCreateAssetFolder(...args),
    addAssetsToFolder: (...args: unknown[]) => mockAddAssetsToFolder(...args),
  }
})

/** 上下文卡（第三期 K1）—— 与规则那一份同形，一行库都不碰。 */
const mockListContextCards = vi.fn(
  async (..._args: unknown[]) => [] as unknown[],
)
const mockGetContextCard = vi.fn(async (..._args: unknown[]) => null as unknown)
vi.mock('@/services/context-cards.service', () => ({
  listContextCards: (...args: unknown[]) => mockListContextCards(...args),
  getContextCard: (...args: unknown[]) => mockGetContextCard(...args),
}))

/** 助手记忆（56a）—— 注入那一跳读它、结账那一跳写它，两边都不许真打库。 */
const mockListMemoriesForPrompt = vi.fn(
  async (..._args: unknown[]) => [] as unknown[],
)
const mockRecordMemories = vi.fn(async (..._args: unknown[]) => 0)
const mockTouchMemories = vi.fn(async (..._args: unknown[]) => undefined)
/** P3：后台抽记忆时给模型看的那几条已有的（编号 → id 由内核换）。 */
const mockListMemoriesForReview = vi.fn(
  async (..._args: unknown[]) => [] as unknown[],
)
/** 你写的那几条（规则段）与两条规则工具 —— 规矩并进记忆（助手设置 B）。 */
const mockListCreatorMemories = vi.fn(
  async (..._args: unknown[]) => [] as unknown[],
)
const mockListStandingRuleMemories = vi.fn(
  async (..._args: unknown[]) => [] as unknown[],
)
const mockAddRuleMemory = vi.fn()
vi.mock('@/services/assistant-memory.service', () => ({
  listAssistantMemoriesForPrompt: (...args: unknown[]) =>
    mockListMemoriesForPrompt(...args),
  listCreatorMemoriesForPrompt: (...args: unknown[]) =>
    mockListCreatorMemories(...args),
  listStandingRuleMemories: (...args: unknown[]) =>
    mockListStandingRuleMemories(...args),
  addAssistantRuleMemory: (...args: unknown[]) => mockAddRuleMemory(...args),
  recordAssistantMemories: (...args: unknown[]) => mockRecordMemories(...args),
  touchAssistantMemories: (...args: unknown[]) => mockTouchMemories(...args),
  listAssistantMemoriesForReview: (...args: unknown[]) =>
    mockListMemoriesForReview(...args),
}))
import {
  ASSISTANT_OPERATOR_VERB_IDS,
  ASSISTANT_OPERATOR_ENTRY_TOOLS,
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  ASSISTANT_OPERATOR_TOOL_VERBS,
  ASSISTANT_OPERATOR_TOOLS,
  ASSISTANT_RESEARCH_LIMITS,
  ASSISTANT_WEB_FIND_LIMITS,
} from '@/constants/assistant-operator'
import { ASSISTANT_PERSONA_DEFAULTS } from '@/constants/assistant-persona'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { logger } from '@/lib/logger'
import {
  closeRoundV3,
  closeRoundV3BeforeStop,
  planTool,
  prepareOperatorTurn,
  recordLedgerStep,
} from '@/services/kernel/assistant-operator.service'
import {
  type AssistantOperatorCanvasNode,
  type AssistantOperatorRequest,
} from '@/types/assistant-operator'
import {
  expectSelectedProviderOnly,
  providerUsesOf,
} from '@/test/selected-provider-only'

const SNAPSHOT: AssistantOperatorRequest['snapshot'] = {
  prompt: '',
  negativePrompt: '',
  model: { id: 'seedream-4', label: 'Seedream 4' },
  availableModels: [
    { id: 'seedream-4', label: 'Seedream 4' },
    { id: 'flux-pro', label: 'FLUX Pro' },
  ],
  specs: {
    aspectRatio: '1:1',
    resolution: 'auto',
    aspectRatioOptions: ['1:1', '16:9'],
    resolutionOptions: ['auto', '2K'],
  },
  count: { value: 1, options: [1, 2, 4] },
  references: { items: [], limit: 4 },
}

function buildRequest(
  overrides: Partial<AssistantOperatorRequest> = {},
): AssistantOperatorRequest {
  const domain = overrides.domain ?? 'image'
  const snapshot = overrides.snapshot ?? SNAPSHOT
  const workspaceKey =
    domain === 'canvas'
      ? 'canvas:test-project'
      : domain === 'image'
        ? getPromptDialect(
            resolveAdapterType(snapshot.model?.id ?? '') ?? undefined,
          ) === 'tags'
          ? 'image-tags'
          : 'image-natural'
        : domain
  return {
    messages: [{ role: 'user', content: '帮我把这张海报配好' }],
    domain: 'image',
    snapshot: SNAPSHOT,
    workspaceKey,
    ...overrides,
  }
}

/**
 * 用例里写的是**旧工具名**（`{ name: 'set_prompt', args: {...} }`），这里替它包成
 * v2 的入口形状（`{ name: 'apply', args: { action: 'set_prompt', ... } }`）。
 *
 * ⭐ 包在这一层而不是把 158 处 fixture 逐条改写：这些用例断言的是**每条工具自己
 * 的行为**（值域、`inverse`、拒绝理由），入口只是模型写法的一层壳 —— 把壳抄进
 * 每一条 fixture 只会让下一次协议微调再抄一遍。入口本身的行为（派发 / 枚举 /
 * 旧名被拒）有它自己那一组用例，⛔ 那几条不走这个包装。
 * ⚠ 已经写成入口形状的（`name` 是五个动词之一）原样放行。
 */
function wrapEntryToolCall(turn: unknown): unknown {
  if (!turn || typeof turn !== 'object') return turn
  const record = turn as Record<string, unknown>
  const tool = record.tool
  if (!tool || typeof tool !== 'object') return turn
  const call = tool as Record<string, unknown>
  const name = call.name
  if (typeof name !== 'string') return turn
  const args = (call.args as Record<string, unknown> | undefined) ?? {}
  if (
    (ASSISTANT_OPERATOR_ENTRY_TOOLS as readonly string[]).includes(name) &&
    'action' in args
  ) {
    return turn
  }
  if (!(ASSISTANT_OPERATOR_TOOLS as readonly string[]).includes(name)) {
    return turn
  }
  const legacyTool = name as (typeof ASSISTANT_OPERATOR_TOOLS)[number]
  return {
    ...record,
    tool: {
      ...call,
      name: ASSISTANT_OPERATOR_TOOL_VERBS[legacyTool],
      /**
       * ⚠ 网侧那四条（§9，commit #16）退成了内部名：提示词里它们已经不出现，
       * 但 schema 照旧收（`ASSISTANT_OPERATOR_ENTRY_ACTION_VALUES`），所以这些
       * 逐工具的用例仍然直指它们自己那条实现。两入口本身的行为有自己的用例。
       */
      args: { action: legacyTool, ...args },
    },
  }
}

/** 模型按顺序吐出来的几轮回复。 */
function queueTurns(...turns: unknown[]): void {
  mockLlmTextCompletion.mockReset()
  for (const raw of turns) {
    const turn = wrapEntryToolCall(raw)
    mockLlmTextCompletion.mockResolvedValueOnce(
      typeof turn === 'string' ? turn : JSON.stringify(turn),
    )
  }
  // 队列吐完之后一律收尾，免得循环撞到 undefined。
  mockLlmTextCompletion.mockResolvedValue(JSON.stringify({ finished: true }))
}

beforeEach(() => {
  vi.clearAllMocks()
  // ⚠ `clearAllMocks` 只清调用记录，**不清实现，也不清没被消费掉的
  //    `mockResolvedValueOnce` 队列**。打断类用例常常在队列吐完之前就返回，
  //    剩下的那条会漏进下一个用例并压过它自己的 `mockImplementation`
  //    （本文件真踩过一次，表现是「abort 了却收到 done」）。
  mockLlmTextCompletion.mockReset()
  // 分块策略默认「整段一块」—— 想验逐字的用例自己 `mockImplementation` 覆盖。
  mockLlmTextStreamChunks.mockReset()
  mockLlmTextStreamChunks.mockReturnValue(null)
  mockEnsureUser.mockResolvedValue({ id: 'user-db-1' })
  mockCheckNovelAiPromptTags.mockReset()
  mockCheckNovelAiPromptTags.mockImplementation(
    async ({ prompt }: { prompt: string }) => ({
      prompt,
      fixes: [],
      unknown: [],
    }),
  )
  mockGetCreativePreferenceDigest.mockResolvedValue(null)
  // 默认「一张都没标过」—— 缺席 = pending，存量行就是这个样子。
  mockReadGenerationReviewStates.mockReset()
  mockReadGenerationReviewStates.mockResolvedValue(new Map<string, string>())
  mockSetGenerationReviewState.mockReset()
  mockResolveLlmTextRoute.mockResolvedValue({
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: { label: 'Gemini', baseUrl: 'https://example.test' },
    apiKey: 'test-key',
  })
  /**
   * 库里那一把 = `mockResolveLlmTextRoute` 此刻给的那一家（各用例会改它），于是「自动」
   * 挑到的就是那一家的默认档；点名了别家却没那一家的 key 就照实抛缺 key。
   * ⚠ 它拒（模拟一把 key 都没有 / 坏 key）就让 `findMany` 跟着拒 —— 与旧的自动路由同一个结果。
   */
  keyStore.findFirst.mockResolvedValue(null)
  keyStore.findMany.mockImplementation(async () => {
    const route = (await mockResolveLlmTextRoute.getMockImplementation()?.(
      'user-db-1',
    )) as { adapterType: string } | undefined
    return route
      ? [{ id: `key-${route.adapterType}`, adapterType: route.adapterType }]
      : []
  })
  mockGetPublicGenerationPage.mockResolvedValue({
    generations: [],
    total: 0,
    hasMore: false,
    nextCursor: null,
  })
  mockGetAssistantPersonaByUserId.mockResolvedValue({
    ...ASSISTANT_PERSONA_DEFAULTS,
    avatarUrl: null,
  })
  mockListCreatorMemories.mockResolvedValue([])
  mockListStandingRuleMemories.mockResolvedValue([])
  // 绝大多数用户没有来源名单 —— 默认空闸，要验名单的用例自己塞。
  mockListProjectSourceRules.mockResolvedValue([])
  /**
   * ⚠ `clearAllMocks` 不清实现 —— 上一条用例桩过的卡表会漏进下一条
   * （表现是「一张常挂卡都没有」那条用例里印出了卡段）。与规则那一行同一条判据。
   */
  mockListContextCards.mockResolvedValue([])
  mockListAssistantAssetFolders.mockResolvedValue([])
  mockInspectWebImageCandidates.mockResolvedValue(null)
  mockCheckCharacterLook.mockResolvedValue({ viewed: 0, conflicts: [] })
  mockInspectAssistantAssetFolder.mockResolvedValue({
    folder: {
      folderId: 'hero-folder',
      name: 'Hero',
      path: 'Characters / Hero',
      imageCount: 30,
    },
    totalImages: 30,
    inspectedImages: 2,
    truncated: true,
    batchCount: 1,
    findings: [
      {
        assetId: 'asset-1',
        url: 'https://cdn.example.test/asset-1.png',
        thumbnailUrl: 'https://cdn.example.test/asset-1-thumb.webp',
        createdAt: '2026-08-31T00:00:00.000Z',
        observation: 'front-facing character portrait',
        relevance: 'high',
        reason: 'clear face and costume',
        tags: ['portrait'],
      },
      {
        assetId: 'asset-2',
        url: 'https://cdn.example.test/asset-2.png',
        createdAt: '2026-08-30T00:00:00.000Z',
        observation: 'full-body character sheet',
        relevance: 'medium',
        reason: 'useful silhouette reference',
        tags: ['full-body'],
      },
    ],
    batchSummaries: ['two visible character references'],
    uncertainties: [],
    visionAdapter: 'gemini',
  })
  mockIsWebImageSearchConfigured.mockReturnValue(true)
  mockWebImageSearch.mockResolvedValue([])
  /**
   * ⚠ 默认让**多变体那条委托回单条那条**：不给 `subject` 时服务端发的就是一条
   * 查询，两者的行为逐字相同（真实现里 `webImageSearchMulti` 单条时也是直接
   * 调 `webImageSearch`）。这样切片 3b 那批用例继续用 `mockWebImageSearch`
   * 描述「上游返回什么」，⛔ 不必为一次内部重构改一遍。
   */
  mockWebImageSearchMulti.mockImplementation(
    (queries: string[], options: unknown) =>
      mockWebImageSearch(queries[0], options),
  )
  mockReadUrl.mockResolvedValue(null)
  mockReadUrlDetailed.mockImplementation(async (url: string) => {
    const page = await mockReadUrl(url)
    return page
      ? { status: 'read', page, via: 'jina' }
      : { status: 'failed', url }
  })
  mockRunAssistantResearch.mockResolvedValue({
    queries: [],
    sources: ['wiki', 'web', 'danbooru'],
    evidence: [],
    items: [],
    receipts: [],
  })
  mockIsWebSearchConfigured.mockReturnValue(true)
  mockWebSearch.mockResolvedValue([])
  // ⚠ 默认「两个源都好好的但没命中」—— 与「源挂了」是两句不同的话，见下面那条用例。
  mockSearchLoraCandidates.mockResolvedValue({
    query: '',
    candidates: [],
    sources: [{ source: 'civitai', status: 'empty', count: 0, tookMs: 1 }],
  })
})

describe('read_state', () => {
  const CARDS_SNAPSHOT = {
    prompt: '',
    availableModels: [],
    cards: {
      total: 1,
      characters: [
        {
          id: 'denia',
          name: 'Denia',
          work: '鸣潮',
          imageCount: 1,
          hasProfile: false,
        },
      ],
      open: null,
    },
  }

  /**
   * ⭐ v3（`mainModelLooks`）：缩略图交给主模型自己看（`assistant-v3-cards`），
   * 这一跳**只搜、只列**：⛔ 不起看缩略图的子调用（它走的是 `resolveVisionRoute`，
   * 会悄悄借别家的 key）、⛔ 观察里不说看没看过、⛔ 不按判词静默丢掉要交的图。
   */
  it('⭐ v3 主模型自己看：搜图不起看图子调用、不写判词，交图一张都不悄悄丢', async () => {
    mockWebImageSearch.mockResolvedValue([
      {
        imageUrl: 'https://cdn.example.test/denia.jpg',
        thumbnailUrl: 'https://encrypted-tbn0.gstatic.test/d.jpg',
        pageUrl: 'https://example.test/denia',
        domain: 'example.test',
      },
      {
        imageUrl: 'https://cdn.example.test/other.jpg',
        thumbnailUrl: 'https://encrypted-tbn0.gstatic.test/o.jpg',
        pageUrl: 'https://example.test/other',
        domain: 'example.test',
      },
    ])
    // 若还有人去问这个子调用，它会说「第二张不是她」—— 这一条验的是没人问。
    mockInspectWebImageCandidates.mockResolvedValue([
      {
        imageIndex: 1,
        isCharacter: 'no',
        view: 'bust',
        cluttered: false,
        observation: '白发的另一个角色',
      },
    ])
    queueTurns()
    const prepared = await prepareOperatorTurn(
      'clerk-1',
      buildRequest({
        domain: 'cards',
        snapshot: {
          ...CARDS_SNAPSHOT,
          cards: {
            ...CARDS_SNAPSHOT.cards,
            open: {
              id: 'denia',
              name: 'Denia',
              work: '鸣潮',
              imageCount: 1,
              hasProfile: false,
              look: '',
              identity: '',
              behavior: '',
              speech: '',
              backstory: '',
              boundaries: '',
              catchphrases: '',
              moods: '',
              scenario: '',
              opening: '',
              examples: '',
              tags: [],
              otherLooks: [],
              imagesOnCard: 1,
              primaryImageUrl: 'https://cdn.example.test/main.png',
            },
          },
        },
      }),
      new AbortController().signal,
    )
    prepared.run.mainModelLooks = true
    mockLlmTextCompletion.mockClear()

    const search = await planTool(
      prepared.run,
      ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
      { query: 'denia' },
      prepared.user.id,
    )
    if (search.kind !== 'read')
      throw new Error(`expected read, got ${search.kind}`)
    const { observation } = await search.run()

    expect(mockInspectWebImageCandidates).not.toHaveBeenCalled()
    // ⭐ 搜索期第三片：v3 按编号交给角色卡（`#2`），⛔ 观察里不再有原图地址。
    expect(observation).toContain('#2 · example.test · usable as reference')
    expect(observation).toContain('propose them by number ("#2")')
    expect(observation).not.toContain('https://')
    for (const verdictWord of [
      'LOOKED',
      'NOT VIEWED',
      'could NOT look',
      'seen:',
    ])
      expect(observation).not.toContain(verdictWord)
    expect(prepared.run.webImageVision.size).toBe(0)
    expectSelectedProviderOnly(
      [
        ...providerUsesOf(mockInspectWebImageCandidates, 'web-image vision'),
        ...providerUsesOf(mockLlmTextCompletion, 'main model'),
      ],
      { adapterType: AI_ADAPTER_TYPES.GEMINI },
    )
  })
})

const LORA_SNAPSHOT: AssistantOperatorRequest['snapshot'] = {
  prompt: '',
  negativePrompt: '',
  model: { id: 'illustrious-xl', label: 'Illustrious XL' },
  availableModels: [
    { id: 'illustrious-xl', label: 'Illustrious XL' },
    { id: 'anima-dit-base-v10-runner', label: 'Anima DiT' },
  ],
  references: { items: [], limit: 2 },
  loras: {
    items: [
      {
        id: 'lora-asset-1',
        name: 'Ink Lines',
        weight: 0.8,
        enabled: true,
        family: 'illustrious',
        compatible: true,
        triggerWord: 'ink lines',
        triggerEnabled: true,
        recommendedPrompt: null,
        sourcePrompts: [],
      },
    ],
    baseFamily: 'illustrious',
    minWeight: 0.1,
    maxWeight: 2,
  },
}

/**
 * ⭐ **查证与找图两入口**（v2 §9，commit #16）。
 *
 * 钉五件事：两个 `action` 各自落到哪条实现、改写那一步的三语查询真的发了出去、
 * 印证 / 单源与证据编号进得了观察与结果、「再多找几个源」是**加源**、配额照旧。
 */
describe('查证与找图两入口（§9，commit #16）', () => {
  const ITEM = {
    id: 'moegirl:shiye',
    sourceId: 'moegirl' as const,
    sourceTier: 'community' as const,
    retrievedAt: '2026-09-11T00:00:00.000Z',
    title: '萌娘百科 · 时夜',
    url: 'https://zh.moegirl.org.cn/shiye',
    kind: 'text' as const,
    excerpt: '黑色长发，金色瞳孔。',
  }

  function queueOutcome(
    evidence: Record<string, unknown>[],
    items: unknown[] = [ITEM],
  ) {
    mockRunAssistantResearch.mockResolvedValue({
      queries: ['无限大 时夜', 'Ananta Shiye', 'アナンタ 時夜'],
      sources: ['wiki', 'web', 'danbooru'],
      evidence,
      items,
      receipts: [{ sourceId: 'moegirl', status: 'ok', count: 1, tookMs: 9 }],
    })
  }

  const CORROBORATED = {
    title: '萌娘百科 · 时夜',
    url: 'https://zh.moegirl.org.cn/shiye',
    publisher: 'zh.moegirl.org.cn',
    snippet: '黑色长发，金色瞳孔。',
    kind: 'text' as const,
    confidence: 'medium' as const,
    credibility: 'reference' as const,
    scope: 'character' as const,
    corroboration: 2,
    publishedAt: '2024-05-12',
  }

  /**
   * ⭐ **短版**（搜索期第三片，附录 I §二 6「一次搜索最多 6×300 + 3×1600 字的摘要写进本轮记录，
   *   之后每一步都重发」）：整段只给紧跟着的那一步；`compact` 一行一条「[n] 标题 · 域名 · 一句话」，
   *   号与整段里的一样，要全文 `read "[n]"`。
   */
  it('⭐ 快搜满载（6 条摘要 + 3 页全文）：短版一行一条、号不变，⛔ 不带摘录与地址，长度压到整段的零头', async () => {
    const evidence = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) => ({
      ...CORROBORATED,
      title: `来源 ${id} · 时夜的外貌与服饰`,
      url: `https://site-${id}.test/shiye`,
      publisher: `site-${id}.test`,
      snippet:
        `第 ${index + 1} 条：${'黑色长发，金色瞳孔，改良中式长衫。'.repeat(20)}`.slice(
          0,
          ASSISTANT_RESEARCH_LIMITS.maxEvidenceSnippetChars,
        ),
      corroboration: index < 3 ? 2 : 1,
    }))
    // ⚠ 扇出的契约：投影（evidence）与原件（items）逐项对得上。
    queueOutcome(
      evidence,
      evidence.map((item, index) => ({
        ...ITEM,
        id: `web:${index}`,
        sourceId: 'web' as const,
        title: item.title,
        url: item.url,
        excerpt: item.snippet,
      })),
    )
    mockReadUrl.mockImplementation(async (url: string) => ({
      url,
      // 记号放在一句话摘要与结论都截不到的地方（第 325 字之后），只有整段里有它。
      content: `${'外貌与服饰那一段讲得很细。'.repeat(25)}PAGE-BODY${'外貌与服饰那一段讲得很细。'.repeat(175)}`,
    }))
    const prepared = await prepareOperatorTurn(
      'clerk-1',
      buildRequest(),
      new AbortController().signal,
    )
    const plan = await planTool(
      prepared.run,
      ASSISTANT_OPERATOR_TOOL_IDS.research,
      { goal: '外貌与服饰', entities: ['无限大', '时夜'] },
      prepared.user.id,
    )
    if (plan.kind !== 'read') throw new Error(`expected read, got ${plan.kind}`)
    const { observation, compact } = await plan.run()

    // 整段：3 页全文顶掉了前三条的摘要。
    expect(observation.match(/PAGE-BODY/g)).toHaveLength(
      ASSISTANT_RESEARCH_LIMITS.quickReadPages,
    )
    expect(compact).toBeDefined()
    const lines = compact!.split('\n')
    expect(lines.filter((line) => /^ {2}\[\d+\] /.test(line))).toHaveLength(6)
    expect(compact).toContain('[1] 来源 a · 时夜的外貌与服饰 · site-a.test · ')
    expect(compact).toContain('[6] 来源 f · 时夜的外貌与服饰 · site-f.test · ')
    expect(compact).toContain('single source')
    expect(compact).toContain('read "[n]"')
    expect(compact).not.toContain('PAGE-BODY')
    expect(compact).not.toContain('https://')
    for (const line of lines.filter((line) => /^ {2}\[\d+\] /.test(line)))
      expect(line.length).toBeLessThan(
        ASSISTANT_WEB_FIND_LIMITS.maxLineTitleChars +
          ASSISTANT_RESEARCH_LIMITS.maxCompactGistChars +
          60,
      )
    expect(compact!.length * 4).toBeLessThan(observation.length)
  })
})

describe('current reference image bindings', () => {
  const refs = [
    { url: 'https://cdn.test/female.png' },
    { url: 'https://cdn.test/male.png' },
    { url: 'https://cdn.test/pose.png' },
    { url: 'https://cdn.test/style.png' },
  ]
  const facts = {
    identity: 'Recognizable face and costume',
    pose: 'Visible limb positions',
    characterEvidence: {
      face: {
        support: 'clear' as const,
        observations: ['Pink eyes and a small cheek mole'],
        limitations: [],
      },
      upperBody: {
        support: 'partial' as const,
        observations: ['A loose jacket covers the shoulders and torso'],
        limitations: ['The jacket conceals the waist and torso shape'],
      },
      fullBodyProportions: {
        support: 'unknown' as const,
        observations: [],
        limitations: ['The image is cropped at the waist'],
      },
      legs: {
        support: 'unknown' as const,
        observations: [],
        limitations: ['Neither leg is visible'],
      },
      sideView: {
        support: 'unknown' as const,
        observations: [],
        limitations: ['Only a frontal view is shown'],
      },
      backView: {
        support: 'unknown' as const,
        observations: [],
        limitations: ['The back is not shown'],
      },
    },
    style: {
      renderingMedium: '3d_stylized' as const,
      rendering:
        'Stylized 3D NPR with volumetric hair and material-specific reflections',
      proportions: 'Stylized',
      contours: 'Clean',
      shading: 'Soft',
      materials: 'Matte',
      palette: 'Muted',
      lighting: 'Diffuse',
    },
    scene: 'Source background',
    uncertainties: [],
  }

  it.each(['image', 'lora'] as const)(
    'v3（skipReferenceReview）在 %s 台写词：⛔ 不补读参考图、不起简报',
    async (domain) => {
      queueTurns()
      const prepared = await prepareOperatorTurn(
        'clerk-1',
        buildRequest({
          domain,
          messages: [{ role: 'user', content: '按参考写一段提示词' }],
          snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
        }),
        new AbortController().signal,
      )
      prepared.run.skipReferenceReview = true
      mockLlmTextCompletion.mockClear()
      const write = await planTool(
        prepared.run,
        ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
        {
          value: 'two characters embracing, white background',
          overwrite: true,
        },
        prepared.user.id,
      )
      expect(write.kind).toBe('mutate')
      expect(mockLlmTextCompletion).not.toHaveBeenCalled()
    },
  )

  it('新内核在 LoRA 台可挂 LoRA：只认这一轮查到的候选', async () => {
    queueTurns()
    const prepared = await prepareOperatorTurn(
      'clerk-1',
      buildRequest({
        domain: 'lora',
        messages: [{ role: 'user', content: '挂个 LoRA' }],
        snapshot: LORA_SNAPSHOT,
      }),
      new AbortController().signal,
    )
    prepared.run.nextKernel = true
    const mount = await planTool(
      prepared.run,
      ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
      { candidateId: 'not-found' },
      prepared.user.id,
    )
    expect(mount.kind).toBe('rejected')
    expect(JSON.stringify(mount)).toContain('not one of the LoRAs found')
  })

  describe('canvas target reference checks', () => {
    const targetUrls = [refs[2]!.url, refs[0]!.url]
    const targetNode: AssistantOperatorCanvasNode = {
      id: 'portrait-target',
      name: '正面基准',
      kind: 'image',
      model: 'seedream-4',
      text: 'Keep the observed face.',
      referenceUrls: targetUrls,
      referencePromptContext:
        'Image 1 = "姿势参考"; Image 2 = "正脸参考". Use a white background.',
      reviewContextComplete: true,
    }
    function canvasRequest(
      node: AssistantOperatorCanvasNode = targetNode,
      overrides: Partial<AssistantOperatorRequest> = {},
    ) {
      return buildRequest({
        domain: 'canvas',
        responseLanguage: 'chinese',
        messages: [
          { role: 'user', content: '为正面基准写入单张半身肖像提示词' },
        ],
        referenceProfiles: refs.map(({ url }) => ({ url, ...facts })),
        ...overrides,
        snapshot: {
          prompt: '',
          availableModels: [],
          references: { items: [refs[3]!, refs[1]!], limit: 4 },
          canvas: {
            currentShotNo: null,
            selectedNodeIds: [node.id],
            shots: [
              {
                expanded: true,
                shotNo: null,
                title: 'Unassigned',
                nodes: [node],
              },
            ],
          },
        },
      })
    }

    it('v3（skipReferenceReview）：写词与出图前⛔ 不另看参考图 —— 不分析、不简报、不补图例', async () => {
      queueTurns()
      const prepared = await prepareOperatorTurn(
        'clerk-1',
        canvasRequest(),
        new AbortController().signal,
      )
      prepared.run.skipReferenceReview = true
      mockLlmTextCompletion.mockClear()
      const write = await planTool(
        prepared.run,
        ASSISTANT_OPERATOR_TOOL_IDS.canvasApply,
        {
          op: 'set_prompt',
          target: targetNode.id,
          prompt: 'Single half-body portrait.',
          mode: 'replace',
        },
        prepared.user.id,
      )
      expect(write).toMatchObject({
        kind: 'mutate',
        payload: expect.objectContaining({
          prompt: 'Single half-body portrait.',
        }),
      })
      const generate = await planTool(
        prepared.run,
        ASSISTANT_OPERATOR_TOOL_IDS.canvasGenerate,
        { target: targetNode.id },
        prepared.user.id,
      )
      expect(generate.kind).toBe('confirmGenerate')
      expect(mockLlmTextCompletion).not.toHaveBeenCalled()
    })
  })
})

/**
 * **v3 收尾**（P2 §2.5）：⛔ 不起结账那一跳；证据编号确定性地落一条记录；记忆在后台抽、
 * 不挡 `done`，这一轮的那一家、那个型号（⛔ 换快档）、`low` 档，隐身 / 「让助手记住」关 / 空账本照旧一条不写。
 */
describe('v3 收尾（P2 §2.5）', () => {
  const CONVERSATION_ID = '66666666-6666-4666-8666-666666666666'
  const MEMORIES = JSON.stringify({
    memories: [{ kind: 'preference', text: '偏好横构图 16:9' }],
  })

  async function prepare(extra: Partial<AssistantOperatorRequest> = {}) {
    queueTurns()
    const prepared = await prepareOperatorTurn(
      'clerk-1',
      buildRequest({ conversationId: CONVERSATION_ID, ...extra }),
      new AbortController().signal,
    )
    mockLlmTextCompletion.mockClear()
    mockAfter.mockClear()
    return prepared
  }

  /** `after` 收下的那几样 —— 等它们跑完（Vercel 上函数也是等它们跑完才退）。 */
  async function settleAfter() {
    await Promise.all(
      mockAfter.mock.calls.map(([task]) =>
        typeof task === 'function' ? (task as () => unknown)() : task,
      ),
    )
  }

  function llmInputs() {
    return mockLlmTextCompletion.mock.calls.map(
      ([input]) =>
        input as {
          systemPrompt: string
          modelId?: string
          reasoningEffort?: string
          signal?: AbortSignal
        },
    )
  }

  it('⭐ 不起结账那一跳；记忆在后台抽，收尾不等它', async () => {
    const { run, user } = await prepare()
    recordLedgerStep(run, ASSISTANT_OPERATOR_VERB_IDS.look, '看图', '黑长直')
    let release: (raw: string) => void = () => undefined
    mockLlmTextCompletion.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          release = resolve
        }),
    )

    const summary = await closeRoundV3(run, {
      clerkId: 'clerk-1',
      userId: user.id,
      closingMessage: '挑好了。',
    })

    // 收尾已经回来了，抽记忆那一跳还挂着：`done` 不等它。
    expect(summary).toBeUndefined()
    expect(mockRecordMemories).not.toHaveBeenCalled()
    const inputs = llmInputs()
    expect(inputs).toHaveLength(1)
    expect(inputs[0]?.systemPrompt).toMatch(/^You pick what/)
    expect(
      inputs.some((input) =>
        input.systemPrompt.startsWith('You write the creator-facing closing'),
      ),
    ).toBe(false)
    // 后台那一跳有自己的时限，⛔ 不挂这一轮的 signal。
    expect(inputs[0]?.signal).toBeDefined()
    expect(inputs[0]?.signal).not.toBe(run.signal)
    expect(mockAfter).toHaveBeenCalled()

    release(MEMORIES)
    await settleAfter()
    expect(mockRecordMemories).toHaveBeenCalledTimes(1)
    expect(mockRecordMemories.mock.calls[0]?.[0]).toMatchObject({
      userId: user.id,
      scope: 'image',
      conversationId: CONVERSATION_ID,
      candidates: [{ kind: 'preference', text: '偏好横构图 16:9' }],
    })
  })

  it('这一轮的那一家、那个型号、那把 key（全跟助手），low 档；材料里有这一轮的账本与收尾那句', async () => {
    const { run, user } = await prepare()
    recordLedgerStep(run, ASSISTANT_OPERATOR_VERB_IDS.look, '看图', '黑长直')
    mockLlmTextCompletion.mockResolvedValueOnce(MEMORIES)

    await closeRoundV3(run, {
      clerkId: 'clerk-1',
      userId: user.id,
      closingMessage: '挑好了。',
    })
    await settleAfter()

    const call = mockLlmTextCompletion.mock.calls[0]?.[0] as {
      adapterType: string
      apiKey: string
      modelId?: string
      reasoningEffort?: string
      userPrompt: string
    }
    expect(call.adapterType).toBe(run.route.adapterType)
    expect(call.apiKey).toBe(run.route.apiKey)
    expect(run.modelId).toBeTruthy()
    expect(call.modelId).toBe(run.modelId)
    expect(call.reasoningEffort).toBe('low')
    expect(call.userPrompt).toContain('看图: 黑长直')
    expect(call.userPrompt).toContain('HOW THE ASSISTANT CLOSED:\n挑好了。')
  })

  it('⛔ 不换同一家的快档：选了 Claude Opus，抽记忆也用 Opus', async () => {
    const { run, user } = await prepare()
    run.route = { ...run.route, adapterType: AI_ADAPTER_TYPES.ANTHROPIC }
    run.modelId = LLM_TEXT_MODEL_IDS.CLAUDE_OPUS_5_5
    recordLedgerStep(run, ASSISTANT_OPERATOR_VERB_IDS.look, '看图', '黑长直')
    mockLlmTextCompletion.mockResolvedValueOnce(MEMORIES)

    await closeRoundV3(run, { clerkId: 'clerk-1', userId: user.id })
    await settleAfter()

    expect(llmInputs()[0]).toMatchObject({
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
      modelId: LLM_TEXT_MODEL_IDS.CLAUDE_OPUS_5_5,
    })
  })

  it('⭐ 这一轮落了证据：确定性地写一条只带编号的记录，三栏空着', async () => {
    const { run, user } = await prepare()
    run.evidenceRefs.push('#e1', '#e2')

    const summary = await closeRoundV3(run, {
      clerkId: 'clerk-1',
      userId: user.id,
    })

    expect(mockAppendAssistantConversationRound).toHaveBeenCalledTimes(1)
    expect(
      mockAppendAssistantConversationRound.mock.calls[0]?.[2],
    ).toMatchObject({
      facts: [],
      decisions: [],
      todos: [],
      evidenceRefs: ['#e1', '#e2'],
    })
    expect(summary).toMatchObject({
      evidenceRefs: ['#e1', '#e2'],
      roundIndex: 3,
    })
    // 空账本：没东西可记，后台那一跳也不起。
    expect(mockLlmTextCompletion).not.toHaveBeenCalled()
  })

  it('没落证据：不写记录（面板不画结论记录，三栏没有读者）', async () => {
    const { run, user } = await prepare()
    recordLedgerStep(run, ASSISTANT_OPERATOR_VERB_IDS.look, '看图', '黑长直')
    mockLlmTextCompletion.mockResolvedValueOnce(MEMORIES)

    expect(
      await closeRoundV3(run, { clerkId: 'clerk-1', userId: user.id }),
    ).toBeUndefined()
    await settleAfter()
    expect(mockAppendAssistantConversationRound).not.toHaveBeenCalled()
  })

  it('⛔ 隐身开着：后台那一跳不起，一条都不写；证据记录照常', async () => {
    const { run, user } = await prepare({ incognito: true })
    recordLedgerStep(run, ASSISTANT_OPERATOR_VERB_IDS.look, '看图', '黑长直')
    run.evidenceRefs.push('#e1')

    const summary = await closeRoundV3(run, {
      clerkId: 'clerk-1',
      userId: user.id,
    })
    await settleAfter()

    expect(mockLlmTextCompletion).not.toHaveBeenCalled()
    expect(mockRecordMemories).not.toHaveBeenCalled()
    expect(summary).toMatchObject({ evidenceRefs: ['#e1'], incognito: true })
  })

  it('⛔ 「让助手记住」关着 / 账本是空的：后台那一跳不起', async () => {
    mockGetAssistantPersonaByUserId.mockResolvedValue({
      ...ASSISTANT_PERSONA_DEFAULTS,
      avatarUrl: null,
      memoryCapture: false,
    })
    const off = await prepare()
    recordLedgerStep(
      off.run,
      ASSISTANT_OPERATOR_VERB_IDS.look,
      '看图',
      '黑长直',
    )
    await closeRoundV3(off.run, { clerkId: 'clerk-1', userId: off.user.id })
    await settleAfter()
    expect(mockLlmTextCompletion).not.toHaveBeenCalled()

    mockGetAssistantPersonaByUserId.mockResolvedValue({
      ...ASSISTANT_PERSONA_DEFAULTS,
      avatarUrl: null,
    })
    const empty = await prepare()
    await closeRoundV3(empty.run, {
      clerkId: 'clerk-1',
      userId: empty.user.id,
      closingMessage: '你好呀。',
    })
    await settleAfter()

    expect(mockLlmTextCompletion).not.toHaveBeenCalled()
    expect(mockRecordMemories).not.toHaveBeenCalled()
  })

  it('抽记忆失败：只记一行，⛔ 不抛', async () => {
    const warn = vi.spyOn(logger, 'warn')
    const { run, user } = await prepare()
    recordLedgerStep(run, ASSISTANT_OPERATOR_VERB_IDS.look, '看图', '黑长直')
    mockLlmTextCompletion.mockRejectedValueOnce(new Error('provider down'))

    await expect(
      closeRoundV3(run, { clerkId: 'clerk-1', userId: user.id }),
    ).resolves.toBeUndefined()
    await settleAfter()

    expect(mockRecordMemories).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      'assistant round memories not stored',
      expect.objectContaining({ error: 'provider down' }),
    )
  })

  it('以确认卡收：一步都没跑成就不收；跑过的把那条待办记进原料，一次运行只收一次', async () => {
    const idle = await prepare()
    expect(
      await closeRoundV3BeforeStop(idle.run, {
        clerkId: 'clerk-1',
        userId: idle.user.id,
        todo: '等你确认生成 2 张',
      }),
    ).toBeUndefined()
    expect(mockLlmTextCompletion).not.toHaveBeenCalled()

    const { run, user } = await prepare()
    recordLedgerStep(run, ASSISTANT_OPERATOR_VERB_IDS.look, '看图', '黑长直')
    mockLlmTextCompletion.mockResolvedValue(MEMORIES)
    await closeRoundV3BeforeStop(run, {
      clerkId: 'clerk-1',
      userId: user.id,
      todo: '等你确认生成 2 张',
    })
    await closeRoundV3(run, { clerkId: 'clerk-1', userId: user.id })
    await settleAfter()

    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
    expect(
      (mockLlmTextCompletion.mock.calls[0]?.[0] as { userPrompt: string })
        .userPrompt,
    ).toContain('等你确认生成 2 张')
    expect(mockRecordMemories).toHaveBeenCalledTimes(1)
  })

  it('⭐ P3：已有的编好号给模型看；replaces / forget 的编号换成 id，对不上的 replaces 当新加、对不上的 forget 丢掉', async () => {
    const { run, user } = await prepare()
    recordLedgerStep(run, ASSISTANT_OPERATOR_VERB_IDS.look, '看图', '黑长直')
    mockListMemoriesForReview.mockResolvedValueOnce([
      {
        id: 'm-a',
        kind: 'preference',
        text: '偏好竖构图 9:16',
        updatedAt: '2026-09-01T08:00:00.000Z',
      },
      {
        id: 'm-b',
        kind: 'fact',
        text: '主角叫小林',
        updatedAt: '2026-10-20T08:00:00.000Z',
      },
    ])
    mockLlmTextCompletion.mockResolvedValueOnce(
      JSON.stringify({
        memories: [
          { kind: 'preference', text: '偏好横构图 16:9', replaces: 1 },
          { kind: 'fact', text: '同一条改两次只认第一次', replaces: 1 },
          { kind: 'fact', text: '编号不存在就当新加', replaces: 9 },
        ],
        forget: [2, 7],
      }),
    )

    await closeRoundV3(run, { clerkId: 'clerk-1', userId: user.id })
    await settleAfter()

    const prompt = (
      mockLlmTextCompletion.mock.calls[0]?.[0] as { userPrompt: string }
    ).userPrompt
    expect(prompt).toContain(
      '#1 [preference, noted 2026-09-01] 偏好竖构图 9:16',
    )
    expect(prompt).toContain('#2 [fact, noted 2026-10-20] 主角叫小林')
    expect(mockRecordMemories).toHaveBeenCalledTimes(1)
    expect(mockRecordMemories.mock.calls[0]?.[0]).toMatchObject({
      scope: 'image',
      replacements: [
        {
          id: 'm-a',
          candidate: { kind: 'preference', text: '偏好横构图 16:9' },
        },
      ],
      forget: ['m-b'],
    })
    const recorded = mockRecordMemories.mock.calls[0]?.[0] as {
      candidates: { text: string }[]
    }
    expect(recorded.candidates.map((c) => c.text)).toContain(
      '编号不存在就当新加',
    )
  })

  it('P3：什么都不改（全空）就不调记忆服务', async () => {
    const { run, user } = await prepare()
    recordLedgerStep(run, ASSISTANT_OPERATOR_VERB_IDS.look, '看图', '黑长直')
    mockLlmTextCompletion.mockResolvedValueOnce(
      JSON.stringify({ memories: [], forget: [] }),
    )

    await closeRoundV3(run, { clerkId: 'clerk-1', userId: user.id })
    await settleAfter()

    expect(mockRecordMemories).not.toHaveBeenCalled()
  })

  it('⭐ 聊天会话记进这个角色（附录L 第二片：cards + 角色，故事里的事不进工作记忆）', async () => {
    const chatCharacterId = '11111111-1111-4111-8111-111111111111'
    mockGetAssistantPersonaByUserId.mockResolvedValue({
      ...ASSISTANT_PERSONA_DEFAULTS,
      avatarUrl: null,
      characterCardId: chatCharacterId,
      roleplay: { scenario: '', opening: '', examples: [] },
    })
    const { run, user } = await prepare({ chatCharacterId })
    recordLedgerStep(run, ASSISTANT_OPERATOR_VERB_IDS.look, '看图', '黑长直')
    mockLlmTextCompletion.mockResolvedValue(MEMORIES)

    await closeRoundV3(run, { clerkId: 'clerk-1', userId: user.id })
    await settleAfter()

    expect(mockListMemoriesForReview.mock.calls[0]?.[3]).toBe(chatCharacterId)
    expect(mockRecordMemories).toHaveBeenCalledTimes(1)
    expect(mockRecordMemories.mock.calls[0]?.[0]).toMatchObject({
      scope: 'cards',
      characterCardId: chatCharacterId,
    })
  })

  it('⛔ 会话角色没读成（卡删了，退回工作人设）：这一轮不自动记', async () => {
    const { run, user } = await prepare({
      chatCharacterId: '11111111-1111-4111-8111-111111111111',
    })
    recordLedgerStep(run, ASSISTANT_OPERATOR_VERB_IDS.look, '看图', '黑长直')
    mockLlmTextCompletion.mockResolvedValue(MEMORIES)

    await closeRoundV3(run, { clerkId: 'clerk-1', userId: user.id })
    await settleAfter()

    expect(mockRecordMemories).not.toHaveBeenCalled()
  })

  it('⭐ P3 第二片：角色页记进自己的 cards 域（⛔ 不往全局漏）', async () => {
    const { run, user } = await prepare({ domain: 'cards' })
    recordLedgerStep(run, ASSISTANT_OPERATOR_VERB_IDS.look, '看图', '黑长直')
    mockLlmTextCompletion.mockResolvedValue(MEMORIES)

    await closeRoundV3(run, { clerkId: 'clerk-1', userId: user.id })
    await settleAfter()

    expect(mockRecordMemories).toHaveBeenCalledTimes(1)
    expect(mockRecordMemories.mock.calls[0]?.[0]).toMatchObject({
      scope: 'cards',
    })
  })
})

/**
 * **结论注入与翻证据本**（v2 §7.6 / §7.3，commit #12）。
 *
 * ⭐ 这一组验的是「上一轮得出的结论下一轮还在不在」——§7.1 那张断点表的另一半。
 * 结账（上一组）把一轮压成四栏落进会话，这一组验它怎么回到系统提示里，
 * 以及证据正文怎么**按编号**取回（⛔ 而不是跟着每一轮重发）。
 */
describe('结论注入与 recall_evidence', () => {
  const CONVERSATION_ID = '55555555-5555-4555-8555-555555555555'

  /** v3 用不上上几轮的结论记录（P2）：准备时 ⛔ 不读；交回旧内核时补读一次。 */
  it('⛔ skipPriorRounds：开跑前不读那一跳', async () => {
    const prepared = await prepareOperatorTurn(
      'clerk-1',
      buildRequest({ conversationId: CONVERSATION_ID }),
      new AbortController().signal,
      { skipPriorRounds: true },
    )
    expect(mockListAssistantConversationRounds).not.toHaveBeenCalled()
    expect(prepared.run.priorRounds).toEqual([])
    expect(prepared.priorRoundsSkipped).toBe(true)
  })
})

/**
 * 联网**找视频**（搜索期第二片）：整张卡片进面板（步骤 result），模型只拿每条一行；
 * 召回只走平台那把 Serper key + B站连接器，来源名单照样管。
 */
describe('search_web_videos（搜索期第二片）', () => {
  const VIDEOS = [
    {
      sourceId: 'web_search',
      video: {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Wuthering Waves — Changli PV',
        platform: 'youtube',
        channel: 'Wuthering Waves',
        domain: 'youtube.com',
        durationSeconds: 209,
        thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      },
    },
    {
      sourceId: 'bilibili',
      video: {
        url: 'https://www.bilibili.com/video/BV1ji421e7nM',
        title: '《鸣潮》动画短片 | 今昔',
        platform: 'bilibili',
        domain: 'bilibili.com',
      },
    },
    {
      sourceId: 'web_search',
      video: {
        url: 'https://example.test/clip',
        title: 'Some clip',
        platform: 'other',
        domain: 'example.test',
      },
    },
  ]

  async function prepare(extra: Record<string, unknown> = {}) {
    queueTurns()
    return prepareOperatorTurn(
      'clerk-1',
      buildRequest(extra),
      new AbortController().signal,
    )
  }

  beforeEach(() => {
    mockIsWebVideoSearchConfigured.mockReturnValue(true)
    mockSearchWebVideos.mockResolvedValue({ hits: VIDEOS, blocked: 0 })
  })

  it('⭐ 模型只拿每条一行（#n · 标题 · 频道 · 平台 · 时长）；整张卡片进 result', async () => {
    const prepared = await prepare()
    const plan = await planTool(
      prepared.run,
      ASSISTANT_OPERATOR_TOOL_IDS.searchWebVideos,
      { query: '鸣潮 长离 PV' },
      prepared.user.id,
    )
    if (plan.kind !== 'read') throw new Error(`expected read, got ${plan.kind}`)
    // 中文查询 → 另问 B站；载荷如实记下。
    expect(plan.payload).toEqual({
      query: '鸣潮 长离 PV',
      limit: ASSISTANT_OPERATOR_LIMITS.maxWebVideoResults,
      bilibili: true,
    })
    const { observation, result } = await plan.run()
    expect(mockSearchWebVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        query: '鸣潮 长离 PV',
        serper: true,
        bilibili: true,
        bilibiliFirst: false,
      }),
    )
    expect(observation).toContain(
      '#1 · Wuthering Waves — Changli PV · Wuthering Waves · YouTube · 3:29',
    )
    expect(observation).toContain('#2 · 《鸣潮》动画短片 | 今昔 · bilibili')
    expect(observation).toContain('#3 · Some clip · example.test')
    expect(observation).toContain('NOT watched')
    // ⛔ 播放页 / 封面地址一样都不喂给模型。
    expect(observation).not.toContain('https://')
    // 编号进卡片数据（面板据此把回复里的 `#2` 指到那一张），与观察里那一行同号。
    expect(result).toEqual({
      totalFound: 3,
      videos: VIDEOS.map((hit, index) => ({ ...hit.video, n: index + 1 })),
    })
  })

  it('英文查询不问 B站；点名 B站时 B站排前', async () => {
    const prepared = await prepare()
    const plain = await planTool(
      prepared.run,
      ASSISTANT_OPERATOR_TOOL_IDS.searchWebVideos,
      { query: 'wuthering waves changli trailer' },
      prepared.user.id,
    )
    expect(plain.kind === 'read' && plain.payload).toMatchObject({
      bilibili: false,
    })

    const named = await planTool(
      prepared.run,
      ASSISTANT_OPERATOR_TOOL_IDS.searchWebVideos,
      { query: 'changli bilibili dance' },
      prepared.user.id,
    )
    if (named.kind !== 'read') throw new Error('expected read')
    expect(named.payload).toMatchObject({ bilibili: true })
    await named.run()
    expect(mockSearchWebVideos).toHaveBeenLastCalledWith(
      expect.objectContaining({ bilibili: true, bilibiliFirst: true }),
    )
  })

  it('来源名单：屏蔽了 B站这一组就⛔ 不打它；全屏蔽了如实说，一个请求都不发', async () => {
    mockListProjectSourceRules.mockResolvedValue([
      {
        id: 'r1',
        scope: null,
        text: 'bilibili',
        kind: 'sourceDeny',
        source: 'creator',
        createdAt: '2026-09-10T00:00:00.000Z',
      },
    ])
    const prepared = await prepare()
    const plan = await planTool(
      prepared.run,
      ASSISTANT_OPERATOR_TOOL_IDS.searchWebVideos,
      { query: '鸣潮 PV' },
      prepared.user.id,
    )
    if (plan.kind !== 'read') throw new Error('expected read')
    expect(plan.payload).toMatchObject({ bilibili: false })
    await plan.run()
    const [params] = mockSearchWebVideos.mock.calls.at(-1) as [
      { allows: (url: string, sourceId: string) => boolean },
    ]
    expect(
      params.allows('https://www.youtube.com/watch?v=x', 'web_search'),
    ).toBe(true)
    expect(
      params.allows('https://www.bilibili.com/video/BV1', 'bilibili'),
    ).toBe(false)

    mockListProjectSourceRules.mockResolvedValue([
      {
        id: 'r2',
        scope: null,
        text: 'wiki',
        kind: 'sourceAllow',
        source: 'creator',
        createdAt: '2026-09-10T00:00:00.000Z',
      },
    ])
    mockSearchWebVideos.mockClear()
    const blockedRun = await prepare()
    const blocked = await planTool(
      blockedRun.run,
      ASSISTANT_OPERATOR_TOOL_IDS.searchWebVideos,
      { query: '鸣潮 PV' },
      blockedRun.user.id,
    )
    if (blocked.kind !== 'read') throw new Error('expected read')
    const { observation } = await blocked.run()
    expect(observation).toContain('searched NOTHING')
    expect(mockSearchWebVideos).not.toHaveBeenCalled()
  })

  it('平台没配 Serper、查询也用不上 B站 → searchUnavailable，⛔ 不借别家的联网', async () => {
    mockIsWebVideoSearchConfigured.mockReturnValue(false)
    const prepared = await prepare()
    const plan = await planTool(
      prepared.run,
      ASSISTANT_OPERATOR_TOOL_IDS.searchWebVideos,
      { query: 'changli trailer' },
      prepared.user.id,
    )
    expect(plan.kind).toBe('rejected')
    expect(plan.kind === 'rejected' && plan.reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.searchUnavailable,
    )
    expect(mockLlmTextCompletion).not.toHaveBeenCalled()
  })

  it('一条都没找到：叫它换个说法再试一次，⛔ 编链接', async () => {
    mockSearchWebVideos.mockResolvedValue({ hits: [], blocked: 0 })
    const prepared = await prepare()
    const plan = await planTool(
      prepared.run,
      ASSISTANT_OPERATOR_TOOL_IDS.searchWebVideos,
      { query: 'changli trailer' },
      prepared.user.id,
    )
    if (plan.kind !== 'read') throw new Error('expected read')
    const { observation, result } = await plan.run()
    expect(result).toEqual({ totalFound: 0, videos: [] })
    expect(observation).toContain('came back empty')
    expect(observation).toContain('Do not invent videos')
  })
})

/**
 * 找图的观察只指模型够得着的路（搜索期第二片）：画布与 v3 的 LoRA 台没有 import_url，
 * 那里只说「创作者点『选用』」。
 */
describe('search_web_images · 观察只指够得着的路', () => {
  beforeEach(() => {
    mockIsWebImageSearchConfigured.mockReturnValue(true)
    mockWebImageSearchMulti.mockResolvedValue([
      {
        imageUrl: 'https://cdn.example.test/a.jpg',
        domain: 'example.test',
      },
    ])
  })

  async function observe(extra: Record<string, unknown>, v3 = false) {
    queueTurns()
    const prepared = await prepareOperatorTurn(
      'clerk-1',
      buildRequest(extra),
      new AbortController().signal,
    )
    if (v3) prepared.run.mainModelLooks = true
    const plan = await planTool(
      prepared.run,
      ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
      { query: 'wet asphalt' },
      prepared.user.id,
    )
    if (plan.kind !== 'read') throw new Error(`expected read, got ${plan.kind}`)
    return (await plan.run()).observation
  }

  it('图片台照旧：两条路（「选用」或 import_user_url）', async () => {
    expect(await observe({})).toContain('import_user_url')
  })

  it('画布：⛔ 不提 import_user_url，只说「选用」', async () => {
    const observation = await observe({
      domain: 'canvas',
      snapshot: {
        prompt: '',
        availableModels: [],
        canvas: { currentShotNo: null, selectedNodeIds: [], shots: [] },
      },
    })
    expect(observation).not.toContain('import_user_url')
    expect(observation).toContain('"use this"')
  })

  it('v3 的 LoRA 台：⛔ 不提 import_user_url', async () => {
    const observation = await observe(
      { domain: 'lora', snapshot: LORA_SNAPSHOT },
      true,
    )
    expect(observation).not.toContain('import_user_url')
    expect(observation).toContain('"use this"')
  })
})

describe('同一轮先挂参考图再设要图的专属项（10-27 标签台真机）', () => {
  async function naiRun(
    model = { id: 'nai-diffusion-4-5-full', label: 'NovelAI V4.5 Full' },
  ) {
    queueTurns()
    const prepared = await prepareOperatorTurn(
      'clerk-1',
      buildRequest({
        snapshot: {
          ...SNAPSHOT,
          model,
          capabilities: [
            {
              key: 'novelAiReferenceMode',
              kind: 'select',
              value: null,
              defaultValue: 'standard',
              options: ['standard', 'precise'],
              available: false,
            },
          ],
          references: { items: [], limit: 1 },
        },
      }),
      new AbortController().signal,
    )
    prepared.run.searchIndex.set('asset-1', {
      assetId: 'asset-1',
      displayName: '图_1215',
      url: 'https://cdn.example.com/a.png',
      kind: 'image',
    })
    return prepared
  }

  it('挂上之后要图的那一项当场可设；位满时说清占位的是谁、怎么换', async () => {
    const prepared = await naiRun()
    const plan = (tool: string, args: Record<string, unknown>) =>
      planTool(prepared.run, tool as never, args as never, prepared.user.id)
    const before = await plan(ASSISTANT_OPERATOR_TOOL_IDS.setCapability, {
      key: 'novelAiReferenceMode',
      value: 'precise',
    })
    expect(before).toMatchObject({
      kind: 'rejected',
      reason: 'referenceRequired',
    })
    const mount = await plan(ASSISTANT_OPERATOR_TOOL_IDS.mountReference, {
      assetId: 'asset-1',
    })
    expect(mount.kind).toBe('mutate')
    if (mount.kind === 'mutate') mount.apply?.()
    const after = await plan(ASSISTANT_OPERATOR_TOOL_IDS.setCapability, {
      key: 'novelAiReferenceMode',
      value: 'precise',
    })
    expect(after.kind).toBe('mutate')
    const again = await plan(ASSISTANT_OPERATOR_TOOL_IDS.mountReference, {
      assetId: 'asset-1',
    })
    expect(again).toMatchObject({ kind: 'rejected', reason: 'referencesFull' })
    expect(JSON.stringify(again)).toContain('remove_reference ref-N')
  })

  it('V4.5：挂图 → 开精确参考 → 两个滑块都设得上；img2img 强度此时说明不生效', async () => {
    const prepared = await naiRun()
    const plan = async (tool: string, args: Record<string, unknown>) => {
      const result = await planTool(
        prepared.run,
        tool as never,
        args as never,
        prepared.user.id,
      )
      if (result.kind === 'mutate') result.apply?.()
      return result
    }
    await plan(ASSISTANT_OPERATOR_TOOL_IDS.mountReference, {
      assetId: 'asset-1',
    })
    const early = await plan(ASSISTANT_OPERATOR_TOOL_IDS.setCapability, {
      key: 'preciseReferenceStrength',
      value: 0.5,
    })
    expect(JSON.stringify(early)).toContain(
      'only takes effect once novelAiReferenceMode is precise',
    )
    expect(
      (
        await plan(ASSISTANT_OPERATOR_TOOL_IDS.setCapability, {
          key: 'novelAiReferenceMode',
          value: 'precise',
        })
      ).kind,
    ).toBe('mutate')
    for (const [key, value] of [
      ['preciseReferenceStrength', 0.8],
      ['preciseReferenceFidelity', 0.6],
    ] as const) {
      const result = await plan(ASSISTANT_OPERATOR_TOOL_IDS.setCapability, {
        key,
        value,
      })
      expect(result.kind).toBe('mutate')
      expect(JSON.stringify(result)).not.toContain('only takes effect')
    }
    const img2img = await plan(ASSISTANT_OPERATOR_TOOL_IDS.setCapability, {
      key: 'referenceStrength',
      value: 0.8,
    })
    expect(JSON.stringify(img2img)).toContain(
      'Ignored while novelAiReferenceMode is precise',
    )
    expect(
      prepared.run.state.capabilities.find(
        (item) => item.key === 'preciseReferenceFidelity',
      )?.value,
    ).toBe(0.6)
  })

  it('V5：没有精确参考 —— 拒因是「台上没有这一项」，并指向换模型', async () => {
    const prepared = await naiRun({
      id: 'nai-diffusion-5-full',
      label: 'NovelAI V5 Full',
    })
    const mount = await planTool(
      prepared.run,
      ASSISTANT_OPERATOR_TOOL_IDS.mountReference as never,
      { assetId: 'asset-1' } as never,
      prepared.user.id,
    )
    if (mount.kind === 'mutate') mount.apply?.()
    const result = await planTool(
      prepared.run,
      ASSISTANT_OPERATOR_TOOL_IDS.setCapability as never,
      { key: 'novelAiReferenceMode', value: 'precise' } as never,
      prepared.user.id,
    )
    expect(result).toMatchObject({ kind: 'rejected', reason: 'notOnBench' })
    expect(JSON.stringify(result)).toContain('set_model')
  })
})
