import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_OPERATOR_CONFIRM_CHOICES,
  ASSISTANT_OPERATOR_CONFIRM_FIELDS,
  ASSISTANT_OPERATOR_CONFIRM_KIND_IDS,
  ASSISTANT_EVIDENCE_RECALL_LIMITS,
  ASSISTANT_OPERATOR_DOMAINS,
  ASSISTANT_OPERATOR_ENTRY_ACTIONS,
  ASSISTANT_OPERATOR_ENTRY_ACTIONS_BY_DOMAIN,
  ASSISTANT_OPERATOR_ENTRY_ACTION_VALUES,
  ASSISTANT_OPERATOR_INTERNAL_TOOLS,
  ASSISTANT_OPERATOR_RESEARCH_ACTIONS,
  ASSISTANT_OPERATOR_RESEARCH_ACTION_IDS,
  ASSISTANT_OPERATOR_ENTRY_TOOL_HINTS,
  ASSISTANT_OPERATOR_ENTRY_TOOL_IDS,
  ASSISTANT_OPERATOR_ENTRY_TOOLS,
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_ROUND_SUMMARY_LIMITS,
  ASSISTANT_OPERATOR_MUTATING_TOOLS,
  ASSISTANT_OPERATOR_READ_TOOLS,
  ASSISTANT_OPERATOR_SPEND_TOOLS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS,
  ASSISTANT_OPERATOR_SEARCH_KINDS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_STOP_REASONS,
  ASSISTANT_OPERATOR_TOOL_HINTS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  ASSISTANT_OPERATOR_TOOLS,
  ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN,
  ASSISTANT_OPERATOR_TOOL_VERBS,
  ASSISTANT_OPERATOR_VERBS,
  assistantOperatorEntryToolsInDomain,
  isAssistantOperatorEntryTool,
  isAssistantOperatorResearchAction,
  isInternalAssistantOperatorTool,
  isMutatingAssistantOperatorTool,
  resolveAssistantOperatorEntryAction,
  isRevertibleAssistantOperatorTool,
  isSpendAssistantOperatorTool,
  type AssistantOperatorTool,
} from '@/constants/assistant-operator'
import { ASSISTANT_STREAM_EVENTS } from '@/constants/assistant-stream'
import {
  ASSISTANT_OPERATOR_ENTRY_ARGS_SCHEMAS,
  ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS,
  AssistantOperatorAskArgsSchema,
  AssistantOperatorEventSchema,
  AssistantOperatorLoraCandidateSchema,
  AssistantOperatorLoraPickCandidateSchema,
  AssistantOperatorRequestSchema,
  AssistantOperatorRoundSummarySchema,
  AssistantOperatorRoundSummaryDraftSchema,
  AssistantOperatorSnapshotSchema,
  AssistantOperatorStepSchema,
  AssistantOperatorTurnSchema,
} from '@/types/assistant-operator'
import { OUTPUT_TYPE_VALUES } from '@/types'

/**
 * 每个工具一份**合法**的 step 载荷。
 *
 * ⚠ 写成 `Record<AssistantOperatorTool, …>` 是有意的：加一条工具而没在这里给
 * 载荷，编译期就红 —— 于是「新工具没人验它的 inverse」这件事不可能悄悄发生。
 */
const STEP_FIXTURES: Record<
  AssistantOperatorTool,
  { payload: unknown; inverse?: unknown; result?: unknown }
> = {
  [ASSISTANT_OPERATOR_TOOL_IDS.readState]: {
    payload: {},
    result: { digest: '- Prompt in the editor: (empty)' },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences]: {
    payload: {},
    result: {
      profiles: [],
      brief: {
        summary: 'A new scene',
        assignments: [],
        requirements: [],
        avoid: [],
        uncertainties: [],
      },
    },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.searchAssets]: {
    payload: { query: 'red umbrella', kind: 'image', limit: 6 },
    result: {
      totalFound: 12,
      assets: [
        {
          assetId: 'gen-1',
          url: 'https://cdn.example.com/a.png',
          kind: 'image',
        },
      ],
    },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders]: {
    payload: { query: 'hero', limit: 12 },
    result: {
      folders: [
        {
          folderId: 'folder-1',
          name: 'Hero',
          path: 'Characters / Hero',
          imageCount: 17,
        },
      ],
    },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder]: {
    payload: {
      folderId: 'folder-1',
      instruction: '挑出最适合做角色参考的三张',
    },
    result: {
      folder: {
        folderId: 'folder-1',
        name: 'Hero',
        path: 'Characters / Hero',
        imageCount: 17,
      },
      totalImages: 17,
      inspectedImages: 17,
      truncated: false,
      batchCount: 3,
      findings: [
        {
          assetId: 'asset-1',
          url: 'https://cdn.example.com/hero.png',
          thumbnailUrl: 'https://cdn.example.com/hero-thumb.webp',
          createdAt: '2026-08-31T00:00:00.000Z',
          observation: '正面半身角色图，面部和服装细节清楚',
          relevance: 'high',
          reason: '身份特征完整且遮挡少',
          tags: ['正面', '半身'],
        },
      ],
      batchSummaries: ['这一批以正面角色图为主'],
      uncertainties: [],
      visionAdapter: 'gemini',
      borrowedVisionRoute: false,
    },
  },
  /**
   * 联网搜图（P3-B）。⭐ 注意 `result.images` 里**没有 assetId** —— 那正是它与
   * 库内检索的全部区别：候选只是一串第三方地址，在用户点选转存之前它在本仓里
   * 不存在，所以 `mount_reference`（只吃 assetId）在类型上就够不着它。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages]: {
    payload: { query: 'pvc figure studio shot', limit: 8 },
    result: {
      totalFound: 1,
      images: [
        {
          imageUrl: 'https://cdn.example.com/web-a.jpg',
          thumbnailUrl: 'https://encrypted-tbn0.gstatic.com/web-a.jpg',
          pageUrl: 'https://example.com/post/a',
          domain: 'example.com',
          publisher: 'Example',
          usableAsInput: true,
          sourceVerdict: 'unknownLicense',
          title: 'PVC figure studio shot',
          width: 1600,
          height: 1200,
        },
      ],
    },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.searchWeb]: {
    payload: { query: 'wuthering waves jiyan official design', limit: 6 },
    result: {
      totalFound: 1,
      results: [
        {
          title: 'Jiyan — official character page',
          url: 'https://example.com/jiyan',
          snippet: 'General of the Midnight Rangers…',
          publisher: 'example.com',
        },
      ],
    },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.research]: {
    payload: {
      goal: 'appearance and outfit',
      entities: ['Ananta', 'Shiye'],
      sources: ['wiki', 'web', 'danbooru'],
      round: 1,
    },
    result: {
      totalFound: 2,
      conclusion: '黑色长发，金色瞳孔，身着改良中式长衫…',
      evidence: [
        {
          title: '萌娘百科 · 时夜',
          url: 'https://zh.moegirl.org.cn/%E6%97%B6%E5%A4%9C',
          publisher: 'zh.moegirl.org.cn',
          snippet: '黑色长发，金色瞳孔，身着改良中式长衫…',
          kind: 'text',
          confidence: 'medium',
          credibility: 'reference',
          scope: 'character',
          // §9.2 的两个新字段：会话内编号 + 印证源数（都由服务端给）。
          evidenceRef: '#e12',
          corroboration: 2,
          publishedAt: '2024-05-12',
        },
        {
          // ⚠ 标签档**没有 url** —— danbooru 的共现标签不指向单一页面。
          title: 'danbooru tags',
          publisher: 'danbooru',
          snippet: '100 张样本共现: black_hair, yellow_eyes, chinese_clothes',
          kind: 'tags',
          confidence: 'medium',
          credibility: 'reference',
          scope: 'character',
          evidenceRef: '#e13',
          corroboration: 1,
        },
      ],
    },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.readUrl]: {
    payload: {
      url: 'https://zh.moegirl.org.cn/%E6%97%B6%E5%A4%9C',
      focus: 'appearance and outfit',
    },
    result: {
      title: 'https://zh.moegirl.org.cn/%E6%97%B6%E5%A4%9C',
      url: 'https://zh.moegirl.org.cn/%E6%97%B6%E5%A4%9C',
      excerpt: '外貌：黑色长发…',
    },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.recallEvidence]: {
    payload: { refs: ['#e1', '#e2'] },
    result: {
      items: [
        {
          ref: '#e1',
          title: '时夜 - 萌娘百科',
          url: 'https://zh.moegirl.org.cn/%E6%97%B6%E5%A4%9C',
          source: 'moegirl',
          body: '外貌：黑色长发…',
        },
      ],
      missing: ['#e2'],
    },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.mountReference]: {
    payload: {
      assetId: 'gen-1',
      url: 'https://cdn.example.com/a.png',
      kind: 'image',
      slot: 'reference',
    },
    inverse: { assetId: 'gen-1', slot: 'reference' },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.setModel]: {
    payload: { modelId: 'seedream-4', modelLabel: 'Seedream 4' },
    inverse: { modelId: null },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.setPrompt]: {
    payload: { value: 'a girl under a red umbrella', mode: 'replace' },
    inverse: { value: '' },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.setNegative]: {
    payload: { value: 'blurry, lowres', mode: 'replace' },
    inverse: { value: '' },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.setSpecs]: {
    payload: { aspectRatio: '16:9', resolution: '2K' },
    inverse: { aspectRatio: '1:1', resolution: 'auto' },
  },
  /**
   * 视频规格（P4-A）。⭐ 载荷与逆操作**都带齐三格**（没有的那格是 `null`）——
   * 撤销因此一定落回一个真实存在过的三元组。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs]: {
    payload: { durationSeconds: 5, aspectRatio: '16:9', resolution: '720p' },
    inverse: {
      durationSeconds: 10,
      aspectRatio: '9:16',
      resolution: null,
    },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.setCount]: {
    payload: { count: 2 },
    inverse: { count: 1 },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference]: {
    payload: {
      assetId: 'gen-audio-1',
      url: 'https://cdn.example.com/line.mp3',
      label: '我不走',
      ownerName: '阿岚',
    },
    inverse: { assetId: 'gen-audio-1' },
  },
  /** ⚠ `inverse.enabled` 是 `null` —— 「用户没设过」那一档，撤销要回得去。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.setSound]: {
    payload: { enabled: false },
    inverse: { enabled: null },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate]: {
    payload: { primed: true },
    inverse: { primed: false },
  },
  /**
   * 花钱档（§6）。⚠ **没有 `inverse`** —— 这一条撤不掉，下面「读 / 改动型 / 花钱
   * 三张表恰好覆盖全表」那条用例就是这件事的证明。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration]: {
    payload: {
      model: { id: 'seedream-4', label: 'Seedream 4' },
      count: 2,
      specs: { aspectRatio: '1:1', resolution: '2K', durationSeconds: null },
      estimate: { credits: 6, model: 'Seedream 4', count: 2 },
    },
  },
  /**
   * 看图（P3-C）。⭐ 注意 `payload` 里带着 `imageUrl` —— 拍板 6「评价卡内嵌它评
   * 的那张图」是**契约里就有的字段**，不是渲染层的自觉；而它是服务端从请求里那份
   * `result` 抄过来的，模型给不出。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult]: {
    payload: {
      imageUrl: 'https://cdn.example.com/result.png',
      thumbnailUrl: 'https://cdn.example.com/result-thumb.png',
      modelLabel: 'Seedream 4',
      goal: 'a girl under a red umbrella',
    },
    result: {
      findings: [
        { severity: 'pass', text: '红伞是画面唯一的暖色，主体立住了' },
        { severity: 'fail', text: '雨丝糊成一片，看不出方向' },
      ],
      advice: '下一轮把雨的方向写进提示词',
      borrowedVisionRoute: false,
    },
  },
  /**
   * 用户递来的链接（P3-D，拍板 22）。⭐ 注意 `payload.url` 与 `inverse.url` 是
   * **同一条源地址**：落地地址此刻还不存在（取图那一跳在客户端），撤销只能按
   * 源地址反查。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl]: {
    payload: {
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Example.jpg',
      domain: 'upload.wikimedia.org',
    },
    inverse: {
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Example.jpg',
    },
  },
  /**
   * 找 LoRA（P4-C）。⭐ 注意候选投影里**没有 `importPayload`** —— 它只在真的要挂
   * 那一把时才需要，所以住在 `mount_lora` 的载荷上。每条候选都驮着它的下场是一串
   * 权重文件地址进日志、进上下文、再进历史。
   * ⭐ `sources` 每源一条：**空不是挂**（一个源挂了 vs 两个源都没命中，是两句话）。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.searchLoras]: {
    payload: { query: 'ghibli watercolor', limit: 6 },
    result: {
      totalFound: 2,
      candidates: [
        {
          candidateId: 'civitai:12345:67890',
          source: 'civitai',
          name: 'Watercolor Storybook',
          author: 'someone',
          family: 'illustrious',
          triggerWords: ['watercolor', 'storybook'],
          thumbnailUrl: 'https://cdn.example.com/lora-a.png',
          pageUrl: 'https://civitai.com/models/12345',
          downloads: 4200,
          licenseLabel: null,
          licenseKnown: true,
          commercialUse: ['Image', 'Sell'],
          importable: true,
          compatible: true,
          alreadyMounted: false,
          alreadyImported: false,
          defaultWeight: 0.8,
          recommended: false,
        },
      ],
      sources: [
        { source: 'civitai', status: 'ok', count: 1 },
        { source: 'huggingface', status: 'failed', count: 0 },
      ],
    },
  },
  /**
   * 挂一把 LoRA（P4-C）。⭐ 与 `import_user_url` 同构：`inverse` 里是
   * **candidateId** 而不是库记录 id —— 后者在服务端还不存在（导入那一跳在客户端）。
   * ⭐ `importPayload` 由服务端从本轮检索结果里抄过来，模型碰不到它。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.mountLora]: {
    payload: {
      candidateId: 'civitai:12345:67890',
      name: 'Watercolor Storybook',
      weight: 0.8,
      triggerWords: ['watercolor'],
      family: 'illustrious',
      compatible: true,
      importPayload: {
        name: 'Watercolor Storybook',
        triggerWord: 'watercolor',
        loraUrl: 'https://civitai.com/api/download/models/67890',
        type: 'style',
        baseModelFamily: 'illustrious',
        provider: 'civitai',
        sourceSnapshot: {
          source: 'civitai',
          author: 'someone',
          license: {
            label: null,
            commercialUse: ['Image', 'Sell'],
            allowDerivatives: true,
            allowNoCredit: false,
            known: true,
          },
          pageUrl: 'https://civitai.com/models/12345',
          revision: null,
          retrievedAt: '2026-08-31T00:00:00.000Z',
          fileSizeBytes: null,
          metadataCompleteness: 'partial',
        },
      },
    },
    inverse: { candidateId: 'civitai:12345:67890' },
  },
  /** ⚠ 逆操作带着**改前的权重** —— 撤销要把它挂回原来那个数，不是挂回默认值。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.unmountLora]: {
    payload: { loraId: 'lora-asset-1', name: 'Watercolor Storybook' },
    inverse: { loraId: 'lora-asset-1', weight: 0.8 },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight]: {
    payload: {
      loraId: 'lora-asset-1',
      name: 'Watercolor Storybook',
      weight: 1,
    },
    inverse: { loraId: 'lora-asset-1', weight: 0.8 },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.readProjectRules]: {
    payload: { scope: null },
    result: {
      rules: [
        {
          id: 'rule-1',
          scope: null,
          text: 'Never put text inside the picture.',
          source: 'creator',
          createdAt: '2026-09-01T10:00:00.000Z',
        },
      ],
    },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule]: {
    payload: {
      ruleId: 'rule-2',
      scope: 'image',
      text: 'Skin tones stay warm on this project.',
      source: 'assistant',
      createdAt: '2026-09-06T10:00:00.000Z',
    },
    inverse: { ruleId: 'rule-2' },
  },
  /** 上下文卡两条（K1）——都是读，所以都没有 `inverse`。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.listContextCards]: {
    payload: { kind: null },
    result: {
      cards: [
        {
          id: 'card-1',
          kind: 'character',
          name: 'Sigrika',
          summary: 'Silver hair, gold eyes, control-room mech suit.',
          hasNegative: true,
          imageCount: 2,
          pinnedScopes: ['video'],
        },
      ],
    },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.readContextCard]: {
    payload: { cardId: 'card-1' },
    result: {
      id: 'card-1',
      kind: 'character',
      name: 'Sigrika',
      summary: 'Silver hair, gold eyes, control-room mech suit.',
      body: '## Appearance\nSilver hair, gold eyes.',
      images: [
        {
          url: 'https://cdn.example.com/context-cards/u1/sheet.png',
          role: 'sheet',
          sourceRef: 'official site',
        },
      ],
      negative: 'air ripples, holographic overlay',
      pinnedScopes: ['video'],
      status: 'confirmed',
      createdAt: '2026-09-07T10:00:00.000Z',
      updatedAt: '2026-09-07T10:00:00.000Z',
    },
  },
  /**
   * 提议一张卡（v2 §8.1）——**读类**：一行库都没写，所以没有 `inverse`。
   * ⚠ 这条工具在真实链路上通常不出 step（它的产出是一帧 `confirm(contextCard)`），
   * 契约照旧要有一份合法 step —— 判据与 `request_generation` 逐字同源。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.proposeContextCard]: {
    payload: {
      kind: 'character',
      name: 'Sigrika',
      summary: 'Silver hair, gold eyes, control-room mech suit.',
      body: '## Appearance\nSilver hair, gold eyes.',
      negative: 'air ripples',
    },
    result: { offered: true },
  },
  /**
   * 摆一张 LoRA 推荐卡（lora-assistant §10.2.2）——**读类**：一行库都没写、
   * 一把都没挂，所以没有 `inverse`（挂载那几条 step 是下一轮各自独立的
   * `mount_lora`，撤销撤在它们身上）。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.planLoraPick]: {
    payload: {
      question: '这三把里你要挂哪几把？',
      candidateIds: ['civitai:1', 'hf:owner/name'],
    },
    result: { offered: true },
  },
  /** 切片 X：`inverse` 里是**旧值**，撤销 = 写回去。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.setReviewState]: {
    payload: {
      assetId: 'gen-1',
      state: 'blocked',
      reason: 'hands are mangled',
      displayName: '图_012·银发少女',
      url: 'https://cdn.example.com/a.png',
    },
    inverse: { assetId: 'gen-1', state: 'pending' },
  },
  /**
   * 素材库四条（§10）—— 每一条的 `inverse` 都是**逐条原值**。
   *
   * ⚠ 收藏那条的固定件**故意混着** `true` / `false`：§10 那条 ⚠ 说的正是这一例
   * （一批里本来就收藏着的那几张，取反会误清），而只有混合的固定件才验得出
   * 「记的是原值」而不是「记的是取反」。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.tagAsset]: {
    payload: { tags: ['线稿'], assetIds: ['gen-1', 'gen-2'] },
    inverse: {
      entries: [
        { assetId: 'gen-1', tags: ['线稿'] },
        { assetId: 'gen-2', tags: ['线稿'] },
      ],
    },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset]: {
    payload: { value: true, assetIds: ['gen-1', 'gen-2'] },
    inverse: {
      entries: [
        { assetId: 'gen-1', value: false },
        { assetId: 'gen-2', value: true },
      ],
    },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.createFolder]: {
    payload: { folderId: 'folder-1', name: '角色参考', parentId: null },
    inverse: { folderId: 'folder-1' },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.moveAssets]: {
    payload: {
      targetFolderId: 'folder-1',
      targetFolderName: '角色参考',
      assetIds: ['gen-1', 'gen-2'],
    },
    inverse: {
      entries: [
        { assetId: 'gen-1', folderId: null },
        { assetId: 'gen-2', folderId: 'folder-9' },
      ],
    },
  },
}

function buildStep(tool: AssistantOperatorTool, omitInverse = false) {
  const fixture = STEP_FIXTURES[tool]
  return {
    id: `step-${tool}`,
    title: 'a title',
    tool,
    // ⚠ v2 §3.1：`verb` 是 step 帧上的必填一等字段，服务端按工具归属填。
    verb: ASSISTANT_OPERATOR_TOOL_VERBS[tool],
    status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    payload: fixture.payload,
    ...(fixture.result === undefined ? {} : { result: fixture.result }),
    ...(fixture.inverse === undefined || omitInverse
      ? {}
      : { inverse: fixture.inverse }),
  }
}

const SNAPSHOT = {
  prompt: '',
  negativePrompt: '',
  model: { id: 'seedream-4', label: 'Seedream 4' },
  availableModels: [{ id: 'seedream-4', label: 'Seedream 4' }],
  specs: {
    aspectRatio: '1:1',
    resolution: 'auto',
    aspectRatioOptions: ['1:1', '16:9'],
    resolutionOptions: ['auto', '2K'],
  },
  count: { value: 1, options: [1, 2, 4] },
  references: { items: [], limit: 4 },
}

describe('操作员工具表', () => {
  it('读 / 改动型 / 花钱三张表恰好覆盖全部工具且两两不重叠', () => {
    const read = new Set<string>(ASSISTANT_OPERATOR_READ_TOOLS)
    const mutating = new Set<string>(ASSISTANT_OPERATOR_MUTATING_TOOLS)
    const spend = new Set<string>(ASSISTANT_OPERATOR_SPEND_TOOLS)

    expect([...read].filter((tool) => mutating.has(tool))).toEqual([])
    expect([...read].filter((tool) => spend.has(tool))).toEqual([])
    expect([...mutating].filter((tool) => spend.has(tool))).toEqual([])
    expect([...read, ...mutating, ...spend].sort()).toEqual(
      [...ASSISTANT_OPERATOR_TOOLS].sort(),
    )
    for (const tool of ASSISTANT_OPERATOR_TOOLS) {
      expect(isMutatingAssistantOperatorTool(tool)).toBe(mutating.has(tool))
      expect(isSpendAssistantOperatorTool(tool)).toBe(spend.has(tool))
      // ⭐ 「撤得掉」= 改动型，⛔ 不再是「不是读类」——花钱档两条都不是。
      expect(isRevertibleAssistantOperatorTool(tool)).toBe(mutating.has(tool))
    }
  })

  /**
   * ⛔ 花钱档**不许长出 `inverse`**（§6）。这条用例是写给下一个「顺手统一形状」
   * 的人看的：生成出去的东西删不掉、钱退不回，一个空 `inverse` 换来的是日志条上
   * 一颗点了没反应的撤销钮。
   */
  it('花钱档的 step 带上 inverse 反而校验失败', () => {
    for (const tool of ASSISTANT_OPERATOR_SPEND_TOOLS) {
      const legal = AssistantOperatorStepSchema.safeParse(buildStep(tool))
      expect(legal.success).toBe(true)
      const withInverse = AssistantOperatorStepSchema.safeParse({
        ...buildStep(tool),
        inverse: {},
      })
      // Zod 默认剥掉多余键 —— 所以它「通过」，但解析结果里一定没有 inverse。
      expect(withInverse.success).toBe(true)
      expect(withInverse.data).not.toHaveProperty('inverse')
    }
  })

  it('每个工具都有给模型看的说明和一份入参 schema', () => {
    for (const tool of ASSISTANT_OPERATOR_TOOLS) {
      expect(ASSISTANT_OPERATOR_TOOL_HINTS[tool].length).toBeGreaterThan(20)
      expect(ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS[tool]).toBeDefined()
    }
  })

  it('⛔ 钱闸：工具表里没有任何一条能创建 generation', () => {
    for (const tool of ASSISTANT_OPERATOR_TOOLS) {
      expect(tool).not.toMatch(/^generate/)
    }
    // prime 是唯一沾生成的一条，而它的载荷只有一个 primed 布尔 —— 没有任何
    // 「跑一次」的语义可以藏在里面。
    const primed = ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS[
      ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate
    ].safeParse({ modelId: 'x', run: true })
    expect(primed.success).toBe(true)
    expect(primed.data).toEqual({})
  })

  /**
   * 拍板 22 的 schema 那一侧。⚠ 「这条地址是不是用户给的」**不在这里** ——
   * 那是规划器的活（`urlNotFromUser`），schema 只管形状。
   */
  it('import_user_url 只收 http(s)（⛔ file: / ftp: 一律拒）', () => {
    const schema =
      ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS[
        ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl
      ]
    expect(
      schema.safeParse({ url: 'https://upload.wikimedia.org/a/b.jpg' }).success,
    ).toBe(true)
    expect(schema.safeParse({ url: 'file:///etc/passwd' }).success).toBe(false)
    expect(schema.safeParse({ url: 'not a url' }).success).toBe(false)
  })

  it('检索类型是 OUTPUT_TYPE_VALUES 的子集', () => {
    for (const kind of ASSISTANT_OPERATOR_SEARCH_KINDS) {
      expect(OUTPUT_TYPE_VALUES).toContain(kind)
    }
  })

  it('open 事件名与传输层握手帧共用一个值', () => {
    expect(ASSISTANT_OPERATOR_EVENTS.open).toBe(ASSISTANT_STREAM_EVENTS.open)
  })
})

/**
 * **五个入口工具**（v2 §2.1 / §2.2，commit #5）—— 模型只见这五条，31 条旧工具
 * 退到入口背后由代码按 `action` 派发。
 */
describe('五动词入口', () => {
  it('⭐ 入口恰好五个，且名字与动词表逐字相同（§2.4 对齐）', () => {
    expect([...ASSISTANT_OPERATOR_ENTRY_TOOLS]).toEqual([
      ...ASSISTANT_OPERATOR_VERBS,
    ])
    expect(Object.keys(ASSISTANT_OPERATOR_ENTRY_ARGS_SCHEMAS).sort()).toEqual(
      [...ASSISTANT_OPERATOR_ENTRY_TOOLS].sort(),
    )
    for (const entry of ASSISTANT_OPERATOR_ENTRY_TOOLS) {
      expect(isAssistantOperatorEntryTool(entry)).toBe(true)
      expect(ASSISTANT_OPERATOR_ENTRY_TOOL_HINTS[entry].length).toBeGreaterThan(
        20,
      )
    }
    expect(isAssistantOperatorEntryTool('set_prompt')).toBe(false)
  })

  /**
   * ⭐ **31 条全部有归属**（§2.1 映射表的完成判据）—— 断的是集合相等而不是
   * 「都在」：后者放得过一条同时挂在两个入口下的工具，而那意味着模型有两条路
   * 去动同一颗旋钮。
   */
  /**
   * ⭐ **数目本身也锁一道**（commit #12 把 31 变成 32）：集合相等那条用例
   * 断的是「没有孤儿、没有分身」，断不出「有人悄悄加了一条工具」——
   * 而模型看得见的工具多一条，就是它多一条挑错的路。
   */
  it('⭐ 工具表是 38 条，recall_evidence 归「查」组（§7.3）', () => {
    // commit #18 把 33 变成 37（素材库四条写操作，v2 §10）。
    // lora-assistant §10.2.2 把 37 变成 38（`plan_lora_pick`）。
    expect(ASSISTANT_OPERATOR_TOOLS).toHaveLength(38)
    expect(
      ASSISTANT_OPERATOR_ENTRY_ACTIONS[
        ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.research
      ],
    ).toContain(ASSISTANT_OPERATOR_TOOL_IDS.recallEvidence)
    expect(
      ASSISTANT_OPERATOR_TOOL_VERBS[ASSISTANT_OPERATOR_TOOL_IDS.recallEvidence],
    ).toBe(ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.research)
    // 五个入口里其余四个都碰不到它。
    for (const entry of ASSISTANT_OPERATOR_ENTRY_TOOLS) {
      if (entry === ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.research) continue
      expect(ASSISTANT_OPERATOR_ENTRY_ACTIONS[entry]).not.toContain(
        ASSISTANT_OPERATOR_TOOL_IDS.recallEvidence,
      )
    }
  })

  /** `recall_evidence` 的入参：编号形状封闭、一次最多几条。 */
  it('recall_evidence 只收 #eN 形状的编号，且一次有上限', () => {
    const schema =
      ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS[
        ASSISTANT_OPERATOR_TOOL_IDS.recallEvidence
      ]
    expect(schema.safeParse({ refs: ['#e1', '#e12'] }).success).toBe(true)
    expect(schema.safeParse({ refs: [] }).success).toBe(false)
    expect(schema.safeParse({ refs: ['e1'] }).success).toBe(false)
    expect(schema.safeParse({ refs: ['#e0'] }).success).toBe(false)
    expect(
      schema.safeParse({
        refs: Array.from(
          { length: ASSISTANT_EVIDENCE_RECALL_LIMITS.maxRefsPerCall + 1 },
          (_, index) => `#e${index + 1}`,
        ),
      }).success,
    ).toBe(false)
  })

  /**
   * ⚠ commit #16 之后这条断的是**两张表**：广告出去的那张里，网侧四条换成了
   * `verify` / `find_images`（§9）；schema 收的那张（`…ENTRY_ACTION_VALUES`）
   * 仍然覆盖全部 33 条工具 —— 引擎与已经落盘的步帧照旧认内部名。
   */
  it('⭐ 五个入口的 action 枚举合起来恰好是全部工具，且两两不重叠', () => {
    const advertised = ASSISTANT_OPERATOR_ENTRY_TOOLS.flatMap(
      (entry) => ASSISTANT_OPERATOR_ENTRY_ACTIONS[entry],
    )
    expect([...advertised].sort()).toEqual(
      [
        ...ASSISTANT_OPERATOR_TOOLS.filter(
          (tool) => !isInternalAssistantOperatorTool(tool),
        ),
        ...ASSISTANT_OPERATOR_RESEARCH_ACTIONS,
      ].sort(),
    )
    expect(new Set(advertised).size).toBe(advertised.length)

    const all = ASSISTANT_OPERATOR_ENTRY_TOOLS.flatMap(
      (entry) => ASSISTANT_OPERATOR_ENTRY_ACTION_VALUES[entry],
    )
    expect(
      [...all]
        .filter((action) => !isAssistantOperatorResearchAction(action))
        .sort(),
    ).toEqual([...ASSISTANT_OPERATOR_TOOLS].sort())
    expect(new Set(all).size).toBe(all.length)

    /**
     * ⭐ **「查」组只剩两个网侧入口**（§9 的完成判据）：四条内部名一条都不在
     * 广告出去的那张表里，而两个入口各自落在自己那条实现上。
     */
    const research =
      ASSISTANT_OPERATOR_ENTRY_ACTIONS[
        ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.research
      ]
    for (const internal of ASSISTANT_OPERATOR_INTERNAL_TOOLS) {
      expect(research).not.toContain(internal)
    }
    expect(research.slice(0, 2)).toEqual([
      ...ASSISTANT_OPERATOR_RESEARCH_ACTIONS,
    ])
    expect(
      resolveAssistantOperatorEntryAction(
        ASSISTANT_OPERATOR_RESEARCH_ACTION_IDS.verify,
      ),
    ).toBe(ASSISTANT_OPERATOR_TOOL_IDS.research)
    expect(
      resolveAssistantOperatorEntryAction(
        ASSISTANT_OPERATOR_RESEARCH_ACTION_IDS.findImages,
      ),
    ).toBe(ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages)
    // 旧工具名原样返回 —— 这条映射只对「查」组那两个入口成立。
    expect(
      resolveAssistantOperatorEntryAction(
        ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
      ),
    ).toBe(ASSISTANT_OPERATOR_TOOL_IDS.setPrompt)
    /**
     * `ask` 组里是**提议卡 + LoRA 推荐卡**两条（v2 §8.1 + lora-assistant §10.2.2）：
     * 反问本身没有工具，它的形状写在入口自己的 schema 里（不写 `action` 就是
     * 「问一道题」）。⚠ 两条的共同判据是「停下来等用户拍一个板，产出是决定」。
     */
    expect(
      ASSISTANT_OPERATOR_ENTRY_ACTIONS[ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.ask],
    ).toEqual([
      ASSISTANT_OPERATOR_TOOL_IDS.planLoraPick,
      ASSISTANT_OPERATOR_TOOL_IDS.proposeContextCard,
    ])
  })

  it('audio 两条列进 apply，且 ⛔ 没有多出一个 audio 域（§2.3）', () => {
    expect(
      ASSISTANT_OPERATOR_ENTRY_ACTIONS[ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.apply],
    ).toEqual(
      expect.arrayContaining([
        ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference,
        ASSISTANT_OPERATOR_TOOL_IDS.setSound,
      ]),
    )
    expect([...ASSISTANT_OPERATOR_DOMAINS]).not.toContain('audio')
  })

  it('每个入口的 action 收窄到自己那一组 —— 跨组串门当场拒', () => {
    const look =
      ASSISTANT_OPERATOR_ENTRY_ARGS_SCHEMAS[
        ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.look
      ]
    expect(
      look.safeParse({ action: ASSISTANT_OPERATOR_TOOL_IDS.readState }).success,
    ).toBe(true)
    expect(
      look.safeParse({ action: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt }).success,
    ).toBe(false)
    expect(look.safeParse({}).success).toBe(false)
  })

  /**
   * ⚠ `action` 之外的参数在这一层是**放行**的：真正的值域校验照旧由
   * `ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS[action]` 在规划器里跑，⛔ 不复制第二份。
   */
  it('apply 收下 action 并把其余参数原样带下去（值域校验留给规划器）', () => {
    const parsed = ASSISTANT_OPERATOR_ENTRY_ARGS_SCHEMAS[
      ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.apply
    ].safeParse({
      action: ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
      aspectRatio: '21:9',
      resolution: '8K',
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data).toMatchObject({ aspectRatio: '21:9', resolution: '8K' })
  })

  it('ask 的形状写在入口自己身上：一道题 + 带说明的选项', () => {
    const ok = AssistantOperatorAskArgsSchema.safeParse({
      question: '要哪一路画风？',
      options: [
        { label: '写实', description: '照片那一路' },
        { label: '插画', description: '手绘那一路' },
      ],
    })
    expect(ok.success).toBe(true)
    expect(
      AssistantOperatorAskArgsSchema.safeParse({ options: [] }).success,
    ).toBe(false)
  })

  /**
   * ⭐ **域裁剪裁的是枚举值，不是工具条目**（§2.2 ⛔ 那一条）。
   */
  it('⭐ 域裁剪落在 action 枚举上：视频档有音频两条与 set_video_specs，没有 set_count', () => {
    const video =
      ASSISTANT_OPERATOR_ENTRY_ACTIONS_BY_DOMAIN.video[
        ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.apply
      ]
    expect(video).toEqual(
      expect.arrayContaining([
        ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
        ASSISTANT_OPERATOR_TOOL_IDS.setSound,
        ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference,
      ]),
    )
    expect(video).not.toContain(ASSISTANT_OPERATOR_TOOL_IDS.setCount)
    expect(video).not.toContain(ASSISTANT_OPERATOR_TOOL_IDS.setSpecs)

    const image =
      ASSISTANT_OPERATOR_ENTRY_ACTIONS_BY_DOMAIN.image[
        ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.apply
      ]
    expect(image).toEqual(
      expect.arrayContaining([
        ASSISTANT_OPERATOR_TOOL_IDS.setCount,
        ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
      ]),
    )
    expect(image).not.toContain(ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs)
    expect(image).not.toContain(ASSISTANT_OPERATOR_TOOL_IDS.setSound)
  })

  it('每个域的 action 枚举都是该域工具表的另一种切法', () => {
    for (const domain of ASSISTANT_OPERATOR_DOMAINS) {
      const flat = ASSISTANT_OPERATOR_ENTRY_TOOLS.flatMap(
        (entry) => ASSISTANT_OPERATOR_ENTRY_ACTIONS_BY_DOMAIN[domain][entry],
      )
      /**
       * ⚠ commit #16：网侧那四条在广告出去的表里是 `verify` / `find_images`，
       * 所以两边比之前先把枚举值折回**内部实现**（§9 的裁剪判据就落在这上面）。
       */
      expect([...flat.map(resolveAssistantOperatorEntryAction)].sort()).toEqual(
        [...ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN[domain]]
          .filter(
            (tool) =>
              !isInternalAssistantOperatorTool(tool) ||
              tool === ASSISTANT_OPERATOR_TOOL_IDS.research ||
              tool === ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
          )
          .sort(),
      )
    }
  })

  /** ⚠ 枚举空掉的入口不列进提示；`ask` 永远在（它不依赖任何一颗旋钮）。 */
  it('枚举空掉的入口不出现在这个域里，ask 永远在', () => {
    for (const domain of ASSISTANT_OPERATOR_DOMAINS) {
      const entries = assistantOperatorEntryToolsInDomain(domain)
      expect(entries).toContain(ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.ask)
      for (const entry of ASSISTANT_OPERATOR_ENTRY_TOOLS) {
        const actions =
          ASSISTANT_OPERATOR_ENTRY_ACTIONS_BY_DOMAIN[domain][entry]
        if (entry === ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.ask) continue
        expect(entries.includes(entry)).toBe(actions.length > 0)
      }
    }
  })
})

describe('step 契约 · inverse 完备性', () => {
  it('每个工具的合法 step 都能通过校验', () => {
    for (const tool of ASSISTANT_OPERATOR_TOOLS) {
      const parsed = AssistantOperatorStepSchema.safeParse(buildStep(tool))
      expect(
        parsed.success,
        `${tool} 的合法 step 应该通过：${JSON.stringify(parsed.error?.issues)}`,
      ).toBe(true)
    }
  })

  it('⭐ 改动型 step 缺 inverse 必须校验失败', () => {
    for (const tool of ASSISTANT_OPERATOR_MUTATING_TOOLS) {
      const parsed = AssistantOperatorStepSchema.safeParse(
        buildStep(tool, true),
      )
      expect(parsed.success, `${tool} 少了 inverse 却通过了校验`).toBe(false)
    }
  })

  it('读类 step 没有 inverse 也照样通过（它没有东西可撤）', () => {
    for (const tool of ASSISTANT_OPERATOR_READ_TOOLS) {
      expect(
        AssistantOperatorStepSchema.safeParse(buildStep(tool)).success,
      ).toBe(true)
    }
  })

  it('读类 step 在 running 阶段 result 为 null，done 阶段必须有值', () => {
    const running = AssistantOperatorStepSchema.safeParse({
      ...buildStep(ASSISTANT_OPERATOR_TOOL_IDS.searchAssets),
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.running,
      result: null,
    })
    expect(running.success).toBe(true)

    const missingResult = AssistantOperatorStepSchema.safeParse({
      id: 'step-1',
      title: 'searching',
      tool: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
      verb: ASSISTANT_OPERATOR_TOOL_VERBS[
        ASSISTANT_OPERATOR_TOOL_IDS.searchAssets
      ],
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
      payload: { query: 'x', kind: null, limit: 6 },
    })
    expect(missingResult.success).toBe(false)
  })

  it('set_specs 必须同时带比例与清晰度（台账 AE/BG/BS）', () => {
    const onlyRatio = AssistantOperatorStepSchema.safeParse({
      ...buildStep(ASSISTANT_OPERATOR_TOOL_IDS.setSpecs),
      payload: { aspectRatio: '16:9' },
    })
    expect(onlyRatio.success).toBe(false)
  })

  it('被拒的一步照样是合法 step，且不需要 inverse', () => {
    const rejected = AssistantOperatorStepSchema.safeParse({
      id: 'step-9',
      title: 'switch model',
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setModel,
      verb: ASSISTANT_OPERATOR_TOOL_VERBS[ASSISTANT_OPERATOR_TOOL_IDS.setModel],
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      error: {
        reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.unknownModel,
        detail: 'Animagine XL',
      },
    })
    expect(rejected.success).toBe(true)
  })

  /**
   * ⭐ **`verb` 必填**（v2 §3.1）—— 面板那句状态词直接读它。
   *
   * ⚠ v1 的面板靠「按工具名反查一张对照表」猜动词，漏同步的表现是「跑着一步而
   * 头像旁边一个字都没有」。写成必填之后，服务端出帧那一刻就得说清楚它在干哪一类活。
   */
  it('⭐ step 缺 verb 必须校验失败（五句状态词直接读它）', () => {
    for (const tool of ASSISTANT_OPERATOR_TOOLS) {
      const withoutVerb: Record<string, unknown> = { ...buildStep(tool) }
      delete withoutVerb.verb
      expect(
        AssistantOperatorStepSchema.safeParse(withoutVerb).success,
        `${tool} 少了 verb 却通过了校验`,
      ).toBe(false)
    }
  })

  it('verb 是封闭词表 —— 写一个表外的词不给过', () => {
    expect(
      AssistantOperatorStepSchema.safeParse({
        ...buildStep(ASSISTANT_OPERATOR_TOOL_IDS.setPrompt),
        verb: 'think',
      }).success,
    ).toBe(false)
  })

  it('每条工具的 verb 与它所属入口的 action 枚举对得上', () => {
    for (const tool of ASSISTANT_OPERATOR_TOOLS) {
      const verb = ASSISTANT_OPERATOR_TOOL_VERBS[tool]
      // ⚠ 网侧四条只在 schema 收的那张表里（广告出去的是两个入口，§9）。
      expect(ASSISTANT_OPERATOR_ENTRY_ACTION_VALUES[verb]).toContain(tool)
      if (isInternalAssistantOperatorTool(tool)) continue
      expect(ASSISTANT_OPERATOR_ENTRY_ACTIONS[verb]).toContain(tool)
    }
    for (const action of ASSISTANT_OPERATOR_RESEARCH_ACTIONS) {
      expect(isAssistantOperatorResearchAction(action)).toBe(true)
    }
  })

  it('不认识的拒绝理由不给过 —— 词表是封闭的', () => {
    const parsed = AssistantOperatorStepSchema.safeParse({
      id: 'step-9',
      title: 'switch model',
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setModel,
      verb: ASSISTANT_OPERATOR_TOOL_VERBS[ASSISTANT_OPERATOR_TOOL_IDS.setModel],
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      error: { reason: 'because-i-said-so' },
    })
    expect(parsed.success).toBe(false)
  })
})

describe('事件契约', () => {
  /** `ask` 帧那道题的最小合法形状 —— 下面几个用例共用。 */
  const askQuestion = {
    id: 'q-1',
    header: '风格',
    question: '要哪一路画风？',
    multiSelect: false,
    allowOther: true,
    options: [
      { id: 'a', label: '写实', description: '照片那一路' },
      { id: 'b', label: '插画', description: '手绘那一路' },
    ],
  }

  it('每一种事件都能解析', () => {
    const events: unknown[] = [
      { type: ASSISTANT_OPERATOR_EVENTS.open },
      {
        type: ASSISTANT_OPERATOR_EVENTS.plan,
        steps: [
          { id: 'plan-1', label: '查素材' },
          { id: 'plan-2', label: '填表单' },
        ],
      },
      {
        type: ASSISTANT_OPERATOR_EVENTS.step,
        step: buildStep(ASSISTANT_OPERATOR_TOOL_IDS.setPrompt),
      },
      { type: ASSISTANT_OPERATOR_EVENTS.ask, question: askQuestion },
      {
        type: ASSISTANT_OPERATOR_EVENTS.ask,
        question: askQuestion,
        why: '两种做法差得远',
        overwrite: {
          field: ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt,
          have: '我自己写的一段',
          proposed: '助手想写的一段',
        },
      },
      {
        type: ASSISTANT_OPERATOR_EVENTS.confirm,
        confirm: {
          kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep,
          steps: [{ id: 'plan-1', label: '查素材' }],
        },
      },
      {
        type: ASSISTANT_OPERATOR_EVENTS.confirm,
        confirm: {
          kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate,
          request: {
            model: { id: 'gpt-image-1', label: 'GPT Image' },
            count: 2,
            specs: {
              aspectRatio: '1:1',
              resolution: null,
              durationSeconds: null,
            },
          },
        },
      },
      { type: ASSISTANT_OPERATOR_EVENTS.message, text: '好的' },
      { type: ASSISTANT_OPERATOR_EVENTS.done },
      {
        type: ASSISTANT_OPERATOR_EVENTS.stopped,
        reason: ASSISTANT_OPERATOR_STOP_REASONS.aborted,
      },
      {
        type: ASSISTANT_OPERATOR_EVENTS.error,
        error: 'boom',
        errorCode: 'ASSISTANT_OPERATOR_FAILED',
      },
    ]

    for (const event of events) {
      const parsed = AssistantOperatorEventSchema.safeParse(event)
      expect(
        parsed.success,
        `${JSON.stringify(event)} → ${JSON.stringify(parsed.error?.issues)}`,
      ).toBe(true)
    }
  })

  /**
   * ⭐ **事件联合恰好是这十个名字**（v2 §3.1，commit #3）。
   *
   * ⚠ 断的是**集合相等**而不是「这十个都在」：后者放得过一条偷偷留下来的旧帧，
   * 而收敛这件事的全部意义就是「没有第十一个」。
   */
  it('⭐ 事件联合恰好十帧，一个不多一个不少', () => {
    const names = AssistantOperatorEventSchema.options
      .map((option) => option.shape.type.value)
      .sort()
    expect(names).toEqual(
      [
        'open',
        'plan',
        'step',
        'ask',
        'confirm',
        'message',
        'rule_hit',
        'done',
        'stopped',
        'error',
      ].sort(),
    )
    expect(Object.values(ASSISTANT_OPERATOR_EVENTS).sort()).toEqual(names)
  })

  /**
   * ⭐ **v1 的五个帧名一个都不认**（v2 §3.1）：`message_delta` 随逐字淡入删掉
   * （拍板 13），另外四个并进 `plan` / `ask` / `confirm` 或整条删掉（决策 8）。
   */
  it('⛔ v1 那五个帧名全部不在联合里', () => {
    const gone = [
      { type: 'message_delta', text: '夜' },
      { type: 'plan_request', steps: [], questions: [], estimate: {} },
      { type: 'spend_request', tier: 'spend', request: {} },
      { type: 'confirm_request', tier: 'overwrite', field: 'prompt' },
      { type: 'choice_request', question: '哪一张？', options: [] },
      { type: 'cost_tick', kind: 'vision', units: 1, label: 'x' },
    ]
    for (const event of gone) {
      expect(
        AssistantOperatorEventSchema.safeParse(event).success,
        JSON.stringify(event),
      ).toBe(false)
    }
  })

  /** ⚠ 一帧只问一道题，且题的形状照旧收紧：少于两个选项的「单选」是通知不是问题。 */
  it('ask 的选项至少两个，且每个都得有一句说明', () => {
    expect(
      AssistantOperatorEventSchema.safeParse({
        type: ASSISTANT_OPERATOR_EVENTS.ask,
        question: { ...askQuestion, options: [askQuestion.options[0]] },
      }).success,
    ).toBe(false)
    expect(
      AssistantOperatorEventSchema.safeParse({
        type: ASSISTANT_OPERATOR_EVENTS.ask,
        question: {
          ...askQuestion,
          options: [askQuestion.options[0], { id: 'b', label: '插画' }],
        },
      }).success,
    ).toBe(false)
  })

  /** ⛔ 确认卡只剩两种来源（决策 8）：第三种 `kind` 一律不收。 */
  it('confirm 的 kind 只认 multistep / generate', () => {
    expect(
      AssistantOperatorEventSchema.safeParse({
        type: ASSISTANT_OPERATOR_EVENTS.confirm,
        confirm: { kind: 'spend', request: {} },
      }).success,
    ).toBe(false)
  })

  /** LoRA 域才有的两格（§7.2）：可选、有上限、⛔ 不收空串。 */
  it('ask.overwrite 的取材标注与负面增量：可选，且各有上限', () => {
    const overwrite = {
      field: ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt,
      have: '我自己写的一段',
      proposed: '助手想写的一段',
    }
    const parse = (extra: Record<string, unknown>) =>
      AssistantOperatorEventSchema.safeParse({
        type: ASSISTANT_OPERATOR_EVENTS.ask,
        question: askQuestion,
        overwrite: { ...overwrite, ...extra },
      }).success

    expect(
      parse({
        sourceNotes: ['主体 — 来自《Ink Lines》的作者推荐'],
        negativeDiff: ['worst quality'],
      }),
    ).toBe(true)
    // 两格都缺席仍然合法 —— 别的域一格都不给。
    expect(parse({})).toBe(true)
    // 条目数上限（挂载数 + 1 那条判据的护栏）。
    expect(
      parse({
        sourceNotes: Array.from(
          { length: ASSISTANT_OPERATOR_LIMITS.maxSourceNotes + 1 },
          (_, index) => `note ${index}`,
        ),
      }),
    ).toBe(false)
    expect(
      parse({
        sourceNotes: [
          'a'.repeat(ASSISTANT_OPERATOR_LIMITS.maxSourceNoteChars + 1),
        ],
      }),
    ).toBe(false)
    expect(
      parse({
        negativeDiff: Array.from(
          { length: ASSISTANT_OPERATOR_LIMITS.maxNegativeDiffTags + 1 },
          (_, index) => `tag ${index}`,
        ),
      }),
    ).toBe(false)
    // ⛔ 空串不是一条标注。
    expect(parse({ sourceNotes: [''] })).toBe(false)
    expect(parse({ negativeDiff: ['  '] })).toBe(false)
  })

  /** ⚠ 覆盖那一块只认那两格字段：`aspectRatio` 不是「你手写的字」。 */
  it('ask.overwrite 的 field 是封闭枚举', () => {
    expect(
      AssistantOperatorEventSchema.safeParse({
        type: ASSISTANT_OPERATOR_EVENTS.ask,
        question: askQuestion,
        overwrite: { field: 'aspectRatio', have: 'x', proposed: 'y' },
      }).success,
    ).toBe(false)
  })

  /**
   * **`confirm` 帧第四支 `loraPick`**（lora-assistant §10.1 / §10.4 第 1 条）。
   *
   * ⚠ 这一组盯的是协议本身的三条硬约束：候选那两格新字段必填、`groups` 里的
   * candidateId 必须在 `candidates` 里、上限沿用 `maxLoraResults`（6）。
   */
  describe('confirm.loraPick（lora-assistant §10.1）', () => {
    const loraCandidate = (candidateId: string) => ({
      candidateId,
      source: 'civitai',
      name: `LoRA ${candidateId}`,
      author: 'someone',
      family: 'Illustrious',
      triggerWords: ['qingxiao'],
      downloads: 1200,
      licenseLabel: null,
      licenseKnown: false,
      commercialUse: null,
      importable: true,
      compatible: true,
      alreadyMounted: false,
      alreadyImported: false,
      defaultWeight: 0.8,
      recommended: false,
    })

    /**
     * **卡上（与勾选回传时）的那一条** —— 与上面同一份投影外加 `importPayload`。
     *
     * ⭐ 两档的差别只有这一格：`search_loras` 的**步结果**不带（它要进会话历史，
     * 每条候选背一份落库入参就是让每条消息多背几 KB），推荐卡这一帧必须带
     * （`candidateId → 候选` 的索引只活一轮，勾选那一下发生在流结束之后）。
     */
    const pickCandidate = (candidateId: string) => ({
      ...loraCandidate(candidateId),
      importPayload: {
        name: `LoRA ${candidateId}`,
        triggerWord: 'qingxiao',
        loraUrl: 'https://civitai.com/api/download/models/67890',
        type: 'style',
        baseModelFamily: 'illustrious',
        provider: 'civitai',
        sourceSnapshot: {
          source: 'civitai',
          author: 'someone',
          license: {
            label: null,
            commercialUse: null,
            allowDerivatives: null,
            allowNoCredit: null,
            known: false,
          },
          pageUrl: 'https://civitai.com/models/12345',
          revision: null,
          retrievedAt: '2026-09-12T00:00:00.000Z',
          fileSizeBytes: null,
          metadataCompleteness: 'partial',
        },
      },
    })

    const pickFrame = (pick: Record<string, unknown>) => ({
      type: ASSISTANT_OPERATOR_EVENTS.confirm,
      confirm: { kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.loraPick, pick },
    })

    const basePick = {
      question: '这几把里你要挂哪几把？',
      baseFamilyLabel: 'Illustrious',
      budget: { total: 1.4, limit: 2.5 },
      groups: [{ title: '古风', candidateIds: ['a', 'b'] }],
      candidates: [pickCandidate('a'), pickCandidate('b')],
    }

    it('一张完整的推荐卡解析得过', () => {
      expect(
        AssistantOperatorEventSchema.safeParse(pickFrame(basePick)).success,
      ).toBe(true)
    })

    /** ⚠ 底模未定：`baseFamilyLabel` 与 `budget` 都是 null —— ⛔ 不是缺席。 */
    it('底模未定时两格都写 null', () => {
      expect(
        AssistantOperatorEventSchema.safeParse(
          pickFrame({ ...basePick, baseFamilyLabel: null, budget: null }),
        ).success,
      ).toBe(true)
      expect(
        AssistantOperatorEventSchema.safeParse(
          pickFrame({ ...basePick, budget: undefined }),
        ).success,
      ).toBe(false)
    })

    /** ⭐ 候选那两格是**新增的必填**：少一格整帧不成立。 */
    it('候选缺 defaultWeight / recommended 就不成立', () => {
      for (const missing of ['defaultWeight', 'recommended'] as const) {
        const candidate: Record<string, unknown> = pickCandidate('a')
        delete candidate[missing]
        expect(
          AssistantOperatorEventSchema.safeParse(
            pickFrame({
              ...basePick,
              groups: [{ candidateIds: ['a'] }],
              candidates: [candidate],
            }),
          ).success,
        ).toBe(false)
      }
    })

    /**
     * **`importPayload` 两档**（lora-assistant §10.1）：
     *  · `search_loras` 的**步结果**那一档不带 —— 基础 schema 留它可选；
     *  · 推荐卡这一帧与勾选回传那一档**必填** —— 缺了整帧不成立。
     *
     * ⭐ 这一格就是「⛔ 不许确认时按 id 再搜一次」那条规矩落地的地方：卡上少一格
     * 没人发现，直到创作者点了「挂载所选」才在服务端拒掉，那时他已经等过一轮了。
     */
    it('importPayload 在卡上必填，在步结果投影上可缺', () => {
      const withoutPayload: Record<string, unknown> = pickCandidate('a')
      delete withoutPayload.importPayload
      expect(
        AssistantOperatorEventSchema.safeParse(
          pickFrame({
            ...basePick,
            groups: [{ candidateIds: ['a'] }],
            candidates: [withoutPayload],
          }),
        ).success,
      ).toBe(false)
      // ⛔ 步结果那一档照旧不带它 —— 基础投影 schema 必须收得下。
      expect(
        AssistantOperatorLoraCandidateSchema.safeParse(withoutPayload).success,
      ).toBe(true)
      expect(
        AssistantOperatorLoraPickCandidateSchema.safeParse(withoutPayload)
          .success,
      ).toBe(false)
    })

    /**
     * ⚠ 必填的是**这一格在不在**，不是它非得有值：导不进来的候选照样进卡
     * （策略 C），那一格写 `null`。
     */
    it('导不进来的那把带着 null 载荷照样进卡', () => {
      expect(
        AssistantOperatorEventSchema.safeParse(
          pickFrame({
            ...basePick,
            groups: [{ candidateIds: ['a'] }],
            candidates: [
              {
                ...pickCandidate('a'),
                importable: false,
                notImportableReason: 'gated_repo',
                importPayload: null,
              },
            ],
          }),
        ).success,
      ).toBe(true)
    })

    /** ⭐ 分组引用的是**卡上真有的那几把**：编一个 id 出来整帧不成立。 */
    it('groups 里的 candidateId 必须在 candidates 里', () => {
      const parsed = AssistantOperatorEventSchema.safeParse(
        pickFrame({
          ...basePick,
          groups: [{ candidateIds: ['a', 'ghost'] }],
        }),
      )
      expect(parsed.success).toBe(false)
      expect(JSON.stringify(parsed.error?.issues)).toContain('ghost')
    })

    /** ⚠ 上限与 `search_loras` 一轮能回的条数同一份，⛔ 不另立一个。 */
    it('候选上限沿用 maxLoraResults', () => {
      const ids = Array.from(
        { length: ASSISTANT_OPERATOR_LIMITS.maxLoraResults + 1 },
        (_, index) => `c${index}`,
      )
      expect(
        AssistantOperatorEventSchema.safeParse(
          pickFrame({
            ...basePick,
            groups: [{ candidateIds: ids.slice(0, 1) }],
            candidates: ids.map(pickCandidate),
          }),
        ).success,
      ).toBe(false)
    })

    /** ⚠ 一把都没有的卡不是卡：`candidates` / `groups` 都 `.min(1)`。 */
    it('空候选 / 空分组不成立', () => {
      expect(
        AssistantOperatorEventSchema.safeParse(
          pickFrame({ ...basePick, candidates: [], groups: [] }),
        ).success,
      ).toBe(false)
    })

    /**
     * **回传的是勾中的那几条本体**（§10.1「用户回答怎么回来」）：
     * `run.loraIndex` 只活一轮，重搜一次拿到的不是同一份。
     */
    it('request.loraPicks 收候选本体，且上限同为 maxLoraResults', () => {
      const base = {
        messages: [{ role: 'user', content: '挂上这两把' }],
        domain: 'lora',
        snapshot: SNAPSHOT,
      }
      expect(
        AssistantOperatorRequestSchema.safeParse({
          ...base,
          loraPicks: [
            { candidateId: 'a', weight: 0.9, candidate: pickCandidate('a') },
            { candidateId: 'b', candidate: pickCandidate('b') },
          ],
        }).success,
      ).toBe(true)
      // ⛔ 只给 id 不给本体 —— 那正是「确认时按 id 再搜一次」的入口。
      expect(
        AssistantOperatorRequestSchema.safeParse({
          ...base,
          loraPicks: [{ candidateId: 'a' }],
        }).success,
      ).toBe(false)
      expect(
        AssistantOperatorRequestSchema.safeParse({
          ...base,
          loraPicks: Array.from(
            { length: ASSISTANT_OPERATOR_LIMITS.maxLoraResults + 1 },
            (_, index) => ({
              candidateId: `c${index}`,
              candidate: loraCandidate(`c${index}`),
            }),
          ),
        }).success,
      ).toBe(false)
    })
  })
})

describe('请求与快照契约', () => {
  it('最小请求可解析', () => {
    const parsed = AssistantOperatorRequestSchema.safeParse({
      messages: [{ role: 'user', content: '帮我配一张海报' }],
      domain: 'image',
      snapshot: SNAPSHOT,
    })
    expect(parsed.success).toBe(true)
  })

  it('负面框「缺席」与「空着」是两件事', () => {
    const absent = AssistantOperatorSnapshotSchema.parse({
      ...SNAPSHOT,
      negativePrompt: undefined,
    })
    expect(absent.negativePrompt).toBeUndefined()

    const empty = AssistantOperatorSnapshotSchema.parse({
      ...SNAPSHOT,
      negativePrompt: '',
    })
    expect(empty.negativePrompt).toBe('')
  })

  it('模型 null（没选）与缺席（这个台不选模型）也是两件事', () => {
    const notSelected = AssistantOperatorSnapshotSchema.parse({
      ...SNAPSHOT,
      model: null,
    })
    expect(notSelected.model).toBeNull()

    const noControl = AssistantOperatorSnapshotSchema.parse({
      ...SNAPSHOT,
      model: undefined,
    })
    expect(noControl.model).toBeUndefined()
  })

  it('前情 steps 有条数上限（没有服务端会话态，全靠客户端带回来）', () => {
    const tooMany = Array.from(
      { length: ASSISTANT_OPERATOR_LIMITS.maxPriorSteps + 1 },
      () => ({
        tool: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
        status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
        summary: 'wrote the prompt',
      }),
    )
    expect(
      AssistantOperatorRequestSchema.safeParse({
        messages: [{ role: 'user', content: 'x' }],
        domain: 'image',
        snapshot: SNAPSHOT,
        priorSteps: tooMany,
      }).success,
    ).toBe(false)
  })

  it('确认回执认三个选择', () => {
    for (const choice of Object.values(ASSISTANT_OPERATOR_CONFIRM_CHOICES)) {
      expect(
        AssistantOperatorRequestSchema.safeParse({
          messages: [{ role: 'user', content: 'x' }],
          domain: 'image',
          snapshot: SNAPSHOT,
          confirmations: [
            { field: ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt, choice },
          ],
        }).success,
      ).toBe(true)
    }
  })

  it('挂载的四格必填：触发词 null 认、空串不认', () => {
    const mount = {
      id: 'lora-1',
      name: 'Ink Lines',
      weight: 0.8,
      enabled: true,
      family: 'illustrious',
      compatible: true,
      triggerWord: null,
      triggerEnabled: true,
      recommendedPrompt: null,
      sourcePrompts: [],
    }
    const loras = {
      items: [mount],
      baseFamily: 'illustrious',
      minWeight: 0.1,
      maxWeight: 2,
    }
    expect(
      AssistantOperatorSnapshotSchema.safeParse({ ...SNAPSHOT, loras }).success,
    ).toBe(true)
    // ⛔ 空串 = 「有一个空的触发词」，与 null 不是一回事。
    expect(
      AssistantOperatorSnapshotSchema.safeParse({
        ...SNAPSHOT,
        loras: { ...loras, items: [{ ...mount, triggerWord: '' }] },
      }).success,
    ).toBe(false)
    for (const missing of [
      'triggerWord',
      'triggerEnabled',
      'recommendedPrompt',
      'sourcePrompts',
    ] as const) {
      const partial: Record<string, unknown> = { ...mount }
      delete partial[missing]
      expect(
        AssistantOperatorSnapshotSchema.safeParse({
          ...SNAPSHOT,
          loras: { ...loras, items: [partial] },
        }).success,
      ).toBe(false)
    }
  })

  /**
   * 来源图提示词那一格（取材阶梯第二档的料）。
   *
   * ⚠ 钉的是**两个上限都在 schema 上**：这份快照落进请求体，一把挖出几十条配方的
   * LoRA 会把每一步的往返撑爆；而空串条目会让「有一条来源配方」变成一句空话。
   */
  it('来源图提示词：空数组认、空串不认、条数与长度都有上限', () => {
    const mount = {
      id: 'lora-1',
      name: 'Ink Lines',
      weight: 0.8,
      enabled: true,
      family: 'illustrious',
      compatible: true,
      triggerWord: 'ink lines',
      triggerEnabled: true,
      recommendedPrompt: null,
      sourcePrompts: ['ink lines, rainy street'],
    }
    const parse = (sourcePrompts: string[]) =>
      AssistantOperatorSnapshotSchema.safeParse({
        ...SNAPSHOT,
        loras: {
          items: [{ ...mount, sourcePrompts }],
          baseFamily: 'illustrious',
          minWeight: 0.1,
          maxWeight: 2,
        },
      }).success

    expect(parse([])).toBe(true)
    expect(parse(['ink lines, rainy street'])).toBe(true)
    // ⛔ 空串不是一条配方。
    expect(parse([''])).toBe(false)
    expect(
      parse(['a'.repeat(ASSISTANT_OPERATOR_LIMITS.maxPromptChars + 1)]),
    ).toBe(false)
    expect(
      parse(
        Array.from(
          { length: ASSISTANT_OPERATOR_LIMITS.maxLoraSourcePrompts + 1 },
          (_, i) => `outfit ${i}`,
        ),
      ),
    ).toBe(false)
  })

  it('推荐提示词有长度上限（超了整条快照就不该过）', () => {
    const mount = {
      id: 'lora-1',
      name: 'Ink Lines',
      weight: 0.8,
      enabled: true,
      family: 'illustrious',
      compatible: true,
      triggerWord: 'ink lines',
      triggerEnabled: false,
      recommendedPrompt: 'a'.repeat(
        ASSISTANT_OPERATOR_LIMITS.maxPromptChars + 1,
      ),
      sourcePrompts: [],
    }
    expect(
      AssistantOperatorSnapshotSchema.safeParse({
        ...SNAPSHOT,
        loras: {
          items: [mount],
          baseFamily: 'illustrious',
          minWeight: 0.1,
          maxWeight: 2,
        },
      }).success,
    ).toBe(false)
  })

  it('canvas 不在 P1 的域里', () => {
    expect(
      AssistantOperatorRequestSchema.safeParse({
        messages: [{ role: 'user', content: 'x' }],
        domain: 'canvas',
        snapshot: SNAPSHOT,
      }).success,
    ).toBe(false)
  })
})

describe('模型这一轮写的东西（宽松层）', () => {
  it('工具调用可解析，未知字段被剥掉', () => {
    const parsed = AssistantOperatorTurnSchema.safeParse({
      plan: ['先看看表单'],
      tool: {
        name: ASSISTANT_OPERATOR_TOOL_IDS.readState,
        title: 'read the form',
        args: {},
      },
    })
    expect(parsed.success).toBe(true)
  })

  /**
   * ⚠ **工具名这一层故意不收窄**（v2 §2.1）：模型写了旧工具名或干脆编一个时，
   * 它该读到一条**指得出路**的拒绝（「set_prompt 退到 apply 后面去了」），
   * ⛔ 不是整轮 JSON 读不出来退化成一次白烧的重试。收窄发生在服务端拆入口那一跳
   * （`unwrapEntryToolCall`），被拒的用例在 `assistant-operator.service.test.ts`。
   */
  it('工具名收 z.string() —— 旧名字 / 编出来的名字都先解析得出来，拒在服务端', () => {
    for (const name of [
      'generate_image',
      ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
    ]) {
      const parsed = AssistantOperatorTurnSchema.safeParse({
        tool: { name, title: 'go', args: {} },
      })
      expect(parsed.success, `${name} 应该解析得出来`).toBe(true)
      expect(parsed.data?.tool?.name).toBe(name)
    }
  })

  /** 五动词那一行：模型写对了入口，`action` 与其余参数平铺在 `args` 里。 */
  it('入口形状可解析：name 是动词，action 与参数平铺在 args 里', () => {
    const parsed = AssistantOperatorTurnSchema.safeParse({
      tool: {
        name: ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.apply,
        title: 'write the prompt',
        args: {
          action: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          value: 'a girl under a red umbrella',
        },
      },
    })
    expect(parsed.success).toBe(true)
  })

  /**
   * ⭐ **多步确认由模型判**（v2 §3.3 / 决策 4）—— `confirmPlan` 缺席 = 不出卡，
   * ⛔ 服务端不按步数补判（那条死阈值常量已删）。
   */
  it('confirmPlan 是可选布尔 —— 缺席就是不出卡', () => {
    expect(
      AssistantOperatorTurnSchema.safeParse({
        plan: ['一', '二', '三'],
        confirmPlan: true,
        finished: true,
      }).data?.confirmPlan,
    ).toBe(true)
    expect(
      AssistantOperatorTurnSchema.safeParse({
        plan: ['一', '二', '三'],
        finished: true,
      }).data?.confirmPlan,
    ).toBeUndefined()
  })

  it('漏写标题 / args 给 null 都不作废整轮（每步都是一次 LLM 往返，别为装饰字段烧步）', () => {
    const parsed = AssistantOperatorTurnSchema.safeParse({
      tool: {
        name: ASSISTANT_OPERATOR_TOOL_IDS.readState,
        args: null,
      },
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.tool?.args).toEqual({})
    expect(parsed.data?.tool?.title).toBeUndefined()
  })

  it('模型写的档位值故意宽松收下（值域校验在规划器）', () => {
    const parsed = ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS[
      ASSISTANT_OPERATOR_TOOL_IDS.setSpecs
    ].safeParse({ aspectRatio: '21:9', resolution: '8K' })
    expect(parsed.success).toBe(true)
  })
})

describe('research / read_url 的入参形状（2026-09-06）', () => {
  const researchSchema =
    ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS[ASSISTANT_OPERATOR_TOOL_IDS.research]
  const readUrlSchema =
    ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS[ASSISTANT_OPERATOR_TOOL_IDS.readUrl]

  it('research：goal 必填，entities / sources 可选', () => {
    expect(researchSchema.safeParse({ goal: 'appearance' }).success).toBe(true)
    expect(
      researchSchema.safeParse({
        goal: 'appearance',
        entities: ['Ananta', 'Shiye'],
        sources: ['wiki', 'danbooru'],
      }).success,
    ).toBe(true)
    expect(researchSchema.safeParse({ entities: ['x'] }).success).toBe(false)
    expect(researchSchema.safeParse({ goal: '' }).success).toBe(false)
  })

  it('⛔ research 的 sources 是**封闭词表**：真源 id 写进来一律不合法', () => {
    expect(
      researchSchema.safeParse({ goal: 'g', sources: ['moegirl'] }).success,
    ).toBe(false)
  })

  it('read_url：只收 http(s)，⛔ `file:` / `ftp:` 一律不合法', () => {
    expect(
      readUrlSchema.safeParse({ url: 'https://example.com/a' }).success,
    ).toBe(true)
    expect(
      readUrlSchema.safeParse({
        url: 'https://example.com/a',
        focus: 'appearance and outfit',
      }).success,
    ).toBe(true)
    expect(readUrlSchema.safeParse({ url: 'file:///etc/passwd' }).success).toBe(
      false,
    )
    expect(readUrlSchema.safeParse({ url: 'not a url' }).success).toBe(false)
  })

  it('⭐ search_web_images 多了 subject / preferOfficial，且都是可选（老形状仍合法）', () => {
    const schema =
      ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS[
        ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages
      ]
    expect(schema.safeParse({ query: 'wet asphalt' }).success).toBe(true)
    expect(
      schema.safeParse({
        query: 'character art',
        subject: 'Ananta Shiye',
        preferOfficial: true,
      }).success,
    ).toBe(true)
  })

  it('两条新工具都是**读类**：没有 inverse，也不在改动型 / 花钱档里', () => {
    for (const tool of [
      ASSISTANT_OPERATOR_TOOL_IDS.research,
      ASSISTANT_OPERATOR_TOOL_IDS.readUrl,
    ] as const) {
      expect(ASSISTANT_OPERATOR_READ_TOOLS).toContain(tool)
      expect(isMutatingAssistantOperatorTool(tool)).toBe(false)
      expect(isSpendAssistantOperatorTool(tool)).toBe(false)
      expect(isRevertibleAssistantOperatorTool(tool)).toBe(false)
    }
  })
})

// ─── 每轮结账（v2 §7.2 / §7.5）────────────────────────────────────

describe('本轮结论记录', () => {
  const RECORD = {
    roundIndex: 0,
    createdAt: '2026-09-11T00:00:00.000Z',
    facts: ['夜景配色定为冷蓝'],
    decisions: ['用 16:9'],
    todos: [],
    evidenceRefs: ['#e12'],
  }

  it('四栏 + 轮次号 + 时间；`editedByUser` 可选', () => {
    expect(AssistantOperatorRoundSummarySchema.safeParse(RECORD).success).toBe(
      true,
    )
    expect(
      AssistantOperatorRoundSummarySchema.safeParse({
        ...RECORD,
        editedByUser: true,
      }).success,
    ).toBe(true)
  })

  it('每栏最多三条、每条 60 字 —— 它下一轮要整段进系统提示', () => {
    expect(
      AssistantOperatorRoundSummarySchema.safeParse({
        ...RECORD,
        facts: Array.from(
          { length: ASSISTANT_ROUND_SUMMARY_LIMITS.maxEntriesPerColumn + 1 },
          () => 'a',
        ),
      }).success,
    ).toBe(false)
    expect(
      AssistantOperatorRoundSummarySchema.safeParse({
        ...RECORD,
        facts: ['x'.repeat(ASSISTANT_ROUND_SUMMARY_LIMITS.maxEntryChars + 1)],
      }).success,
    ).toBe(false)
  })

  it('证据编号只认 `#e<正整数>` —— 它要点得回证据本里那一条', () => {
    for (const ref of ['#e', '#e0', 'e12', '#E12', '12']) {
      expect(
        AssistantOperatorRoundSummarySchema.safeParse({
          ...RECORD,
          evidenceRefs: [ref],
        }).success,
      ).toBe(false)
    }
  })

  it('⭐ `done` 帧带得上它，也照旧允许不带（结账失败不阻塞收尾）', () => {
    expect(
      AssistantOperatorEventSchema.safeParse({
        type: ASSISTANT_OPERATOR_EVENTS.done,
        roundSummary: RECORD,
      }).success,
    ).toBe(true)
    expect(
      AssistantOperatorEventSchema.safeParse({
        type: ASSISTANT_OPERATOR_EVENTS.done,
      }).success,
    ).toBe(true)
  })

  it('⛔ 草稿里没有 `evidenceRefs`：编号是服务端分配的，不让模型写', () => {
    const parsed = AssistantOperatorRoundSummaryDraftSchema.safeParse({
      facts: ['a'],
      decisions: [],
      todos: [],
      evidenceRefs: ['#e9'],
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && 'evidenceRefs' in parsed.data).toBe(false)
  })

  it('请求可以带会话 id（结账落库的落点），⛔ 但不是必填', () => {
    const base = AssistantOperatorRequestSchema.safeParse({
      domain: 'image',
      messages: [{ role: 'user', content: '嗨' }],
      snapshot: { prompt: '' },
    })
    expect(base.success).toBe(true)
    expect(
      AssistantOperatorRequestSchema.safeParse({
        domain: 'image',
        messages: [{ role: 'user', content: '嗨' }],
        snapshot: { prompt: '' },
        conversationId: 'not-a-uuid',
      }).success,
    ).toBe(false)
  })
})
