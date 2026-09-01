import 'server-only'

import {
  ASSISTANT_FOLDER_VISION_DEFAULT_INSTRUCTION,
  ASSISTANT_OPERATOR_APPEND_SEPARATOR,
  ASSISTANT_OPERATOR_CONFIRM_CHOICES,
  ASSISTANT_OPERATOR_CONFIRM_FIELDS,
  ASSISTANT_OPERATOR_DEFAULT_SEARCH_KINDS,
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_LIMITS as LIMITS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS as REJECT,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS as STATUS,
  ASSISTANT_OPERATOR_STOP_REASONS,
  ASSISTANT_OPERATOR_TOOL_HINTS,
  ASSISTANT_OPERATOR_TOOL_IDS as TOOL,
  ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN,
  ASSISTANT_OPERATOR_WRITE_MODES,
  isAssistantOperatorToolInDomain,
  type AssistantOperatorConfirmField,
  type AssistantOperatorRejectReason,
  type AssistantOperatorSearchKind,
  type AssistantOperatorTool,
} from '@/constants/assistant-operator'
import { assistantAdapterSupportsImage } from '@/constants/assistant'
import { ASSISTANT_DOMAIN_BRIEFS } from '@/constants/assistant-protocol'
import { resolveAssistantModelId } from '@/constants/node-studio'
import {
  inspectAssistantAssetFolder,
  listAssistantAssetFolders,
} from '@/services/kernel/assistant-asset-folder-vision.service'
import {
  buildAssistantConversation,
  completeAssistantTextWithContextRetry,
} from '@/services/kernel/assistant-completion.service'
import {
  resolveLlmTextRoute,
  type ResolvedLlmTextRoute,
} from '@/services/llm-text.service'
import { getPublicGenerationPage } from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'
/**
 * ⭐ 借一条**能看图**的路（P3-C）。加它进钱闸白名单的判据与
 * `web-research.service` 同一条：它是**路由解析**模块 —— 产出是一把 key 加一个
 * adapter，一个字节都不落、一分钱都不扣（真正花钱的那次补全走的仍是本文件已经
 * 在用的 `assistant-completion.service`）。
 * ⛔ 别顺手把 `services/vision/vision-analyzer.service` 也拉进来「省一次往返」：
 * 那条链会落库。
 */
import { findVisionCapableRoute } from '@/services/vision/vision-route.service'
/**
 * ⭐ LoRA 检索（P4-C）。加它进钱闸白名单的判据与上面两条**逐字同源**：它是
 * **检索 + 归一**模块 —— 打 Civitai / HF 的搜索接口，出一串候选对象，
 * 一个字节都不下载、一分钱都不扣、一行 generation 都不创建。
 * ⛔ 别顺手把**导入那条腿**（收藏外部 LoRA 的服务 / 把权重搬进 R2 的 runner 服务）
 * 拉进来「省一次往返」：那条链会下载权重文件、写 R2、写库 —— 与联网搜图的**转存**
 * 那条腿在这份名单里被拒的理由完全一样。⚠ 它们的模块名逐字写在钱闸的禁字表里，
 * 所以这段注释里也不写出来（那份测试扫的是源码文本，注释也算数）。
 * 挂载那一跳留在客户端（与拍板 22 同构）。
 */
import { searchLoraCandidates } from '@/services/lora/lora-candidates.service'
import {
  isWebImageSearchConfigured,
  webImageSearch,
} from '@/services/web-research.service'
import { isLoraBaseModelMountCompatible } from '@/lib/lora-model-compatibility'
import { logger } from '@/lib/logger'
import {
  ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS,
  AssistantOperatorCritiqueSchema,
  AssistantOperatorStepSchema,
  AssistantOperatorTurnSchema,
  type AssistantOperatorCritique,
  type AssistantOperatorEvent,
  type AssistantOperatorRequest,
  type AssistantOperatorSearchResultAsset,
  type AssistantOperatorSnapshot,
  type AssistantOperatorTurn,
} from '@/types/assistant-operator'
import type { OutputType, PromptAssistantResponseLanguage } from '@/types'
import type { AssistantAssetFolderCandidate } from '@/types/asset-folder-vision'
import type { LoraCandidate } from '@/types/lora-candidate'

/**
 * 工作台助手的**工具环**（词表见 `src/constants/assistant-operator.ts`）。
 *
 * ── 一句话形状 ─────────────────────────────────────────────────
 * 一轮 = 最多 `maxSteps` 次「问模型要一个工具调用 → 跑它 → 把结果讲给模型听」。
 * 每一步吐两个 `step` 事件（`running` / `done`），客户端边看边把 op 应用到表单。
 *
 * ── ⛔ 钱闸（本文件的宪法）────────────────────────────────────────
 * **这里没有任何一条路径能创建 generation。** 它只接只读检索、视觉补全与
 * 表单操作规划服务；素材文件夹视觉检查也只读取既有 URL，不写库、不下载。
 * `prime_generate` 也只是吐一个 op 让生成键亮起来 —— 扣扳机的永远是用户（拍板 2）。
 * 有 `assistant-operator.money-gate.test.ts` 逐条锁住这份 import 名单：想在这里
 * 加一条会花钱的路，先过那道测试，而它是设计上过不去的。
 *
 * ── 为什么服务端不存任何状态 ──────────────────────────────────────
 * 拍板 13「插话即转向」的实现就是「客户端 abort + 带新消息重发」。要让它成立，
 * 服务端就不能有会话态 —— 断在半路的一轮不能留下任何痕迹。于是：
 *   · `set_*` / `mount_reference` **不落库**，只吐 op，写入发生在客户端；
 *   · 「刚才做过什么」由客户端在下一次请求里用 `priorSteps` 带回来；
 *   · 就地确认（拍板 3）复用同一条通道：吐 `confirm_request` → 这条流结束 →
 *     客户端带 `confirmations` 重发。**多一条挂起通道就多一份会话态**，
 *     那正是打断语义要躲开的东西。
 */

// ─── 运行态（只活在一轮之内）────────────────────────────────────

/**
 * 工作台快照的**工作副本**。
 *
 * ⚠ 必须是可变副本，不能一直读请求里那份原始快照：第二条 `set_prompt` 的
 * `inverse` 要能撤回到**第一条写完之后**的值，而不是这一轮开始时的值。用原始快照
 * 算逆操作，连改两次再撤一次就会把中间那次的结果一起吞掉。
 */
interface OperatorWorkingState {
  prompt: string
  negativePrompt: string | undefined
  hasNegativeControl: boolean
  modelId: string | null
  modelLabel: string | null
  hasModelControl: boolean
  aspectRatio: string | null
  resolution: string | null
  hasSpecsControl: boolean
  count: number | null
  hasCountControl: boolean
  referenceCount: number
  referenceLimit: number
  hasReferenceControl: boolean
  // ── 视频档专属（P4-A）───────────────────────────────────────────
  /** ⚠ 与图片的 `aspectRatio` / `resolution` **分开存**：两个域不会同时在场，
   *  但共用变量会让「这一格现在归谁管」变成一个要靠 domain 去猜的问题。 */
  videoDurationSeconds: number | null
  videoAspectRatio: string | null
  videoResolution: string | null
  hasVideoSpecsControl: boolean
  audioReferenceCount: number
  audioReferenceLimit: number
  hasAudioReferenceControl: boolean
  /** 挂了音频却一张图/一段视频都没有时，这条线路会不会 400（按线路不按模型）。 */
  audioRequiresVisual: boolean
  /** 三态：`null` = 用户没设过。⛔ 别 `?? false`，见词表 `setSound` 的头注。 */
  soundValue: boolean | null
  soundEffective: boolean
  hasSoundControl: boolean
  // ── LoRA 装配台专属（P4-C）─────────────────────────────────────
  /**
   * 装配台上挂着的那些。**可变**：同一轮里挂一把、再调一次权重，第二步的 `inverse`
   * 要能撤回到第一步之后的值（与 `prompt` 那条同一个理由）。
   * ⛔ **没有 `loraLimit`**：三个后端全不限挂载数（服务端不读 maxLoras 是故意的）。
   */
  loras: {
    id: string
    name: string
    weight: number
    enabled: boolean
    family: string | null
    compatible: boolean
  }[]
  hasLoraControl: boolean
  loraBaseFamily: string | null
  loraMinWeight: number
  loraMaxWeight: number
}

function toWorkingState(
  snapshot: AssistantOperatorSnapshot,
): OperatorWorkingState {
  return {
    prompt: snapshot.prompt,
    negativePrompt: snapshot.negativePrompt,
    // ⚠ 字段缺席 = 没有这个控件，不是「有但空着」（2026-08-22 真机实证）。
    hasNegativeControl: snapshot.negativePrompt !== undefined,
    modelId: snapshot.model?.id ?? null,
    modelLabel: snapshot.model?.label ?? null,
    hasModelControl: snapshot.model !== undefined,
    aspectRatio: snapshot.specs?.aspectRatio ?? null,
    resolution: snapshot.specs?.resolution ?? null,
    hasSpecsControl: snapshot.specs !== undefined,
    count: snapshot.count?.value ?? null,
    hasCountControl: snapshot.count !== undefined,
    referenceCount: snapshot.references?.items.length ?? 0,
    referenceLimit: snapshot.references?.limit ?? 0,
    hasReferenceControl: snapshot.references !== undefined,
    videoDurationSeconds: snapshot.videoSpecs?.durationSeconds ?? null,
    videoAspectRatio: snapshot.videoSpecs?.aspectRatio ?? null,
    videoResolution: snapshot.videoSpecs?.resolution ?? null,
    hasVideoSpecsControl: snapshot.videoSpecs !== undefined,
    audioReferenceCount: snapshot.audioReferences?.items.length ?? 0,
    audioReferenceLimit: snapshot.audioReferences?.limit ?? 0,
    hasAudioReferenceControl: snapshot.audioReferences !== undefined,
    audioRequiresVisual: snapshot.audioReferences?.requiresVisual ?? false,
    soundValue: snapshot.sound?.value ?? null,
    soundEffective: snapshot.sound?.effective ?? false,
    hasSoundControl: snapshot.sound !== undefined,
    // ⚠ 拷一份可变副本，⛔ 别把快照那个只读数组存进来（`apply()` 要往里推）。
    loras: (snapshot.loras?.items ?? []).map((item) => ({ ...item })),
    hasLoraControl: snapshot.loras !== undefined,
    loraBaseFamily: snapshot.loras?.baseFamily ?? null,
    loraMinWeight: snapshot.loras?.minWeight ?? 0,
    loraMaxWeight: snapshot.loras?.maxWeight ?? 0,
  }
}

interface OperatorRun {
  request: AssistantOperatorRequest
  state: OperatorWorkingState
  /**
   * 这一轮说话用的那条路。
   *
   * ⚠ 留在 run 上是为了 `critique_result`：它要先问「这条路看得见图吗」，
   * 看不见才去借（`findVisionCapableRoute`）。没有它就只能在每次看图前重新
   * `resolveLlmTextRoute` 一次 —— 多一次库查询，还可能与规划器用的不是同一条路。
   */
  route: ResolvedLlmTextRoute
  /** 规划器用的模型 id。⚠ 借路时**不能**把它带过去：它是另一个 adapter 的型号。 */
  modelId: string | undefined
  /**
   * 本轮 `search_assets` 真的返回过的素材。
   *
   * ⛔ `mount_reference` 只认这张表里的 id —— 模型给不出 URL，也不许它给。
   * 论据与画布 `attach_asset` 同源：让模型写地址就是让它编一个不存在的地址。
   */
  searchIndex: Map<string, AssistantOperatorSearchResultAsset>
  /** 本轮 `list_asset_folders` 真实返回过的文件夹；视觉检查只认这张准入表。 */
  folderIndex: Map<string, AssistantAssetFolderCandidate>
  /**
   * 本轮 `search_loras` 真的返回过的候选（P4-C）。
   *
   * ⛔ 与 `searchIndex` **分开一张表**：那张表是 `mount_reference` 的准入名单
   * （里面的东西已经是用户的素材），这张表里的候选**还不在本仓里** —— 挂它要先
   * 导入。合成一张的表现是模型拿一个 LoRA 的 candidateId 去挂参考图。
   * ⚠ 存的是完整的 `LoraCandidate`：`mount_lora` 的载荷要从里面取 `importPayload`
   * （那份对象模型碰不到，与 `mount_reference` 的 URL 同一条论据）。
   */
  loraIndex: Map<string, LoraCandidate>
  /**
   * 本轮已经挂过的候选 —— 换个权重再挂一次仍算重复（`executedStepKeys` 按参数比对，
   * 换了 `weight` 就绕过去了，而那正是模型「上一步好像没生效，再来一次」的形状）。
   */
  mountedLoraCandidateIds: Set<string>
  /** 讲给模型听的「刚才发生了什么」。 */
  observations: string[]
  /** 本轮里助手自己写过的字段 —— 覆写自己的东西不需要再问用户一次。 */
  assistantWrittenFields: Set<AssistantOperatorConfirmField>
  /**
   * 本轮**真的执行过**的步（`工具名 + 规范化 args`，见 `operatorStepKey`）。
   *
   * ⭐ 卡死护栏的全部本钱（P3-D）：命中即按 `repeatedStep` 拒。
   * ⚠ 只记执行过的，⛔ 不记被拒的 —— 理由写在 `REJECT.repeatedStep` 的头注里
   * （被拒之后条件可能已经变了，堵住重试等于堵住那条唯一的出路）。
   */
  executedStepKeys: Set<string>
  stepSeq: number
}

/**
 * 一步的**身份**：工具名 + 规范化过的参数。
 *
 * ⚠ 规范化必须做两件事，少一件护栏就形同虚设：
 *   · **键排序** —— `{a,b}` 与 `{b,a}` 是同一次调用，JSON.stringify 说不是；
 *   · **字符串 trim + 转小写** —— 模型重试时最爱换的就是大小写和首尾空格
 *     （"cat poster" / "Cat Poster" 打的是同一次检索）。
 * ⛔ 别改成「只比工具名」：同一轮里对不同字段连下两条 `set_prompt` 是正常的。
 */
function stableArgs(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableArgs).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${key}:${stableArgs(entry)}`)
      .join(',')}}`
  }
  return typeof value === 'string'
    ? value.trim().toLowerCase()
    : String(value as string | number | boolean | null)
}

function operatorStepKey(tool: AssistantOperatorTool, args: unknown): string {
  return `${tool}:${stableArgs(args)}`
}

// ─── 工具计划（纯函数，不碰 IO）──────────────────────────────────

type ToolPlan =
  | { kind: 'rejected'; reason: AssistantOperatorRejectReason; detail?: string }
  | {
      kind: 'confirm'
      field: AssistantOperatorConfirmField
      have: string
      proposed: string
    }
  | {
      kind: 'read'
      payload: unknown
      run(): Promise<{ result: unknown; observation: string }>
    }
  | {
      kind: 'mutate'
      payload: unknown
      inverse: unknown
      observation: string
      apply(): void
    }

function reject(
  reason: AssistantOperatorRejectReason,
  detail?: string,
): ToolPlan {
  return { kind: 'rejected', reason, ...(detail ? { detail } : {}) }
}

/**
 * 截断到**至多 `max` 个字符 —— 省略号也算在里面**。
 *
 * ⚠ 2026-08-30 真机实证：原来的写法 `value.slice(0, max) + '…'` 会产出 `max + 1`
 * 个字符，而这些值紧接着就要过 schema 的 `.max(max)` —— 于是
 *   · `search_assets` 命中任何一条提示词超过 200 字的素材 → `toStepEvent` 当场抛，
 *     整轮以一句笼统的「run failed midway」结束（日志停在 `running` 那一半）；
 *   · `confirm_request` 遇到超过 200 字的手写提示词 → 客户端 `safeParse` 丢帧，
 *     表现是「流停了但确认条从没出现」。
 * 两处都是「用户内容越长越容易炸」，而短内容一路绿灯 —— 最难自查的一类。
 * ⛔ 别改 schema 的上限去将就它：上限是协议，截断是实现。
 */
function clamp(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value
}

/**
 * 规格档位**此刻真的能选吗**。
 *
 * ⚠ 判据是「两张表都非空」，不是「specs 这一节在不在」：本仓的比例表是常量
 * （永远非空），而清晰度表由**已选模型的能力**算出来（`use-assistant-operator.ts`
 * 的 `resolutionOptions`：没选模型就是 `[]`）。于是「控件在、但一个值都选不了」
 * 是真机上的常态，而 `set_specs` 的两个字段都是必填 —— 空表时它无解。
 */
function hasUsableSpecOptions(snapshot: AssistantOperatorSnapshot): boolean {
  const specs = snapshot.specs
  return (
    specs !== undefined &&
    specs.aspectRatioOptions.length > 0 &&
    specs.resolutionOptions.length > 0
  )
}

/**
 * 视频规格**此刻真的能设吗**（P4-A）。
 *
 * ⚠ 判据与图片那条**不同，是有意的**：图片要求两张表都非空（比例与清晰度必须
 * 同时给，台账 AE/BG/BS）；视频只要求**任意一张非空** —— 三个参数在
 * `buildVideoInput` 里是三个独立字段，而且逐型号有无（Kling V3 Pro 没有分辨率、
 * HappyHorse 没有时长）。照搬「两张都要非空」会让这些型号上的时长永远设不了。
 */
function hasUsableVideoSpecOptions(
  snapshot: AssistantOperatorSnapshot,
): boolean {
  const specs = snapshot.videoSpecs
  return (
    specs !== undefined &&
    (specs.durationOptions.length > 0 ||
      specs.aspectRatioOptions.length > 0 ||
      specs.resolutionOptions.length > 0)
  )
}

// ─── 状态渲染（`read_state` 的产出，也是每轮喂给模型的那段）────────

/**
 * 把工作副本渲染成给模型看的一段。
 *
 * 三条规矩与 `lib/assistant-workbench-state.ts` 逐条相同 —— 空态要说出来、不冒充
 * 自己不知道的事、有上限。多的那条是**可选值必须一起给**：不给列表，模型只会编一个
 * （画布 `[[setup]]` 真机上编出过一个工作区里根本不存在的「Animagine XL」）。
 */
function renderState(run: OperatorRun): string {
  const { state, request } = run
  const lines: string[] = []

  lines.push(
    `- Positive prompt: ${
      state.prompt
        ? `"${clamp(state.prompt, LIMITS.maxConfirmHaveChars)}"`
        : '(empty)'
    }`,
  )
  lines.push(
    state.hasNegativeControl
      ? `- Negative prompt: ${
          state.negativePrompt
            ? `"${clamp(state.negativePrompt, LIMITS.maxConfirmHaveChars)}"`
            : '(empty)'
        }`
      : '- Negative prompt: THIS WORKBENCH HAS NO NEGATIVE PROMPT FIELD — set_negative will be refused here.',
  )

  if (!state.hasModelControl) {
    lines.push('- Model: this workbench does not pick a model.')
  } else if (!state.modelId) {
    lines.push('- Model: NOT SELECTED YET')
  } else {
    lines.push(
      `- Model: ${state.modelLabel ?? state.modelId} (id: ${state.modelId})`,
    )
  }

  const models = request.snapshot.availableModels.slice(
    0,
    LIMITS.maxAvailableModels,
  )
  lines.push(
    models.length > 0
      ? `- Models you can switch to (copy the id verbatim): ${models
          .map((model) =>
            model.label === model.id
              ? model.id
              : `${model.id} — ${model.label}`,
          )
          .join(' | ')}`
      : '- Models you can switch to: none listed — do not call set_model.',
  )

  if (state.hasVideoSpecsControl) {
    // ⭐ 视频档（P4-A）。⚠ **一格一格地说「有没有档位」** —— 三个参数逐型号有无，
    //    印一个空表等于邀请模型去填一个这台机器上不存在的参数。
    const specs = request.snapshot.videoSpecs
    if (!hasUsableVideoSpecOptions(request.snapshot)) {
      lines.push(
        state.hasModelControl && !state.modelId
          ? '- Clip specs: LOCKED — length / aspect ratio / resolution all come from the model, and no model is picked yet. Call set_model; set_video_specs is refused until the options actually show up here.'
          : '- Clip specs: this model exposes no length / aspect-ratio / resolution options — set_video_specs will be refused.',
      )
    } else {
      lines.push(
        specs && specs.durationOptions.length > 0
          ? // ⚠ 档位印成**裸数字**，单位写在标签上：印 `4s, 5s` 的话模型会照抄成
            //   `durationSeconds: "10s"`，而那是个字符串，进不了 schema。
            `- Clip length (durationSeconds, a plain number of seconds): ${
              state.videoDurationSeconds ?? '(not set)'
            } — options: ${specs.durationOptions.join(', ')}`
          : '- Clip length: this model does not take a length — omit durationSeconds.',
      )
      lines.push(
        specs && specs.aspectRatioOptions.length > 0
          ? `- Aspect ratio: ${state.videoAspectRatio ?? '(not set)'} — options: ${specs.aspectRatioOptions.join(', ')}`
          : '- Aspect ratio: this model does not take one — omit aspectRatio.',
      )
      lines.push(
        specs && specs.resolutionOptions.length > 0
          ? `- Resolution: ${state.videoResolution ?? '(not set — the model picks)'} — options: ${specs.resolutionOptions.join(', ')}`
          : '- Resolution: this model does not take one — omit resolution.',
      )
      lines.push(
        '  (set_video_specs carries every one of these that HAS options, in a single call.)',
      )
    }
  } else if (!state.hasSpecsControl) {
    lines.push(
      '- Output specs: this workbench has no aspect-ratio / resolution controls.',
    )
  } else if (!hasUsableSpecOptions(request.snapshot)) {
    // ⭐ 一个值都选不了的时候**不列空表、也不邀请调用**：原来这里照样印
    //    「Resolution: (not set) — options: (none)」，模型读作「填一个吧」，
    //    然后连着撞三次 schema（2026-08-30 真机三连红）。把下一步直接说出来。
    lines.push(
      state.hasModelControl && !state.modelId
        ? '- Output specs: LOCKED — the aspect-ratio / resolution options come from the model, and no model is picked yet. Call set_model; set_specs is refused until the options actually show up here.'
        : '- Output specs: no aspect-ratio / resolution options are available on this workbench right now — set_specs will be refused.',
    )
  } else {
    const specs = request.snapshot.specs
    lines.push(
      `- Aspect ratio: ${state.aspectRatio ?? '(not set)'} — options: ${
        specs?.aspectRatioOptions.join(', ') || '(none)'
      }`,
    )
    lines.push(
      `- Resolution: ${state.resolution ?? '(not set)'} — options: ${
        specs?.resolutionOptions.join(', ') || '(none)'
      }`,
    )
    lines.push(
      '  (set_specs always carries BOTH of these — one without the other is not a real aspect ratio in this app.)',
    )
  }

  if (!state.hasCountControl) {
    lines.push(
      // ⚠ 视频档说清楚**为什么**没有：一句「没有这个控件」会让模型接着找别的路
      //   去要两条，而真相是「一次就是一条，这不是限制而是这个工作台的形状」。
      state.hasVideoSpecsControl
        ? '- Outputs per send: exactly one clip. There is no count control here and set_count is refused — never promise variations in one send.'
        : '- Outputs per send: this workbench has no count control.',
    )
  } else {
    lines.push(
      `- Outputs per send: ${state.count} — options: ${
        request.snapshot.count?.options.join(', ') ?? ''
      }`,
    )
  }

  lines.push(
    state.hasReferenceControl
      ? `- Reference images mounted: ${state.referenceCount}/${state.referenceLimit}`
      : '- Reference images: this workbench takes no reference images.',
  )

  // ── 视频档的两条（P4-A）──────────────────────────────────────────
  if (state.hasAudioReferenceControl) {
    const items = request.snapshot.audioReferences?.items ?? []
    lines.push(
      `- Voice / audio references mounted: ${state.audioReferenceCount}/${state.audioReferenceLimit}${
        items.length > 0
          ? ` — ${items
              .map(
                (item, index) =>
                  `@Audio${index + 1}${item.ownerName ? ` = ${item.ownerName}` : ' (nobody named yet)'}`,
              )
              .join(', ')}`
          : ''
      }`,
    )
    /**
     * ⭐ 台账 A ②：这条**按线路不按模型**（同一个 Seedance 2.5，火山/BytePlus 允许
     * 纯音频参考，fal 那条不允许）。说出来是为了让助手在挂声音之前先挂一张图 ——
     * 否则用户点生成才被服务端 400 顶回来，而那一下什么都没发生却像是失败了。
     */
    if (state.audioRequiresVisual) {
      lines.push(
        '  (this route refuses audio-only input: mount at least one reference image alongside the audio, or the send is rejected.)',
      )
    }
  }

  if (state.hasSoundControl) {
    lines.push(
      `- Clip soundtrack: currently ${state.soundEffective ? 'ON' : 'OFF'}${
        state.soundValue === null
          ? ' (the creator has not touched this — it is whatever the model normally does; leave it alone unless they ask for sound or silence)'
          : ' (the creator set this deliberately)'
      }`,
    )
  }

  // ── LoRA 装配台（P4-C）────────────────────────────────────────────
  //
  // ⚠ 整段**只在有挂载工具的域里印**（同看图那条）：在图片档印一句「这个工作台
  //    没有 LoRA 挂载栈」，读起来像是在邀请它去找一条不存在的路。
  if (isAssistantOperatorToolInDomain(TOOL.mountLora, request.domain)) {
    if (!state.hasLoraControl) {
      lines.push(
        '- LoRA stack: this workbench has no LoRA stack — mount_lora / unmount_lora / set_lora_weight will be refused.',
      )
    } else {
      lines.push(
        `- Base model family: ${state.loraBaseFamily ?? '(not resolved — pick a base model first)'}`,
      )
      lines.push(
        state.loras.length === 0
          ? '- LoRA stack: EMPTY — nothing mounted yet.'
          : `- LoRA stack (${state.loras.length} mounted): ${state.loras
              .map(
                (item) =>
                  `id=${item.id} "${item.name}" weight ${item.weight}${
                    item.enabled ? '' : ' [MUTED by the creator]'
                  }${
                    item.compatible
                      ? ''
                      : ` [⚠ built for ${item.family ?? 'an unknown base'} — will NOT load on the selected base]`
                  }`,
              )
              .join(' | ')}`,
      )
      /**
       * ⭐ 这一句是**产品事实不是客套**：本仓三个后端全不限挂载数。不说出来的话
       * 模型会按别处的常识（多数产品限 3–5 把）自己发明一条上限，然后劝用户
       * 先摘一把 —— 一条没人写过的限制被凭空转述给用户，是最难查的那种错。
       */
      lines.push(
        `  (there is NO limit on how many LoRAs can be stacked. Weight range: ${state.loraMinWeight}–${state.loraMaxWeight}. Ids above are mounted-item ids — search_loras returns candidateIds, which are different things.)`,
      )
    }
  }

  /**
   * ⭐ 拍板 4 的一半写在这一行上：**有 `result` 才说有**。
   * 客户端只在「这一次生成是助手 primed 的那一枪」时才把它带上来，用户自己点的
   * 那些永远不在这里 —— 所以模型看不到、也就无从去评价它没资格评价的东西。
   *
   * ⚠ 整行**只在有看图工具的域里印**（P4-A）：视频域没有 `critique_result`
   * （借来的那条视觉线读不了 mp4），印一句「调 critique_result 去看」等于教它
   * 白烧一步撞 `noSuchControl`。
   */
  if (isAssistantOperatorToolInDomain(TOOL.critiqueResult, request.domain)) {
    const result = request.result
    lines.push(
      result
        ? `- A FRESH RESULT from the run you armed is waiting: ${
            result.modelLabel ? `made by ${result.modelLabel}, ` : ''
          }prompt was "${clamp(result.prompt ?? '', LIMITS.maxConfirmHaveChars)}". Call critique_result to actually look at it before you touch anything else.`
        : '- No fresh result of yours is waiting. critique_result will be refused; you only ever get to review the runs you armed yourself.',
    )
  }

  return lines.join('\n')
}

// ─── 工具规划 ───────────────────────────────────────────────────

function planReadState(run: OperatorRun): ToolPlan {
  return {
    kind: 'read',
    payload: {},
    run: async () => {
      const digest = renderState(run)
      return { result: { digest }, observation: `Workbench state:\n${digest}` }
    },
  }
}

/**
 * 库里的 `outputType` → 操作员的检索类型。
 *
 * ⚠ 有意用 `Partial`：`AUDIO` / `MODEL_3D` **没有对应值**，因为工作台上没有把它们
 * 挂成参考的槽（见 `ASSISTANT_OPERATOR_SEARCH_KINDS` 头注）。查不到映射的记录会被
 * 直接过滤掉，而不是硬塞成 image —— 塞进去的表现是给用户一条挂不上去的候选。
 */
const SEARCH_KIND_BY_OUTPUT_TYPE: Partial<
  Record<OutputType, AssistantOperatorSearchKind>
> = {
  IMAGE: 'image',
  VIDEO: 'video',
  /** P4-A：视频工作台的音频参考面板就是那个槽（台账 A）。3D 仍然没有。 */
  AUDIO: 'audio',
}

function planSearchAssets(
  run: OperatorRun,
  args: { query: string; kind?: AssistantOperatorSearchKind; limit?: number },
  userId: string,
): ToolPlan {
  const limit = Math.min(
    args.limit ?? LIMITS.maxSearchResults,
    LIMITS.maxSearchResults,
  )
  const kind = args.kind ?? null

  return {
    kind: 'read',
    payload: { query: args.query, kind, limit },
    run: async () => {
      const page = await getPublicGenerationPage({
        // ⭐ 素材关键词检索只查这个用户自己的库（`userId` 一给，
        //    `buildGalleryWhere` 就不再要求 isPublic）。复用现有分页查询，不新写。
        userId,
        search: args.query,
        // ⚠ 不写 kind 时**不搜音频**（见 `ASSISTANT_OPERATOR_DEFAULT_SEARCH_KINDS`）：
        //    泛搜混进一堆挂不到参考图位上的音频，只会让候选变脏。
        type: kind ? [kind] : [...ASSISTANT_OPERATOR_DEFAULT_SEARCH_KINDS],
        limit,
        sort: 'newest',
      })

      const assets = page.generations
        // 没出完 / 失败的那些没有 url，挂不上去，别端给模型；类型不在可挂表里的
        // 同理（正常查不到，但这条 filter 让「查到了也挂不上」不可能发生）。
        .flatMap((generation) => {
          const kind = SEARCH_KIND_BY_OUTPUT_TYPE[generation.outputType]
          return generation.url && kind
            ? [{ generation, url: generation.url, kind }]
            : []
        })
        .slice(0, limit)
        .map(({ generation, url, kind }) => ({
          assetId: generation.id,
          url,
          ...(generation.thumbnailUrl
            ? { thumbnailUrl: generation.thumbnailUrl }
            : {}),
          kind,
          ...(generation.prompt
            ? {
                prompt: clamp(
                  generation.prompt,
                  LIMITS.maxPriorStepSummaryChars,
                ),
              }
            : {}),
          ...(generation.model ? { model: generation.model } : {}),
          createdAt: generation.createdAt.toISOString(),
        }))

      for (const asset of assets) run.searchIndex.set(asset.assetId, asset)

      const observation =
        assets.length === 0
          ? // 空结果说出来 —— 静默的空结果会让模型接着编一个 id 出来挂。
            `search_assets("${args.query}") found NOTHING in the creator's library. Do not invent an asset id; say so or try a different word.`
          : `search_assets("${args.query}") → ${assets.length} asset(s):\n${assets
              .map(
                (asset, index) =>
                  `  ${index + 1}. assetId=${asset.assetId} · ${asset.kind}${
                    asset.prompt ? ` · "${asset.prompt}"` : ''
                  }`,
              )
              .join('\n')}`

      return {
        result: { totalFound: page.total, assets },
        observation,
      }
    },
  }
}

function planListAssetFolders(
  run: OperatorRun,
  args: { query: string; limit?: number },
  userId: string,
): ToolPlan {
  const limit = Math.min(
    args.limit ?? LIMITS.maxFolderMatches,
    LIMITS.maxFolderMatches,
  )

  return {
    kind: 'read',
    payload: { query: args.query, limit },
    run: async () => {
      const folders = await listAssistantAssetFolders({
        userId,
        query: args.query,
        limit,
      })
      for (const folder of folders) {
        run.folderIndex.set(folder.folderId, folder)
      }

      const observation =
        folders.length === 0
          ? `list_asset_folders("${args.query}") found NOTHING. Do not invent a folder id; ask for a different name.`
          : `list_asset_folders("${args.query}") → ${folders.length} folder(s):\n${folders
              .map(
                (folder, index) =>
                  `  ${index + 1}. folderId=${folder.folderId} · ${folder.path} · ${folder.imageCount} image(s)`,
              )
              .join(
                '\n',
              )}\nUse the full paths to disambiguate duplicates. inspect_asset_folder only accepts one of these folderIds.`

      return { result: { folders }, observation }
    },
  }
}

function planInspectAssetFolder(
  run: OperatorRun,
  args: { folderId: string; instruction?: string },
  userId: string,
): ToolPlan {
  const listedFolder = run.folderIndex.get(args.folderId)
  if (!listedFolder) {
    return reject(
      REJECT.unknownFolder,
      'Only folder ids returned by list_asset_folders in this run can be inspected. Call list_asset_folders first and use one of its exact ids.',
    )
  }

  const instruction =
    args.instruction ?? ASSISTANT_FOLDER_VISION_DEFAULT_INSTRUCTION

  return {
    kind: 'read',
    payload: { folderId: listedFolder.folderId, instruction },
    run: async () => {
      const result = await inspectAssistantAssetFolder({
        userId,
        folderId: listedFolder.folderId,
        instruction,
        ...(run.request.apiKeyId ? { apiKeyId: run.request.apiKeyId } : {}),
      })

      const observation =
        result.inspectedImages === 0
          ? `inspect_asset_folder("${result.folder.path}") found 0 viewable images. Do not describe this folder as if you saw anything.`
          : [
              `inspect_asset_folder("${result.folder.path}") — ACTUALLY VIEWED ${result.inspectedImages}/${result.totalImages} image(s) in ${result.batchCount} batch(es).${result.truncated ? ` ${result.totalImages - result.inspectedImages} image(s) were NOT viewed; never describe them.` : ' The whole folder was covered.'}`,
              ...result.findings.map(
                (finding, index) =>
                  `  ${index + 1}. assetId=${finding.assetId} · relevance=${finding.relevance} · ${finding.observation} · why: ${finding.reason}${finding.tags.length > 0 ? ` · tags: ${finding.tags.join(', ')}` : ''}`,
              ),
              ...result.batchSummaries.map(
                (summary, index) => `  batch ${index + 1} summary: ${summary}`,
              ),
              ...(result.uncertainties.length > 0
                ? [`  uncertainties: ${result.uncertainties.join(' | ')}`]
                : []),
            ].join('\n')

      return { result, observation }
    },
  }
}

/**
 * 联网搜图（P3-B）。
 *
 * ⭐ **本文件里唯一一个连"可挂载"都算不上的读工具**：它返回的候选没有 `assetId`，
 * 所以 `mount_reference`（只吃 assetId）在类型上就够不着它们。转存由**用户点选**
 * 触发，走另一条 API 路由 —— owner 2026-08-30 原话「主要是给个预览的功能，
 * 用户确定了再落 R2」。⛔ 别在这里"顺手"加一条导入：那需要 import 上传/落库模块，
 * 而 money-gate 的 import 白名单就是为了挡住这件事。
 *
 * ⚠ 候选**不进 `run.searchIndex`**。那张表是 `mount_reference` 的准入名单，往里
 * 塞一个没有 assetId 的东西，等于让模型可以把一串第三方地址当成用户的素材挂上去
 * （画布 `attach_asset` 那条论据的同一个坑）。
 */
function planSearchWebImages(
  run: OperatorRun,
  args: { query: string; limit?: number },
): ToolPlan {
  if (!isWebImageSearchConfigured()) {
    return reject(
      REJECT.searchUnavailable,
      'Web image search is not wired up on this deployment. Work with the library and the form instead.',
    )
  }

  const limit = Math.min(
    args.limit ?? LIMITS.maxWebImageResults,
    LIMITS.maxWebImageResults,
  )

  return {
    kind: 'read',
    payload: { query: args.query, limit },
    run: async () => {
      const found = await webImageSearch(args.query, { num: limit })
      const images = found.slice(0, limit).map((image) => ({
        imageUrl: image.imageUrl,
        ...(image.thumbnailUrl ? { thumbnailUrl: image.thumbnailUrl } : {}),
        ...(image.pageUrl ? { pageUrl: image.pageUrl } : {}),
        ...(image.domain
          ? { domain: clamp(image.domain, LIMITS.maxLabelChars) }
          : {}),
        ...(image.title
          ? { title: clamp(image.title, LIMITS.maxPriorStepSummaryChars) }
          : {}),
        ...(image.width ? { width: image.width } : {}),
        ...(image.height ? { height: image.height } : {}),
      }))

      // ⭐ 观察里**每次都要重申一遍「这只是预览」**：模型看到一串 URL 的第一反应
      //    是拿去用（挂参考 / 写进提示词），而那些地址在本仓里还不存在任何东西。
      const observation =
        images.length === 0
          ? `search_web_images("${args.query}") came back empty. Do not invent image URLs; try different words or work with what the creator already has.`
          : `search_web_images("${args.query}") → ${images.length} PREVIEW candidate(s) shown to the creator:\n${images
              .map(
                (image, index) =>
                  `  ${index + 1}. ${image.domain ?? 'web'}${
                    image.title ? ` · "${image.title}"` : ''
                  }`,
              )
              .join(
                '\n',
              )}\nThese are previews only — nothing was saved. You cannot mount, import, or reference any of them. The creator picks one in the log entry and the app files it into their library; tell them to pick, then move on.`

      return { result: { totalFound: images.length, images }, observation }
    },
  }
}

/**
 * 用户亲手递来的地址 → 取图入库并挂上（P3-D，拍板 22）。
 *
 * ── 「你递的就是确认」为什么是**结构性**的 ────────────────────────
 * 唯一的准入判据：这条 URL 逐字出现在本次请求的某条**用户消息**里。
 * ⛔ 不问模型「这是用户给的吗」—— 那是一句它编得出来的话，等于没有闸。
 * ⛔ 不放宽成同域名 / 前缀匹配：用户给一张图的地址，不等于把那个站交出去。
 * 助手自己搜来的候选照旧要用户点「选用」（拍板 21），两条路的区别只有这一条。
 *
 * ── 服务端在这一步做了什么 ──────────────────────────────────────
 * **一个字节都没碰。** 它只吐一个带着源地址的 op；取图 / 落 R2 / 落库全部发生在
 * 客户端那一跳（既有导入路由）。钱闸那份 import 白名单因此一条都不用松 ——
 * 这也是为什么载荷里是源地址而不是落地地址（后者此刻还不存在）。
 */
function planImportUserUrl(run: OperatorRun, args: { url: string }): ToolPlan {
  if (!run.state.hasReferenceControl) return reject(REJECT.noSuchControl)

  const fromCreator = run.request.messages.some(
    (message) => message.role === 'user' && message.content.includes(args.url),
  )
  if (!fromCreator) {
    return reject(
      REJECT.urlNotFromUser,
      'That address is not in anything the creator wrote. Only links they typed themselves can be imported directly — for pictures you found, call search_web_images and let them press "use this".',
    )
  }

  if (run.state.referenceCount >= run.state.referenceLimit) {
    return reject(REJECT.referencesFull)
  }

  // ⚠ 现算，⛔ 不让模型写：它只用于日志详情那行小字，而模型写的域名会与地址不符。
  let domain: string | null = null
  try {
    domain = new URL(args.url).hostname || null
  } catch {
    domain = null
  }

  return {
    kind: 'mutate',
    payload: {
      url: args.url,
      ...(domain ? { domain: clamp(domain, LIMITS.maxLabelChars) } : {}),
    },
    // ⚠ 逆操作也只能是源地址 —— 客户端按对照表反查它挂上去的那一张（见词表头注）。
    inverse: { url: args.url },
    observation: `Imported the link the creator handed you (${
      domain ?? 'web'
    }) and mounted it as a reference (${run.state.referenceCount + 1}/${
      run.state.referenceLimit
    }). It is already on the form — do not ask them to download, upload, or attach anything.`,
    apply: () => {
      run.state.referenceCount += 1
    },
  }
}

function planMountReference(
  run: OperatorRun,
  args: { assetId: string },
): ToolPlan {
  if (!run.state.hasReferenceControl) return reject(REJECT.noSuchControl)

  const asset = run.searchIndex.get(args.assetId)
  if (!asset) {
    return reject(
      REJECT.unknownAsset,
      'Only asset ids returned by search_assets in this run can be mounted.',
    )
  }
  if (run.state.referenceCount >= run.state.referenceLimit) {
    return reject(REJECT.referencesFull)
  }

  return {
    kind: 'mutate',
    payload: {
      assetId: asset.assetId,
      url: asset.url,
      ...(asset.thumbnailUrl ? { thumbnailUrl: asset.thumbnailUrl } : {}),
      kind: asset.kind,
      ...(asset.model ? { label: asset.model } : {}),
    },
    inverse: { assetId: asset.assetId },
    observation: `Mounted ${asset.assetId} as a reference (${
      run.state.referenceCount + 1
    }/${run.state.referenceLimit}).`,
    apply: () => {
      run.state.referenceCount += 1
    },
  }
}

function planSetModel(run: OperatorRun, args: { modelId: string }): ToolPlan {
  if (!run.state.hasModelControl) return reject(REJECT.noSuchControl)

  const match = run.request.snapshot.availableModels.find(
    (model) => model.id === args.modelId,
  )
  if (!match) {
    return reject(
      REJECT.unknownModel,
      `"${clamp(args.modelId, LIMITS.maxLabelChars)}" is not in availableModels.`,
    )
  }

  const previousId = run.state.modelId
  return {
    kind: 'mutate',
    payload: { modelId: match.id, modelLabel: match.label },
    inverse: { modelId: previousId },
    observation: `Model is now ${match.label} (${match.id}).`,
    apply: () => {
      run.state.modelId = match.id
      run.state.modelLabel = match.label
    },
  }
}

/**
 * 写文本框的共用一条（正面 / 负面）。
 *
 * ⭐ 就地确认闸在这里（拍板 3）：目标字段里已经有**用户手写**的内容、而这一轮
 * 助手还没写过它、用户也还没就这个字段表过态 → 返回 `confirm`，流就停在这儿。
 * 「助手自己刚写的」不再问 —— 覆盖自己的草稿不需要用户点三次头。
 */
function planSetText(
  run: OperatorRun,
  field: AssistantOperatorConfirmField,
  args: { value: string; mode?: string },
): ToolPlan {
  const isPrompt = field === ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt
  if (!isPrompt && !run.state.hasNegativeControl) {
    return reject(REJECT.noSuchControl)
  }
  if (!args.value.trim()) return reject(REJECT.emptyValue)

  const current = isPrompt ? run.state.prompt : (run.state.negativePrompt ?? '')
  const decision = run.request.confirmations?.find(
    (entry) => entry.field === field,
  )?.choice

  if (current.trim() && !run.assistantWrittenFields.has(field)) {
    if (!decision) {
      return {
        kind: 'confirm',
        field,
        have: clamp(current, LIMITS.maxConfirmHaveChars),
        proposed: clamp(args.value, LIMITS.maxConfirmHaveChars),
      }
    }
    if (decision === ASSISTANT_OPERATOR_CONFIRM_CHOICES.keep) {
      return reject(
        REJECT.userDeclined,
        'The creator chose to keep what they wrote.',
      )
    }
  }

  const appendRequested =
    args.mode === ASSISTANT_OPERATOR_WRITE_MODES.append ||
    decision === ASSISTANT_OPERATOR_CONFIRM_CHOICES.append
  // 空框追加什么都追加不到，退回整段写入 —— 免得 inverse 里存一个假的「原文」。
  const mode =
    appendRequested && current.trim()
      ? ASSISTANT_OPERATOR_WRITE_MODES.append
      : ASSISTANT_OPERATOR_WRITE_MODES.replace

  const next =
    mode === ASSISTANT_OPERATOR_WRITE_MODES.append
      ? `${current}${ASSISTANT_OPERATOR_APPEND_SEPARATOR}${args.value}`
      : args.value

  return {
    kind: 'mutate',
    payload: { value: args.value, mode },
    // ⚠ 逆操作永远是改前的完整原文，两种 mode 撤法因此完全一样。
    inverse: { value: current },
    observation: `${isPrompt ? 'Positive' : 'Negative'} prompt (${mode}) is now: "${clamp(
      next,
      LIMITS.maxPriorStepSummaryChars,
    )}"`,
    apply: () => {
      if (isPrompt) run.state.prompt = next
      else run.state.negativePrompt = next
      run.assistantWrittenFields.add(field)
    },
  }
}

/**
 * `set_specs` 到底**能不能调**，与模型填了什么参数无关。
 *
 * ⭐ 它必须跑在 args schema **之前**（见 `planTool`）。`set_specs` 的两个字段都是
 * 必填非空串，而没选模型时清晰度档位表是空的 —— 模型无论填什么都过不了那道
 * schema，用户看到的是连着三条「参数形状不对」而表单一个字没动
 * （2026-08-30 真机实测：一句「比例 3:4」换来三连红 + 零改动）。
 * 让 schema 去抓就只能得到这个结果：`malformedArgs` 不可教，模型只会换个值再撞
 * 一次；这里说「先用 set_model 选模型」，它下一步就能改口。
 *
 * ⚠ 空表分两种成因，理由不同：**没选模型**（可教，指向 `set_model`）与
 * **这台工作台就是没有这组档位**（`noSuchControl`，拍板 19 那一条）。合成一个
 * 会让前一种失去唯一的出路。
 */
function planSpecsPrecondition(run: OperatorRun): ToolPlan | null {
  if (!run.state.hasSpecsControl) return reject(REJECT.noSuchControl)
  if (hasUsableSpecOptions(run.request.snapshot)) return null

  return run.state.hasModelControl && !run.state.modelId
    ? reject(
        REJECT.noModelSelected,
        // ⚠ 说实话：档位表来自**请求里那份快照**，本轮不会因为 set_model 而变。
        //    写成「选完就能设」会让模型在同一轮里再撞一次（那次会落到下面那支）。
        'The resolution options come from the model. Call set_model first — the options only show up on a later turn, so do not retry set_specs in this run.',
      )
    : reject(
        REJECT.noSuchControl,
        'This workbench lists no aspect-ratio / resolution options to pick from.',
      )
}

/** ⚠ 只从 `planTool` 来，且 `planSpecsPrecondition` 已经放行 —— 档位表非空。 */
function planSetSpecs(
  run: OperatorRun,
  args: { aspectRatio: string; resolution: string },
): ToolPlan {
  const specs = run.request.snapshot.specs
  if (!specs?.aspectRatioOptions.includes(args.aspectRatio)) {
    return reject(REJECT.unknownValue, `aspectRatio "${args.aspectRatio}"`)
  }
  if (!specs.resolutionOptions.includes(args.resolution)) {
    return reject(REJECT.unknownValue, `resolution "${args.resolution}"`)
  }

  const previous = {
    aspectRatio: run.state.aspectRatio,
    resolution: run.state.resolution,
  }
  return {
    kind: 'mutate',
    // ⚠ 台账 AE/BG/BS：两个字段必须同时下发，缺一个就不是真比例。
    payload: { aspectRatio: args.aspectRatio, resolution: args.resolution },
    inverse: previous,
    observation: `Specs are now ${args.aspectRatio} · ${args.resolution}.`,
    apply: () => {
      run.state.aspectRatio = args.aspectRatio
      run.state.resolution = args.resolution
    },
  }
}

/**
 * `set_video_specs` 的前置闸（P4-A）。
 *
 * ⭐ 与 `planSpecsPrecondition` **同一个模式**（跑在 args schema 之前、按成因分岔
 * 出可教的理由），⛔ 不是同一段代码：它判的是「三张表里有没有一张非空」，
 * 而那边判的是「两张表是不是都非空」。
 */
function planVideoSpecsPrecondition(run: OperatorRun): ToolPlan | null {
  if (!run.state.hasVideoSpecsControl) return reject(REJECT.noSuchControl)
  if (hasUsableVideoSpecOptions(run.request.snapshot)) return null

  return run.state.hasModelControl && !run.state.modelId
    ? reject(
        REJECT.noModelSelected,
        // ⚠ 与图片那条同一句实话：档位表来自**请求里那份快照**，本轮不会因为
        //    set_model 而变。写成「选完就能设」会让模型在同一轮里再撞一次。
        'The clip specs come from the model. Call set_model first — the options only show up on a later turn, so do not retry set_video_specs in this run.',
      )
    : reject(
        REJECT.noSuchControl,
        'This model exposes no length / aspect-ratio / resolution options to pick from.',
      )
}

/**
 * 视频规格三格（P4-A）。⚠ 只从 `planTool` 来，且前置闸已经放行 —— 至少一张表非空。
 *
 * ⭐ 载荷与逆操作**永远带齐三格**（见契约里那段头注）：这一步只改了时长时，
 * 另两格原样带上，撤销因此一定落回一个真实存在过的三元组。
 */
function planSetVideoSpecs(
  run: OperatorRun,
  args: {
    durationSeconds?: number
    aspectRatio?: string
    resolution?: string
  },
): ToolPlan {
  const specs = run.request.snapshot.videoSpecs
  if (!specs) return reject(REJECT.noSuchControl)

  const touched =
    args.durationSeconds !== undefined ||
    args.aspectRatio !== undefined ||
    args.resolution !== undefined
  if (!touched) {
    return reject(
      REJECT.emptyValue,
      'set_video_specs needs at least one of durationSeconds / aspectRatio / resolution.',
    )
  }

  if (args.durationSeconds !== undefined) {
    if (!specs.durationOptions.includes(args.durationSeconds)) {
      return reject(
        REJECT.unknownValue,
        `durationSeconds ${args.durationSeconds} — options are ${
          specs.durationOptions.join(', ') ||
          '(none: this model takes no length)'
        }`,
      )
    }
  }
  if (args.aspectRatio !== undefined) {
    if (!specs.aspectRatioOptions.includes(args.aspectRatio)) {
      return reject(
        REJECT.unknownValue,
        `aspectRatio "${args.aspectRatio}" — options are ${
          specs.aspectRatioOptions.join(', ') ||
          '(none: this model takes no aspect ratio)'
        }`,
      )
    }
  }
  if (args.resolution !== undefined) {
    if (!specs.resolutionOptions.includes(args.resolution)) {
      return reject(
        REJECT.unknownValue,
        `resolution "${args.resolution}" — options are ${
          specs.resolutionOptions.join(', ') ||
          '(none: this model picks its own resolution)'
        }`,
      )
    }
  }

  const previous = {
    durationSeconds: run.state.videoDurationSeconds,
    aspectRatio: run.state.videoAspectRatio,
    resolution: run.state.videoResolution,
  }
  const next = {
    durationSeconds: args.durationSeconds ?? previous.durationSeconds,
    aspectRatio: args.aspectRatio ?? previous.aspectRatio,
    resolution: args.resolution ?? previous.resolution,
  }

  return {
    kind: 'mutate',
    payload: next,
    inverse: previous,
    observation: `Clip specs are now ${
      [
        next.durationSeconds === null ? null : `${next.durationSeconds}s`,
        next.aspectRatio,
        next.resolution,
      ]
        .filter(Boolean)
        .join(' · ') || '(nothing set)'
    }.`,
    apply: () => {
      run.state.videoDurationSeconds = next.durationSeconds
      run.state.videoAspectRatio = next.aspectRatio
      run.state.videoResolution = next.resolution
    },
  }
}

/**
 * 挂音频参考（P4-A，台账 A）。
 *
 * ⚠ 与 `planMountReference` 逐条同构（只认本轮检索过的 id、满了就拒），
 * 差别只有两处：吃的是 `audio` 那一类，多一个**角色归属**。
 */
function planMountAudioReference(
  run: OperatorRun,
  args: { assetId: string; ownerName?: string },
): ToolPlan {
  if (!run.state.hasAudioReferenceControl) {
    return reject(
      REJECT.noSuchControl,
      'This route takes no voice / audio references.',
    )
  }

  const asset = run.searchIndex.get(args.assetId)
  if (!asset) {
    return reject(
      REJECT.unknownAsset,
      'Only asset ids returned by search_assets in this run can be mounted.',
    )
  }
  if (asset.kind !== 'audio') {
    return reject(
      REJECT.unknownAsset,
      `${args.assetId} is a ${asset.kind}, not audio. Search with kind:'audio' to find voice clips, and use mount_reference for pictures.`,
    )
  }
  if (run.state.audioReferenceCount >= run.state.audioReferenceLimit) {
    return reject(REJECT.referencesFull)
  }

  const ownerName = args.ownerName?.trim() || null
  const nextIndex = run.state.audioReferenceCount + 1

  return {
    kind: 'mutate',
    payload: {
      assetId: asset.assetId,
      url: asset.url,
      ...(asset.prompt
        ? { label: clamp(asset.prompt, LIMITS.maxLabelChars) }
        : {}),
      ...(ownerName
        ? { ownerName: clamp(ownerName, LIMITS.maxLabelChars) }
        : {}),
    },
    inverse: { assetId: asset.assetId },
    observation: `Mounted ${asset.assetId} as voice reference @Audio${nextIndex}${
      ownerName ? ` for ${ownerName}` : ' (nobody named)'
    } (${nextIndex}/${run.state.audioReferenceLimit}).${
      run.state.audioRequiresVisual && run.state.referenceCount === 0
        ? ' ⚠ This route refuses audio-only input — mount a reference image too, or the send will be rejected.'
        : ''
    }`,
    apply: () => {
      run.state.audioReferenceCount += 1
    },
  }
}

/**
 * 出不出声（P4-A）。
 *
 * ⚠ `inverse` 带的是**三态里的原值**（可能是 `null` = 用户没设过）。撤销回
 * `null` 的语义是「重新交给模型目录的默认」，与「明确关掉」在请求体里不是一回事。
 */
function planSetSound(run: OperatorRun, args: { enabled: boolean }): ToolPlan {
  if (!run.state.hasSoundControl) {
    return reject(
      REJECT.noSuchControl,
      'This route has no sound switch — its audio behaviour is fixed.',
    )
  }

  const previous = run.state.soundValue
  return {
    kind: 'mutate',
    payload: { enabled: args.enabled },
    inverse: { enabled: previous },
    observation: `The clip's own soundtrack is now ${args.enabled ? 'ON' : 'OFF'}.`,
    apply: () => {
      run.state.soundValue = args.enabled
      run.state.soundEffective = args.enabled
    },
  }
}

function planSetCount(run: OperatorRun, args: { count: number }): ToolPlan {
  if (!run.state.hasCountControl) return reject(REJECT.noSuchControl)

  const options = run.request.snapshot.count?.options ?? []
  if (!options.includes(args.count)) {
    return reject(
      REJECT.unknownValue,
      `count ${args.count} — options are ${options.join(', ')}`,
    )
  }

  const previous = run.state.count
  if (previous === null) return reject(REJECT.noSuchControl)

  return {
    kind: 'mutate',
    payload: { count: args.count },
    inverse: { count: previous },
    observation: `One send now produces ${args.count}.`,
    apply: () => {
      run.state.count = args.count
    },
  }
}

/**
 * ⛔ 这条**不生成任何东西**。它吐一个 op 让客户端把生成键置成 primed 态并算价，
 * 点的人永远是用户（拍板 2）。服务端在这一步一次外部调用都不发。
 */
// ─── LoRA 装配台（P4-C）─────────────────────────────────────────────

/**
 * 「这把 LoRA 装得上当前底模吗」。
 *
 * ⭐ 判据**必须与界面上那条警示行同源**（`summarizeLoraStackCompatibility` 用的
 * 就是这个谓词）：分叉的表现是助手说「这把没问题」而装配台上正亮着一行橙字。
 * ⚠ 底模还没定出来时不下判断（返回 true）—— 与界面一致（`selectedBaseFamily`
 * 为 null 时那条警示行整块不渲染）。状态块里会写明底模未定，助手因此知道
 * 「这句兼容性此刻没有依据」，⛔ 而不是读到一个假的「兼容」。
 */
function isLoraCompatibleWithBase(
  loraFamily: string | null,
  baseFamily: string | null,
): boolean {
  if (!baseFamily) return true
  if (!loraFamily) return false
  return isLoraBaseModelMountCompatible(loraFamily, baseFamily)
}

/**
 * `LoraCandidate` → 协议投影（见 `AssistantOperatorLoraCandidateSchema` 的头注）。
 *
 * ⛔ **`importPayload` 不进这里**：它只在真的要挂那一把时才需要，所以住在
 * `mount_lora` 的载荷上。让每条候选都驮着它，等于把一串权重文件地址塞进日志、
 * 塞进上下文、再塞进历史。
 */
function toLoraCandidateProjection(
  candidate: LoraCandidate,
  baseFamily: string | null,
): unknown {
  const thumbnailUrl = candidate.sampleImageUrls.find((url) =>
    url.startsWith('http'),
  )
  return {
    candidateId: candidate.candidateId,
    source: candidate.source,
    name: clamp(candidate.name, LIMITS.maxLabelChars),
    author: candidate.author
      ? clamp(candidate.author, LIMITS.maxLabelChars)
      : null,
    family: candidate.baseModelFamily,
    triggerWords: candidate.triggerWords
      .slice(0, LIMITS.maxSpecOptions)
      .map((word) => clamp(word, LIMITS.maxLabelChars)),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(candidate.pageUrl.startsWith('http')
      ? { pageUrl: candidate.pageUrl }
      : {}),
    downloads: candidate.downloads,
    licenseLabel: candidate.license.label
      ? clamp(candidate.license.label, LIMITS.maxLabelChars)
      : null,
    licenseKnown: candidate.license.known,
    commercialUse: candidate.license.commercialUse
      ? candidate.license.commercialUse.map((entry) =>
          clamp(entry, LIMITS.maxLabelChars),
        )
      : null,
    importable: candidate.importable,
    ...(candidate.notImportableReason
      ? { notImportableReason: candidate.notImportableReason }
      : {}),
    compatible: isLoraCompatibleWithBase(candidate.baseModelFamily, baseFamily),
    alreadyMounted: candidate.alreadyMounted,
    alreadyImported: candidate.alreadyImported,
  }
}

/**
 * 一条候选讲给模型听的样子。
 *
 * ⭐ **三条判据必须一起出现**（拍板：「装不上的要么不推、要么明确标注原因」）：
 * 许可 · 底模兼容性 · 能不能导入。少任何一条，模型都会推荐一把用户挂不上的 LoRA，
 * 而那一下的代价不是「答错了」—— 是用户点了确认之后拿到 404 或者一张糊图。
 * ⚠ 许可 `unknown` **不软化**（与 `buildAssistantLoraCandidateDirective` 同一条）。
 */
function describeLoraCandidateForModel(
  candidate: LoraCandidate,
  baseFamily: string | null,
  index: number,
): string {
  const bits: string[] = [
    `candidateId=${candidate.candidateId}`,
    `"${clamp(candidate.name, LIMITS.maxLabelChars)}"`,
    candidate.author ? `by ${candidate.author}` : 'author unknown',
    `base ${candidate.baseModelFamily ?? 'UNRESOLVED'}`,
    candidate.license.known
      ? `licence ${candidate.license.label ?? (candidate.license.commercialUse?.join('/') || 'stated')}`
      : 'licence UNKNOWN (say so — do not call it fine)',
  ]
  if (!candidate.importable) {
    bits.push(
      `CANNOT BE IMPORTED (${candidate.notImportableReason ?? 'unknown reason'}) — recommendable only as "open it on its source page"`,
    )
  } else if (!isLoraCompatibleWithBase(candidate.baseModelFamily, baseFamily)) {
    bits.push(
      `WILL NOT LOAD on the selected base (${baseFamily}) — a different architecture; switching base is the only way to use it`,
    )
  }
  if (candidate.alreadyMounted) {
    bits.push('ALREADY ON THE BENCH — do not offer it as new')
  }
  if (candidate.triggerWords.length > 0) {
    bits.push(`triggers: ${candidate.triggerWords.join(', ')}`)
  }
  return `  ${index + 1}. ${bits.join(' · ')}`
}

function planSearchLoras(
  run: OperatorRun,
  args: { query: string; limit?: number },
  userId: string,
): ToolPlan {
  if (!run.state.hasLoraControl) return reject(REJECT.noSuchControl)

  const limit = Math.min(
    args.limit ?? LIMITS.maxLoraResults,
    LIMITS.maxLoraResults,
  )
  const baseFamily = run.state.loraBaseFamily

  return {
    kind: 'read',
    payload: { query: args.query, limit },
    run: async () => {
      /**
       * ⭐ 复用既有检索，⛔ 不新写：`searchLoraCandidates` **永不抛** —— 单源失败
       * 翻成一条回执，另一源照常返回（形态照 `connector-runtime` 的 `runConnector`）。
       * ⚠ `baseModelFamily` 是**软偏好不是过滤**（检索层头注写死了）：硬过滤会把
       * 「你该换个底模」这种真实建议提前掐掉，而那正是这个域最该说的话。
       */
      const found = await searchLoraCandidates({
        userId,
        query: args.query,
        ...(baseFamily ? { baseModelFamily: baseFamily } : {}),
        limit,
        mountedNames: run.state.loras.map((item) => item.name),
      })

      const candidates = found.candidates.slice(0, limit)
      for (const candidate of candidates) {
        run.loraIndex.set(candidate.candidateId, candidate)
      }

      /**
       * ⚠ **空不是挂**：两个源里有一个挂了、还是两个都好好的但没命中，是两句不同
       * 的话。检索层本来就分得出来（每源一条回执），⛔ 别把它压成一句「没找到」。
       */
      const failed = found.sources.filter(
        (source) => source.status === 'failed',
      )
      const observation =
        candidates.length === 0
          ? failed.length > 0
            ? `search_loras("${args.query}") came back empty, and ${failed
                .map((source) => source.source)
                .join(
                  ' + ',
                )} actually FAILED this time — so "nothing exists" is not a safe conclusion. Say the search had trouble rather than telling the creator there is no such LoRA.`
            : `search_loras("${args.query}") found NOTHING on either source. Do not invent a candidateId. Try a different word, or say plainly that nothing matched.`
          : `search_loras("${args.query}") → ${candidates.length} candidate(s):\n${candidates
              .map((candidate, index) =>
                describeLoraCandidateForModel(candidate, baseFamily, index),
              )
              .join(
                '\n',
              )}\nMount one with mount_lora using its candidateId. Never recommend one marked CANNOT BE IMPORTED or WILL NOT LOAD without saying why in the same breath.`

      return {
        result: {
          totalFound: found.candidates.length,
          candidates: candidates.map((candidate) =>
            toLoraCandidateProjection(candidate, baseFamily),
          ),
          sources: found.sources.map((source) => ({
            source: source.source,
            status: source.status,
            count: source.count,
          })),
        },
        observation,
      }
    },
  }
}

function planMountLora(
  run: OperatorRun,
  args: { candidateId: string; weight?: number },
): ToolPlan {
  if (!run.state.hasLoraControl) return reject(REJECT.noSuchControl)

  const candidate = run.loraIndex.get(args.candidateId)
  if (!candidate) {
    return reject(
      REJECT.unknownLora,
      'Only candidateIds returned by search_loras in this run can be mounted. Mounted-item ids from the state block are a different list — those are for unmount_lora / set_lora_weight.',
    )
  }
  /**
   * ⛔ 导入门槛写在**数据上**（检索层算好的那一位），⛔ 不在这里重算：
   * 重算一次就是两份会漂的判据。不可导入的候选照样出现在候选行里（策略 C：
   * 不阻断展示），只是挂不上。
   */
  if (!candidate.importable || !candidate.importPayload) {
    return reject(
      REJECT.loraNotImportable,
      `"${clamp(candidate.name, LIMITS.maxLabelChars)}" cannot be filed into the library (${
        candidate.notImportableReason ??
        'no weight file / unresolved base model'
      }). Tell the creator it can only be opened on its source page, and offer something else.`,
    )
  }
  if (run.mountedLoraCandidateIds.has(candidate.candidateId)) {
    return reject(
      REJECT.repeatedStep,
      'You already mounted that one this turn. It is on the bench — move on.',
    )
  }

  /**
   * 权重：模型给了用模型的，没给用候选的推荐值。
   * ⚠ 值域用**快照给的那一对**（与 `[[lora]]` 推荐块共用），⛔ 不做就近夹取 ——
   * 悄悄把 3 夹成 2 之后，助手会在线程里说「设成 3 了」而实际是 2。
   */
  const weight = args.weight ?? candidate.recommendedWeight ?? null
  if (
    weight !== null &&
    (!Number.isFinite(weight) ||
      weight < run.state.loraMinWeight ||
      weight > run.state.loraMaxWeight)
  ) {
    return reject(
      REJECT.unknownValue,
      `Weight must be between ${run.state.loraMinWeight} and ${run.state.loraMaxWeight}.`,
    )
  }

  const compatible = isLoraCompatibleWithBase(
    candidate.baseModelFamily,
    run.state.loraBaseFamily,
  )
  /**
   * ⚠ 装不上**不拒**，而是挂上去 + 把话说出来。
   *
   * 判据：界面上用户自己也挂得上一把不兼容的 LoRA（装配台只画一行橙色警示，
   * 不禁用）—— 拍板 19 说的是「只动界面上存在的旋钮」，不是「比界面更严」。
   * 而且真实的下一步常常是**换底模**，把挂载拒掉反而堵住那条路。
   */
  return {
    kind: 'mutate',
    payload: {
      candidateId: candidate.candidateId,
      name: clamp(candidate.name, LIMITS.maxLabelChars),
      // 三段回落与 `useLoraCandidateConfirm` 逐字同源（模型 → 候选推荐 → 资产默认）。
      weight: weight ?? 1,
      triggerWords: candidate.triggerWords
        .slice(0, LIMITS.maxSpecOptions)
        .map((word) => clamp(word, LIMITS.maxLabelChars)),
      family: candidate.baseModelFamily,
      compatible,
      // ⭐ 服务端从本轮检索结果里抄过来的，模型碰不到它（同 `mount_reference` 的 URL）。
      importPayload: candidate.importPayload,
    },
    inverse: { candidateId: candidate.candidateId },
    observation: `Mounted "${candidate.name}" at weight ${weight ?? 1}. The bench now has ${
      run.state.loras.length + 1
    } LoRA(s) — there is no limit, so never ask the creator to remove one to make room.${
      compatible
        ? ''
        : ` ⚠ It is built for ${candidate.baseModelFamily ?? 'another base'} and will not load on the base that is selected — say that plainly and offer to switch the base.`
    }`,
    apply: () => {
      run.mountedLoraCandidateIds.add(candidate.candidateId)
      run.state.loras.push({
        // ⚠ 库记录 id 此刻**还不存在**（导入在客户端那一跳）。这里用 candidateId
        //   占位只是为了让本轮后续的状态块数得对；⛔ 模型不该拿它去调
        //   set_lora_weight —— 所以观察里让它把权重在挂载时就给对。
        id: candidate.candidateId,
        name: candidate.name,
        weight: weight ?? 1,
        enabled: true,
        family: candidate.baseModelFamily,
        compatible,
      })
    },
  }
}

function planUnmountLora(run: OperatorRun, args: { loraId: string }): ToolPlan {
  if (!run.state.hasLoraControl) return reject(REJECT.noSuchControl)

  const index = run.state.loras.findIndex((item) => item.id === args.loraId)
  const mounted = index >= 0 ? run.state.loras[index] : undefined
  if (!mounted) {
    return reject(
      REJECT.loraNotMounted,
      'That LoRA is not on the bench. The ids you can unmount are the mounted-item ids in the state block — search results carry candidateIds, which are a different thing.',
    )
  }

  return {
    kind: 'mutate',
    payload: { loraId: mounted.id, name: mounted.name },
    // ⚠ 撤销要把它挂回原来的权重 —— 那条库记录由客户端在摘的一刻扣下来。
    inverse: { loraId: mounted.id, weight: mounted.weight },
    observation: `Took "${mounted.name}" off the bench. ${run.state.loras.length - 1} LoRA(s) left.`,
    apply: () => {
      run.state.loras.splice(index, 1)
    },
  }
}

function planSetLoraWeight(
  run: OperatorRun,
  args: { loraId: string; weight: number },
): ToolPlan {
  if (!run.state.hasLoraControl) return reject(REJECT.noSuchControl)

  const mounted = run.state.loras.find((item) => item.id === args.loraId)
  if (!mounted) {
    return reject(
      REJECT.loraNotMounted,
      'That LoRA is not on the bench — the ids you can tune are the mounted-item ids in the state block.',
    )
  }
  if (
    !Number.isFinite(args.weight) ||
    args.weight < run.state.loraMinWeight ||
    args.weight > run.state.loraMaxWeight
  ) {
    return reject(
      REJECT.unknownValue,
      `Weight must be between ${run.state.loraMinWeight} and ${run.state.loraMaxWeight}.`,
    )
  }

  const previous = mounted.weight
  return {
    kind: 'mutate',
    payload: { loraId: mounted.id, name: mounted.name, weight: args.weight },
    inverse: { loraId: mounted.id, weight: previous },
    observation: `"${mounted.name}" is now at weight ${args.weight} (was ${previous}).`,
    apply: () => {
      mounted.weight = args.weight
    },
  }
}

function planPrimeGenerate(run: OperatorRun): ToolPlan {
  if (run.state.hasModelControl && !run.state.modelId) {
    return reject(REJECT.noModelSelected)
  }
  if (!run.state.prompt.trim()) return reject(REJECT.emptyPrompt)

  return {
    kind: 'mutate',
    payload: { primed: true },
    inverse: { primed: false },
    observation:
      'The generate button is armed with the current form. The creator presses it themselves — you cannot.',
    apply: () => {},
  }
}

/**
 * 看图闭环（P3-C，拍板 4 + 6）。
 *
 * ── 三件事按顺序发生，缺一条就退回一条**可教的**拒绝 ────────────────
 *  ① 有没有它自己备的那张图（`request.result`）—— 没有就 `noResultToCritique`。
 *     ⛔ 这不是防御性检查，这是拍板 4 的落点：用户自己点的生成压根不填这个字段。
 *  ② 借不借得到一条看得见图的路 —— 借不到就 `visionUnavailable`，
 *     **⛔ 绝不降级成「凭提示词猜」**（论据见 `vision-route.service.ts` 头注：
 *     一份格式完整、内容全编的评价比说不出话坏得多）。
 *  ③ 视觉那一跳读不出结构 —— `critiqueFailed`。
 *
 * ── 为什么视觉那一跳跑在**规划期**而不是 `run()` 里 ──────────────────
 * `run()` 里抛错会让整轮以一句笼统的「跑到一半失败了」结束，而那条日志会永远
 * 停在 `running`（`clamp` 头注记着这种失败长什么样）。跑在这里，失败就是一条
 * 普通的被拒步：模型读得到理由，还能接着改表单。代价是这一步没有「看图中…」
 * 的中间态 —— 面板本来就在 working 态，值这个换。
 *
 * ⛔ 这一跳**不花用户的积分**：它是一次文本补全（带一张图），走的是本文件
 * 一直在用的那条助手线，与钱闸无关 —— 生成永远只有用户点得动。
 */
async function planCritiqueResult(
  run: OperatorRun,
  args: { goal?: string },
  userId: string,
): Promise<ToolPlan> {
  const result = run.request.result
  if (!result) {
    return reject(
      REJECT.noResultToCritique,
      'No result from a run you armed is attached to this turn. You only ever review your own armed runs — wait until one comes back.',
    )
  }

  // 用户选的那条路看得见图就直接用它；看不见才去借（省得平白换掉他选的模型）。
  const seesImages = assistantAdapterSupportsImage(
    run.route.adapterType,
    run.modelId,
  )
  const visionRoute = seesImages
    ? run.route
    : await findVisionCapableRoute(userId)
  if (!visionRoute) {
    return reject(
      REJECT.visionUnavailable,
      'No model available to this account can look at pictures. Say so plainly — do not guess what the picture looks like.',
    )
  }
  const borrowedVisionRoute = !seesImages
  // ⚠ 借路时**不带**规划器那个 modelId：它是另一个 adapter 的型号，硬塞过去
  //   要么 404 要么被上游忽略，两种都比按新 adapter 重算一次差。
  const visionModelId = borrowedVisionRoute
    ? resolveAssistantModelId(visionRoute.adapterType)
    : run.modelId

  const goal =
    args.goal?.trim() ||
    result.prompt?.trim() ||
    run.state.prompt.trim() ||
    null

  const raw = await completeAssistantTextWithContextRetry({
    systemPrompt: buildCritiqueSystemPrompt(run.request),
    buildUserPrompt: (maxLength) =>
      buildCritiquePrompt(run, goal, result.modelLabel, maxLength),
    route: visionRoute,
    contextCompactionTargetLength: OPERATOR_CONTEXT_COMPACTION_TARGET_LENGTH,
    ...(visionModelId ? { modelId: visionModelId } : {}),
    // ⭐ 唯一真的「看」的那一下。地址来自 `result`，模型碰不到它。
    imageData: result.url,
    responseFormat: 'json_object',
  })

  const critique = parseCritiqueJson(raw)
  if (!critique) {
    return reject(
      REJECT.critiqueFailed,
      'The vision pass did not come back in a readable shape. Do not pretend you saw the picture.',
    )
  }

  const advice = critique.advice?.trim() || null
  const payload = {
    imageUrl: result.url,
    ...(result.thumbnailUrl ? { thumbnailUrl: result.thumbnailUrl } : {}),
    ...(result.modelLabel ? { modelLabel: result.modelLabel } : {}),
    goal: goal ? clamp(goal, LIMITS.maxCritiqueGoalChars) : null,
  }

  return {
    kind: 'read',
    payload,
    run: async () => ({
      result: {
        findings: critique.findings,
        advice,
        borrowedVisionRoute,
      },
      observation: `critique_result — you looked at the picture${
        borrowedVisionRoute
          ? ` (through a borrowed ${visionRoute.adapterType} route, because the creator's own model cannot see pictures)`
          : ''
      }:\n${critique.findings
        .map((finding) => `  ${finding.ok ? '✓' : '✗'} ${finding.text}`)
        .join('\n')}${
        advice ? `\n  next: ${advice}` : ''
      }\nNow change the form to act on what you saw — the creator presses generate again themselves.`,
    }),
  }
}

async function planTool(
  run: OperatorRun,
  tool: AssistantOperatorTool,
  rawArgs: unknown,
  userId: string,
): Promise<ToolPlan> {
  /**
   * ⭐ **域闸排在最前面**（P4-A，拍板 8）：这条工具压根不属于这个工作台时，
   * 后面每一道判断都是在回答一个不该被问的问题。理由用 `noSuchControl` ——
   * 与「这台机器上没这个控件」是同一件事，而它可教：助手读到之后会换一条路，
   * 而不是换个参数再撞一次。
   * ⚠ 系统提示里的工具表已经按域裁过（模型正常看不见域外的工具），这道闸是
   *    为「它照样编了一个」准备的 —— 提示词从来不是闸。
   */
  if (!isAssistantOperatorToolInDomain(tool, run.request.domain)) {
    return reject(
      REJECT.noSuchControl,
      `${tool} does not exist on this workbench. Use only the tools listed for you.`,
    )
  }

  // ⭐ 与参数无关的闸跑在 schema 之前 —— 见 `planSpecsPrecondition` 头注：
  //    这条工具在空档位下**无解**，让 schema 去抓只会吐一条模型学不会的
  //    `malformedArgs`。别把它挪到 `planSetSpecs` 里去，那已经在 schema 后面了。
  if (tool === TOOL.setSpecs) {
    const blocked = planSpecsPrecondition(run)
    if (blocked) return blocked
  }
  // 视频档同一个模式，判据不同（三张表里有一张非空即可）。
  if (tool === TOOL.setVideoSpecs) {
    const blocked = planVideoSpecsPrecondition(run)
    if (blocked) return blocked
  }

  const parsed = ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS[tool].safeParse(rawArgs)
  if (!parsed.success) {
    return reject(
      REJECT.malformedArgs,
      parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
        .join('; '),
    )
  }

  // ⚠ `switch` 上的穷举：工具表加一条而这里没接，编译期就红（见文件末尾的
  //    `assertNever`）。别改成 if/else 链。
  switch (tool) {
    case TOOL.readState:
      return planReadState(run)
    case TOOL.searchAssets:
      return planSearchAssets(
        run,
        parsed.data as {
          query: string
          kind?: AssistantOperatorSearchKind
          limit?: number
        },
        userId,
      )
    case TOOL.listAssetFolders:
      return planListAssetFolders(
        run,
        parsed.data as { query: string; limit?: number },
        userId,
      )
    case TOOL.inspectAssetFolder:
      return planInspectAssetFolder(
        run,
        parsed.data as { folderId: string; instruction?: string },
        userId,
      )
    case TOOL.searchWebImages:
      return planSearchWebImages(
        run,
        parsed.data as { query: string; limit?: number },
      )
    case TOOL.mountReference:
      return planMountReference(run, parsed.data as { assetId: string })
    case TOOL.setModel:
      return planSetModel(run, parsed.data as { modelId: string })
    case TOOL.setPrompt:
      return planSetText(
        run,
        ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt,
        parsed.data as { value: string; mode?: string },
      )
    case TOOL.setNegative:
      return planSetText(
        run,
        ASSISTANT_OPERATOR_CONFIRM_FIELDS.negative,
        parsed.data as { value: string; mode?: string },
      )
    case TOOL.setSpecs:
      return planSetSpecs(
        run,
        parsed.data as { aspectRatio: string; resolution: string },
      )
    case TOOL.setVideoSpecs:
      return planSetVideoSpecs(
        run,
        parsed.data as {
          durationSeconds?: number
          aspectRatio?: string
          resolution?: string
        },
      )
    case TOOL.setCount:
      return planSetCount(run, parsed.data as { count: number })
    case TOOL.mountAudioReference:
      return planMountAudioReference(
        run,
        parsed.data as { assetId: string; ownerName?: string },
      )
    case TOOL.setSound:
      return planSetSound(run, parsed.data as { enabled: boolean })
    case TOOL.primeGenerate:
      return planPrimeGenerate(run)
    case TOOL.critiqueResult:
      return planCritiqueResult(run, parsed.data as { goal?: string }, userId)
    case TOOL.importUserUrl:
      return planImportUserUrl(run, parsed.data as { url: string })
    case TOOL.searchLoras:
      return planSearchLoras(
        run,
        parsed.data as { query: string; limit?: number },
        userId,
      )
    case TOOL.mountLora:
      return planMountLora(
        run,
        parsed.data as { candidateId: string; weight?: number },
      )
    case TOOL.unmountLora:
      return planUnmountLora(run, parsed.data as { loraId: string })
    case TOOL.setLoraWeight:
      return planSetLoraWeight(
        run,
        parsed.data as { loraId: string; weight: number },
      )
    default:
      return assertNever(tool)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled assistant operator tool: ${String(value)}`)
}

// ─── 提示词 ─────────────────────────────────────────────────────

const RESPONSE_LANGUAGE_LABELS: Record<
  PromptAssistantResponseLanguage,
  string
> = {
  english: 'English',
  japanese: 'Japanese',
  chinese: 'Simplified Chinese',
}

/**
 * 打转打到被强制收尾时，线程里留下的那一句（P3-D 卡死护栏）。
 *
 * ⚠ 全仓唯一一处**服务端自己写给用户看**的文案，所以它值得解释一句：这条流吐的
 * `message` 本来就是自由文本（平时是模型写的），而这一刻恰恰不能再问模型 ——
 * 它正卡在同一步上。⛔ 不做成 i18n 键：那要给 `message` 事件加一条「这是键不是
 * 文本」的分支，客户端两种渲染，为一句话不值。
 * ⛔ 也不要沉默收尾：一个自己停下来、什么都不说的助手是本仓最难查的那种失败。
 */
const OPERATOR_STUCK_MESSAGES: Record<PromptAssistantResponseLanguage, string> =
  {
    english:
      'I caught myself repeating the same step, so I stopped rather than spend more of your time on it. Tell me what you want next and I will come at it differently.',
    japanese:
      '同じ手順を繰り返していたので、これ以上お時間を使う前に手を止めました。次に何をしたいか教えてください。別のやり方で進めます。',
    chinese:
      '我在同一步上打转了，先停下来，不再耗你的时间。说一句下一步想怎么办，我换个路子。',
  }

function buildOperatorSystemPrompt(request: AssistantOperatorRequest): string {
  const brief = ASSISTANT_DOMAIN_BRIEFS[request.domain]
  const language =
    RESPONSE_LANGUAGE_LABELS[request.responseLanguage ?? 'english']
  /**
   * ⭐ **只列这个域有的工具**（P4-A，拍板 8）。列全集的代价是实打实的：
   * 视频档上看得见 `set_count`，模型就会去试，而每一步都是一次完整的 LLM 往返，
   * 一轮总共只有 `maxSteps` 步。
   */
  const tools = ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN[request.domain]
    .map((tool) => `  - ${tool}: ${ASSISTANT_OPERATOR_TOOL_HINTS[tool]}`)
    .join('\n')
  /**
   * 域简报的另一半（`ASSISTANT_DOMAIN_BRIEFS[...].slots`）：**这个域收敛前要问清
   * 什么**。persona 说的是「你是谁」，这张表说的是「一条视频跟一张图要定的东西
   * 不一样」—— 少了它，视频档的助手会照着图片档的清单去问（构图、光线），
   * 而真正决定成败的是时长、什么在动、首帧从哪来。
   */
  const slots = brief.slots.map((slot) => `  - ${slot}`).join('\n')
  /**
   * 只对**这个域**成立的那几条硬规矩。
   *
   * ⚠ 全部拼进去的下场很具体：视频档上读到「set_specs 必须比例配清晰度」，
   * 而这个域根本没有 `set_specs`；读到「有结果就先 critique_result」，
   * 而这个域也没有那条工具。一条说不通的规矩会让模型去找一条不存在的路。
   */
  const domainRules = [
    isAssistantOperatorToolInDomain(TOOL.setSpecs, request.domain)
      ? '- set_specs always carries aspectRatio AND resolution together.'
      : null,
    isAssistantOperatorToolInDomain(TOOL.setVideoSpecs, request.domain)
      ? '- set_video_specs carries every clip spec the state block lists options for, in ONE call. Length, aspect ratio and resolution are separate knobs here, and some models expose only one or two of them — omit exactly the ones the state says are absent.'
      : null,
    isAssistantOperatorToolInDomain(TOOL.setSound, request.domain)
      ? '- The soundtrack switch is three-state: untouched means "whatever this model normally does". Only call set_sound when the creator asked for sound or for silence — turning it off is a different request from never setting it.'
      : null,
    isAssistantOperatorToolInDomain(TOOL.mountAudioReference, request.domain)
      ? '- Voice references come from the creator\'s own audio library: search_assets with kind "audio", then mount_audio_reference. Name the character each clip belongs to whenever the conversation tells you.'
      : null,
    isAssistantOperatorToolInDomain(TOOL.critiqueResult, request.domain)
      ? '- When the state block says a fresh result of yours is waiting, look at it FIRST with critique_result, then act on what you saw. You review only the runs you armed — never the ones the creator started on their own, and you cannot see those at all.'
      : null,
    /**
     * LoRA 域的三条硬规矩（P4-C）。
     *
     * ⭐ 第三条（「没有上限」）是**产品事实**：本仓三个后端全不限挂载数。不写出来
     * 的话模型会按别处的常识发明一条上限并转述给用户 —— 一条没人写过的限制，
     * 是最难查的那种错。
     */
    isAssistantOperatorToolInDomain(TOOL.mountLora, request.domain)
      ? `- A mounted LoRA already owns part of the picture — the character's face, hair and body type are decided by it. Help the creator change the layer they are actually changing (outfit, scene, light, pose), and say plainly when a request fights the mounted LoRA.
- Never recommend a LoRA the creator cannot actually use without saying so in the same sentence. Two things make one unusable and search_loras tells you both: it cannot be filed into the library at all, or it was built for a different base-model architecture and will not load on the base that is selected. "Switch the base model" is a legitimate suggestion; quietly recommending an incompatible one is not.
- There is NO limit on how many LoRAs can be stacked here. Never tell the creator to remove one to make room, and never imply a maximum.
- Trigger words matter: they come back with each candidate and land in the prompt when you mount. Keep tag vocabulary in English (danbooru-style) even when you are talking in another language — the tag library is English-normalised.`
      : null,
  ]
    .filter((rule): rule is string => rule !== null)
    .join('\n')

  return `You are PixelVault's workbench operator. ${brief.persona}

WHAT THIS DOMAIN TURNS ON — check these are settled before you arm anything:
${slots}

You do not tell the creator which buttons to press — you press them. Every turn you either call ONE tool or finish.

HARD RULES — these are structural, not stylistic:
- You CANNOT generate anything. No tool of yours spends the creator's credits. The most you can do is prime_generate, which arms the button; the creator presses it. Never claim you generated, rendered, or started anything.
- You may only touch knobs that exist on this workbench. The state block tells you which ones exist; a field described as absent has no control behind it, and calling its tool will be refused.
- Never invent a model id or an asset id. Model ids come from the state block, asset ids come from search_assets results. A made-up id is refused and wastes a step.
- Never invent a folder id. Call list_asset_folders first, then pass one exact folderId from THIS run to inspect_asset_folder. Folder names alone are ambiguous.
- THE CREATOR HANDED YOU A LINK → call import_user_url on it, right then. Their link is their yes. It works for a direct image address and for an ordinary web page alike. Never answer a link with a search, and never ask them to save it, upload it, or pick it out of a list — you have the tool, so you do it.
- search_web_images (pictures YOU went looking for) is different: it downloads nothing. Each candidate is shown to the creator with a "use this" button, and only what they press is fetched and attached. So never claim you saved, imported, or mounted one of your own search results, and never paste one of those URLs into a prompt or a reference. Search the creator's own library first; go to the web only when they have nothing suitable. Keep web queries SHORT and in English (three or four words); a long sentence returns junk.
${domainRules}
- If the creator already hand-wrote a prompt, writing over it needs their say-so — call the tool anyway and the app will ask them; do not ask in prose.
- Reply in ${language}.

HOW YOU TALK — the creator hired an operator, not a rulebook:
- NEVER recite your own constraints to them. Not what you cannot do, not why, not "as I mentioned". They did not ask for the manual, and repeating it makes them do the thinking you were hired for.
- If a tool in your list can do a thing, DO IT. Never hand that job back — no "please click", "please paste", "please find", "please go to the log and pick". The one exception is the generate button itself, which is theirs by design.
- When a call is refused, change the approach silently. Say what you are doing next, not which rule stopped you. Never explain the same rule twice.
- Never repeat a tool call you already made this turn — the same call with the same arguments is refused, and a second refusal ends your turn early.

TOOLS:
${tools}

OUTPUT — every turn is ONE strict-JSON object and nothing else. No prose outside it, no code fence:
{"plan":["short step","short step"],"message":"what you are telling the creator","tool":{"name":"set_prompt","title":"one short line for the log","reason":"why, in one line","args":{"value":"..."}},"finished":false}

- "plan" only on your FIRST turn, at most ${LIMITS.maxPlanItems} short items. Omit it afterwards — a later plan is folded into one plain line, so a changed plan belongs in "message", in one sentence.
- "message" is optional; use it to say something worth saying, not to narrate every step.
- Omit "tool" (or set "finished":true) when the work is done. Do that as soon as the form is ready — an extra step costs the creator time.
- One tool per turn. You get at most ${LIMITS.maxSteps} steps for the whole request.
- After each tool you will be told what actually happened. If a call was refused, read the reason and adapt — do not repeat the same call.`
}

function buildOperatorUserPrompt(run: OperatorRun, maxLength?: number): string {
  const sections: string[] = []

  sections.push(`CURRENT WORKBENCH STATE (the creator is looking at this right now):
${renderState(run)}`)

  if (run.request.priorSteps?.length) {
    sections.push(`WHAT YOU ALREADY DID EARLIER IN THIS THREAD:
${run.request.priorSteps
  .map((step) => `- [${step.status}] ${step.tool}: ${step.summary}`)
  .join('\n')}`)
  }

  if (run.request.confirmations?.length) {
    sections.push(`THE CREATOR ANSWERED YOUR OVERWRITE QUESTION:
${run.request.confirmations
  .map((entry) => `- ${entry.field}: ${entry.choice}`)
  .join('\n')}`)
  }

  if (run.observations.length > 0) {
    sections.push(`WHAT HAPPENED SO FAR THIS TURN:
${run.observations.join('\n')}`)
  }

  const prefix = `${sections.join('\n\n')}\n\nCONVERSATION:\n`
  const suffix = '\n\nReply with ONE JSON object.'
  const conversationBudget =
    maxLength === undefined
      ? undefined
      : Math.max(1, maxLength - prefix.length - suffix.length)

  return `${prefix}${buildAssistantConversation(
    run.request.messages,
    conversationBudget,
  )}${suffix}`
}

const OPERATOR_CONTEXT_COMPACTION_TARGET_LENGTH = 24_000

/**
 * 看图那一跳的系统提示（P3-C）。
 *
 * ⚠ 与规划器的系统提示**分开**，因为它面对的可能根本不是同一个模型：用户选的
 * 路看不见图时这一跳是借来的（`findVisionCapableRoute`）。把工具表塞给它只会
 * 让它去调一个它这一跳根本没有的工具。
 */
function buildCritiqueSystemPrompt(request: AssistantOperatorRequest): string {
  const language =
    RESPONSE_LANGUAGE_LABELS[request.responseLanguage ?? 'english']

  return `You are looking at a picture that PixelVault just produced for its creator, and judging it against what they were going for.

Be the kind of second pair of eyes a working art director is: concrete, specific to THIS picture, and willing to say the uncomfortable thing. Name what you actually see — a hand with six fingers, a horizon that tilts, a face that lost the reference's jawline. Vague praise is worse than silence.

RULES:
- Between ${1} and ${LIMITS.maxCritiqueFindings} findings, one short sentence each, in ${language}.
- "ok": true means that part of the intent LANDED. false means it did not. Do not mark everything true; do not mark everything false either.
- "advice" is one sentence about what to change next time — a prompt or a setting, not a pep talk. Use null when the picture is genuinely good enough.
- Judge only what is visible. You cannot see the generation settings, and you must never claim you changed anything.

OUTPUT — one strict-JSON object and nothing else, no prose around it, no code fence:
{"findings":[{"ok":true,"text":"..."},{"ok":false,"text":"..."}],"advice":"..."}`
}

function buildCritiquePrompt(
  run: OperatorRun,
  goal: string | null,
  modelLabel: string | undefined,
  maxLength?: number,
): string {
  const sections: string[] = [
    goal
      ? `WHAT THIS PICTURE WAS SUPPOSED TO BE:\n${goal}`
      : 'WHAT THIS PICTURE WAS SUPPOSED TO BE: the creator never wrote it down — judge it on its own craft instead.',
  ]
  if (modelLabel) sections.push(`MADE BY: ${modelLabel}`)

  const prefix = `${sections.join('\n\n')}\n\nCONVERSATION THAT LED HERE:\n`
  const suffix = '\n\nReply with ONE JSON object.'
  const conversationBudget =
    maxLength === undefined
      ? undefined
      : Math.max(1, maxLength - prefix.length - suffix.length)

  return `${prefix}${buildAssistantConversation(
    run.request.messages,
    conversationBudget,
  )}${suffix}`
}

/**
 * 剥掉围栏，把模型这一轮的输出还原成候选 JSON 串。
 * `responseFormat:'json_object'` 只在部分 provider 上是硬保证，剩下那些照样会给你
 * 包一层 ```json —— 这十行是那一档的代价。
 */
function jsonCandidates(raw: string): string[] {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  return [
    fenced?.[1]?.trim(),
    trimmed,
    trimmed.match(/\{[\s\S]*\}/)?.[0],
  ].filter((candidate): candidate is string => Boolean(candidate))
}

function parseTurnJson(raw: string): AssistantOperatorTurn | null {
  for (const candidate of jsonCandidates(raw)) {
    try {
      const parsed = AssistantOperatorTurnSchema.safeParse(
        JSON.parse(candidate) as unknown,
      )
      if (parsed.success) return parsed.data
    } catch {
      // 下一个候选
    }
  }
  return null
}

/** 同上，但吃的是视觉那一跳的产出（P3-C）。解不出来 = 一条被拒的步，不是抛错。 */
function parseCritiqueJson(raw: string): AssistantOperatorCritique | null {
  for (const candidate of jsonCandidates(raw)) {
    try {
      const parsed = AssistantOperatorCritiqueSchema.safeParse(
        JSON.parse(candidate) as unknown,
      )
      if (parsed.success) return parsed.data
    } catch {
      // 下一个候选
    }
  }
  return null
}

// ─── 工具环 ─────────────────────────────────────────────────────

export interface AssistantOperatorRunOptions {
  /**
   * 客户端断开时触发（拍板 13 的插话 / ⏹）。
   *
   * ⚠ 它只能拦住**还没开始**的下一步：`llmTextCompletion` 这条链不吃 signal，
   * 在飞的那次补全会跑完然后被丢弃（它是 await 出来的，不是悬空 promise）。
   * 要真正掐断在飞请求得让 `LlmTextInput` 收 signal —— 那是另一片的事，别在这里
   * 顺手给这条链造第二套超时机制。
   */
  signal?: AbortSignal
}

export async function* runAssistantOperator(
  clerkId: string,
  request: AssistantOperatorRequest,
  options: AssistantOperatorRunOptions = {},
): AsyncIterable<AssistantOperatorEvent> {
  const user = await ensureUser(clerkId)
  const route: ResolvedLlmTextRoute = await resolveLlmTextRoute(
    user.id,
    request.apiKeyId,
  )
  const modelId = resolveAssistantModelId(route.adapterType, request.llmModelId)

  const run: OperatorRun = {
    request,
    state: toWorkingState(request.snapshot),
    route,
    modelId,
    searchIndex: new Map(),
    folderIndex: new Map(),
    loraIndex: new Map(),
    mountedLoraCandidateIds: new Set(),
    observations: [],
    assistantWrittenFields: new Set(),
    executedStepKeys: new Set(),
    stepSeq: 0,
  }

  const systemPrompt = buildOperatorSystemPrompt(request)
  let planEmitted = false
  let consecutiveParseFailures = 0
  /** 连着撞了几次「同一步重复」—— 执行成功一次就归零（见下面那段）。 */
  let repeatedStepStrikes = 0
  let completed = false

  try {
    for (let index = 0; index < LIMITS.maxSteps; index += 1) {
      if (options.signal?.aborted) {
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.stopped,
          reason: ASSISTANT_OPERATOR_STOP_REASONS.aborted,
        }
        completed = true
        return
      }

      const raw = await completeAssistantTextWithContextRetry({
        systemPrompt,
        buildUserPrompt: (maxLength) => buildOperatorUserPrompt(run, maxLength),
        route,
        contextCompactionTargetLength:
          OPERATOR_CONTEXT_COMPACTION_TARGET_LENGTH,
        modelId,
        responseFormat: 'json_object',
      })

      // ⚠ abort 可能发生在这次 await 期间：结果已经拿到但客户端早就走了。
      //    这里再查一次，免得往一条没人读的流里继续吐事件。
      if (options.signal?.aborted) {
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.stopped,
          reason: ASSISTANT_OPERATOR_STOP_REASONS.aborted,
        }
        completed = true
        return
      }

      const turn = parseTurnJson(raw)
      if (!turn) {
        consecutiveParseFailures += 1
        // 连着两次读不出来就不是抖动了 —— 大声报错，别把剩下的步数烧在同一个坑里。
        if (consecutiveParseFailures >= 2) {
          throw new Error('The assistant model did not return usable JSON.')
        }
        run.observations.push(
          'Your last reply was not a single valid JSON object. Reply with ONE JSON object and nothing else.',
        )
        continue
      }
      consecutiveParseFailures = 0

      /**
       * 计划条**一轮一条**（P3-D 降噪）。
       *
       * 🔬 owner 2026-08-31 真机：模型每一步都重发一遍 `plan`，线程被自己的
       * 计划条刷屏，真正在发生的事反而被挤到看不见。系统提示里早写着「只在第一
       * 轮给」—— 但那是一句请求，不是闸；这里才是闸。
       * ⚠ 后面那些**折叠成一句 `message`**而不是静默丢掉：计划真的变了时，
       * 那句话是用户唯一能看到的解释。⛔ 但本轮已经有 `message` 时就丢掉它 ——
       * 同一件事说两遍又变回刷屏。
       */
      if (turn.plan?.length) {
        if (!planEmitted) {
          planEmitted = true
          yield { type: ASSISTANT_OPERATOR_EVENTS.plan, steps: turn.plan }
        } else if (!turn.message?.trim()) {
          yield {
            type: ASSISTANT_OPERATOR_EVENTS.message,
            text: clamp(turn.plan.join(' · '), LIMITS.maxMessageChars),
          }
        }
      }
      if (turn.message?.trim()) {
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.message,
          text: turn.message.trim(),
        }
      }

      if (!turn.tool || turn.finished) {
        yield { type: ASSISTANT_OPERATOR_EVENTS.done }
        completed = true
        return
      }

      const { name, title, reason, args } = turn.tool
      run.stepSeq += 1
      const base = {
        id: `step-${run.stepSeq}`,
        // 模型没写标题就用工具名兜底 —— 少一个装饰字段不值得作废一整步。
        title: title ?? name,
        ...(reason ? { reason } : {}),
      }

      /**
       * 卡死护栏（P3-D）—— **跑在规划之前**：重复的那一步不该再去查一次库、
       * 更不该再借一条视觉线（`critique_result` 的那一跳在规划期就花钱花时间）。
       *
       * 🔬 owner 真机撞到的形状：同一个读工具、同一串参数，连跑三次，步数烧光，
       * 最后回头支使用户自己动手。
       */
      const stepKey = operatorStepKey(name, args)
      if (run.executedStepKeys.has(stepKey)) {
        repeatedStepStrikes += 1
        yield toStepEvent({
          ...base,
          tool: name,
          status: STATUS.error,
          error: {
            reason: REJECT.repeatedStep,
            detail:
              'You already ran this exact call in this turn and the answer will not change. Take a different route, or ask the creator one short question — do not run it again.',
          },
        })
        run.observations.push(
          `${name} was REFUSED (${REJECT.repeatedStep}): you already ran that exact call this turn. Repeating it cannot produce a different answer. Do something else or finish.`,
        )
        // 第二次 = 打转，不是抖动。收尾，⛔ 但不沉默（见 `OPERATOR_STUCK_MESSAGES`）。
        if (repeatedStepStrikes >= LIMITS.maxRepeatedStepStrikes) {
          yield {
            type: ASSISTANT_OPERATOR_EVENTS.message,
            text: OPERATOR_STUCK_MESSAGES[
              request.responseLanguage ?? 'english'
            ],
          }
          yield { type: ASSISTANT_OPERATOR_EVENTS.done }
          completed = true
          return
        }
        continue
      }

      // ⚠ `await`：`critique_result` 的视觉那一跳跑在**规划期**（见它的头注）。
      const plan = await planTool(run, name, args, user.id)

      if (plan.kind === 'confirm') {
        // 拍板 3：就地确认。流停在这里，客户端带 `confirmations` 重发续跑 ——
        // 与打断复用同一条机制，服务端因此不需要任何挂起态。
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.confirmRequest,
          field: plan.field,
          have: plan.have,
          proposed: plan.proposed,
        }
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.stopped,
          reason: ASSISTANT_OPERATOR_STOP_REASONS.awaitingConfirm,
        }
        completed = true
        return
      }

      if (plan.kind === 'rejected') {
        yield toStepEvent({
          ...base,
          tool: name,
          status: STATUS.error,
          error: {
            reason: plan.reason,
            ...(plan.detail ? { detail: plan.detail } : {}),
          },
        })
        run.observations.push(
          `${name} was REFUSED (${plan.reason})${
            plan.detail ? `: ${plan.detail}` : ''
          }. Do not retry it unchanged.`,
        )
        continue
      }

      if (plan.kind === 'read') {
        yield toStepEvent({
          ...base,
          tool: name,
          status: STATUS.running,
          payload: plan.payload,
          result: null,
        })
        const { result, observation } = await plan.run()
        yield toStepEvent({
          ...base,
          tool: name,
          status: STATUS.done,
          payload: plan.payload,
          result,
        })
        run.observations.push(observation)
        // ⭐ 记账在**跑完之后**：跑到一半抛出去的那次不算「已执行」，否则重试
        //    会被自己的护栏拦住。归零同理 —— 真跑成了一步就不算在打转。
        run.executedStepKeys.add(stepKey)
        repeatedStepStrikes = 0
        continue
      }

      const applied = {
        ...base,
        tool: name,
        payload: plan.payload,
        inverse: plan.inverse,
      }
      yield toStepEvent({ ...applied, status: STATUS.running })
      plan.apply()
      yield toStepEvent({ ...applied, status: STATUS.done })
      run.observations.push(plan.observation)
      run.executedStepKeys.add(stepKey)
      repeatedStepStrikes = 0
    }

    yield {
      type: ASSISTANT_OPERATOR_EVENTS.stopped,
      reason: ASSISTANT_OPERATOR_STOP_REASONS.maxSteps,
    }
    completed = true
  } finally {
    // 生成器被 `return()` 掉（客户端 cancel 了流）时也会走到这里 —— 本轮没有任何
    // 服务端状态要回滚，唯一要做的是留一行日志，别让「跑了一半的轮次」查不出来。
    if (!completed) {
      logger.info('assistant operator run ended early', {
        userId: clerkId,
        steps: run.stepSeq,
        aborted: options.signal?.aborted ?? false,
      })
    }
  }
}

/**
 * ⭐ 出流之前**用契约自己校验一遍**。
 *
 * 不是防御性编程：改动型 step 少一个 `inverse` 时，这里当场抛，而不是把一条撤不掉
 * 的 step 发给客户端 —— 后者的表现是「点了撤销没反应」，一种最难查的失败。
 * 服务端与客户端因此共用同一份判据。
 */
function toStepEvent(raw: unknown): AssistantOperatorEvent {
  return {
    type: ASSISTANT_OPERATOR_EVENTS.step,
    step: AssistantOperatorStepSchema.parse(raw),
  }
}
