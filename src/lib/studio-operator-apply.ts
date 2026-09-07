/**
 * 把服务端吐的 op **落到工作台表单上**（P2 的另一半 —— 前一半是读流）。
 *
 * ── 为什么是纯函数而不是长在 hook 里 ────────────────────────────────
 * 「应用」与「撤销」必须是同一份判据的两侧（拍板 18 的撤销靠 `inverse`），而它
 * 有两个调用方：面板里的事件循环、以及参数栏里的归属标记（点一下还原这个字段）。
 * 长在 hook 里就得从面板往参数栏传回调，两棵组件树之间又得多一条线；抽成纯函数
 * 之后两边各自 `useStudioForm()` 拿 dispatch，共用同一份映射。
 * 顺带：它因此可以脱离 React 单测 —— 而这正是最值得钉住的一层
 * （台账 AE/BG/BS：`set_specs` 必须两个字段一起下）。
 *
 * ── 三条不许犯的错 ─────────────────────────────────────────────────
 * ① **`SET_ADVANCED_PARAMS` 是整体替换**：只发一个键会把用户调好的 seed /
 *    resolution 一起清空。所以每次都 `{ ...current, 那个键 }`。
 * ② **比例与清晰度必须同时下**（台账 AE/BG/BS）：`aspectRatio` 只有配上
 *    `advancedParams.resolution` 才是真比例。这也是 `set_specs` 只有一条工具、
 *    而登记簿里它们共用 `specs` 一格的原因 —— 分开撤会撤出一个从没存在过的组合。
 * ③ **值域收窄在这里做一次**：payload 里的比例 / 清晰度 / 张数都是字符串或
 *    数字，而表单要的是收窄过的字面量类型。收不窄就整条不落 —— ⛔ 别 `as` 过去，
 *    那会把一个表单显示不出来的值写进 state（服务端已按快照的可选值表拒过一道，
 *    这里是第二道，两道都指向同一张表）。
 */

import {
  ASSISTANT_OPERATOR_APPEND_SEPARATOR,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  ASSISTANT_OPERATOR_WRITE_MODES,
  type AssistantOperatorReferenceSlot,
} from '@/constants/assistant-operator'
import { isAspectRatio } from '@/constants/config'
import { isImageBatchCount } from '@/constants/studio'
import { isVideoResolution } from '@/constants/video-options'
import {
  STUDIO_OPERATOR_FIELD_IDS,
  type StudioOperatorField,
} from '@/constants/studio-assistant-operator'
import type { StudioAction, StudioFormState } from '@/contexts/studio-context'
import { AdvancedParamsSchema } from '@/types'
import type {
  AssistantOperatorAppliedStep,
  AssistantOperatorGenerationRequest,
  AssistantOperatorStep,
} from '@/types/assistant-operator'
import type { LoraCandidateImportPayload } from '@/types/lora-candidate'

/**
 * LoRA 装配台**专属**的那几只手（P4-C）。
 *
 * ── 为什么是一个**可选的能力组**，而不是几个必填成员 ────────────────
 * 这份上下文从 P4-C 起有**两个宿主**：工作台（`/studio/image|video`）与装配台
 * （`/studio/lora`）。必填成员会逼工作台那份实现三个它做不到的方法 —— 而
 * 「实现成空函数」正是本仓最讨厌的那种失败（点了没反应，三绿）。
 * ⚠ 缺席在运行时**不会发生**：域工具表已经把这三条工具锁在 LoRA 域里（服务端
 * 还有 `noSuchControl` 那道硬闸），而 LoRA 域只有装配台会送上来。这里的可选是
 * **类型层的诚实**，不是运行时的兜底。
 */
export interface StudioOperatorLoraContext {
  /**
   * 挂一把：导入进库 → 进挂载栈 → 触发词落提示词。
   *
   * ⚠ 与 `mountUserUrl` 同样是「交出去就不管」而不是 `Promise`：`applyOperatorStep`
   * 是同步纯函数（两个调用方谁都不该为一次网络往返变成 async）。宿主内部走的是
   * **既有那条一次确认链**（`useLoraCandidateConfirm`），⛔ 不新造第二条导入路径。
   * ⚠ 失败不静默：宿主往线程里插一行（同 `urlImportFailed` 的做法）。
   */
  mount(input: {
    candidateId: string
    name: string
    weight: number
    triggerWords: readonly string[]
    importPayload: LoraCandidateImportPayload
  }): void
  /** 撤销挂载：按 **candidateId** 反查它挂上去的那一把并摘掉（库记录 id 在宿主手上）。 */
  unmountByCandidateId(candidateId: string): void
  /** 摘一把（按库记录 id）。 */
  unmount(loraId: string): void
  /** 撤销摘除：挂回去。⚠ 那条库记录由宿主在摘的一刻扣下来 —— 服务端没有它。 */
  remount(loraId: string, weight: number): void
  setWeight(loraId: string, weight: number): void
}

/**
 * `applyOperatorStep` / `revertOperatorStep` **真正读到的那两格**。
 *
 * ⚠ P4-C 起这里不再写 `StudioFormState`：那个类型有 49 个字段，而这一层只读两个。
 * 收窄不是洁癖 —— LoRA 装配台（第二个宿主）根本没有 studio reducer，要它伪造一份
 * 49 字段的表单，等于让一堆假值进入一个只会读两格的函数。`StudioFormState` 在结构
 * 上照样满足这个接口，工作台那份宿主一个字都不用改。
 */
export interface StudioOperatorFormReadModel {
  prompt: StudioFormState['prompt']
  advancedParams: StudioFormState['advancedParams']
}

export interface StudioOperatorApplyContext {
  /** 读**当前**表单 —— 不是 render 时的快照：append / advancedParams 合并都要最新值。 */
  getState(): StudioOperatorFormReadModel
  dispatch(action: StudioAction): void
  /**
   * 助手给的是 `modelId`，表单存的是 `optionId`（编了路由）。
   * 映射由宿主给（`modelOptions` 已按偏好排过序，取第一条命中的就是既有选路
   * 逻辑的答案）—— ⛔ 别在这里另写一套路由选择。
   */
  resolveOptionId(modelId: string): string | null
  /**
   * 挂一张参考图到**指定槽**（`slot` 第二期加）。
   *
   * ⚠ 名字没跟着改成 `mountReference`：这只手在图片档、视频档、装配台三个宿主上
   * 是同一只，改名等于把三处调用点连同它们的测试一起动 —— 而这一轮真正变的只有
   * 「挂到哪儿」。⛔ 不为对齐工具名而改（Engineering Principles 2）。
   * ⚠ `slot` 缺席 = `reference`（追加一张无语义参考图），也就是改动之前的行为。
   * 首帧 / 尾帧落到**位置**（0 槽 / 1 槽），那是首尾帧今天真正的承载方式
   * （`constants/reference-image-capabilities.ts` 头注）；宿主拿不到那个槽时
   * （装配台）忽略 `slot` 即可 —— 域工具表本来就不会在那里发出具名槽。
   */
  addReference(url: string, slot?: AssistantOperatorReferenceSlot): void
  removeReference(url: string, slot?: AssistantOperatorReferenceSlot): void
  /**
   * 挂一段音频参考（P4-A，台账 A）—— 视频档的第二个参考槽。
   *
   * ⚠ 与 `addReference` 分开是因为**槽不同**：图片走 `imageUpload`，音频走
   * `state.videoAudioRefs`（各有各的上限，撤销也各撤各的）。宿主自己按 URL 去重
   * （与面板里那条 `addRef` 同一份判据）。
   */
  addAudioReference(entry: {
    url: string
    fileName: string
    ownerName?: string
  }): void
  removeAudioReference(url: string): void
  /**
   * 视频出不出声。⚠ 收 `null` —— 那是「用户没设过」这一档，撤销要回得去
   * （见协议里 `set_sound` 的 `inverse`）。
   */
  setSound(enabled: boolean | null): void
  /**
   * 用户亲手递来的一条地址：取图入库并挂上（P3-D，拍板 22）。
   *
   * ⚠ 它是这份上下文里**唯一一个异步动作**，所以做成「交出去就不管」而不是
   * `Promise`：`applyOperatorStep` 是同步纯函数，它的两个调用方（事件循环、
   * 参数栏的 ✦）谁都不该为了一次网络往返变成 async。落地之后由宿主自己
   * `addReference`，失败由宿主往线程里插一行 —— ⛔ 不静默。
   * ⚠ 服务端在这一步一个字节都没碰（钱闸/R2 闸不松），取图发生在这一跳。
   */
  mountUserUrl(sourceUrl: string, domain?: string): void
  /** 撤销上面那条：按**源地址**反查它挂上去的那一张并摘掉。⛔ 不删素材。 */
  unmountUserUrl(sourceUrl: string): void
  /** 生成键的 primed 态（拍板 2：这是整条链离「生成」最近的地方）。 */
  setPrimed(primed: boolean): void
  /**
   * **扣扳机的那只手**（§6 花钱档，拍板 2 的新形态）。
   *
   * ⭐ 服务端到 `request_generation` 那一步为止只吐了一份载荷；真正把这一枪打出去
   * 的动作发生在这里，而且走的是**用户自己那颗生成键的同一条路**（工作台上是
   * `REQUEST_GENERATE`，即 `useStudioGenerateAction` 的执行端）。⛔ 别在宿主里
   * 另调一次 `studioGenerateAPI`：那条路上的闸门、请求组装、报价、队列上限全在
   * `useStudioGenerateAction` 里，抄第二份必然与按钮说两句不一样的话
   * （这正是那个 hook 当初被抽出来的理由）。
   *
   * ⚠ 与 `mountUserUrl` 同样是「交出去就不管」而不是 `Promise`：`applyOperatorStep`
   * 是同步纯函数。结果回灌由既有的生成链自己完成（结果进 `useStudioGen` 的
   * `activeRun`，归属追踪 `lib/studio-operator-claim.ts` 照旧认得出这一枪）。
   * ⚠ **缺席 = 这个宿主没有生成键**（LoRA 装配台的出图键住在 `GenerateBranch` 的
   * 局部 state 里，宿主契约上还没有这只手）。缺席不会在运行时发生：域工具表已经
   * 把 `request_generation` 锁在图片 / 视频两个域里。这里的可选是类型层的诚实。
   */
  triggerGeneration?(request: AssistantOperatorGenerationRequest): void
  /** ⚠ 缺席 = 这个宿主没有 LoRA 挂载栈。见 `StudioOperatorLoraContext` 头注。 */
  lora?: StudioOperatorLoraContext
  /**
   * 撤销一条**刚被助手记下的项目规则**（§10，拍板 23）。
   *
   * ⚠ 与这份上下文里其他每一条都不同：`add_project_rule` 的后果**落在服务端**
   * （库里多了一行），表单一个字都没动。所以「应用」这一步在客户端是空操作，
   * 只有撤销要真的做一件事 —— 把那一行删掉（走 `deleteProjectRuleAPI`）。
   * ⚠ 缺席 = 这个宿主还没接规则那条线；缺席时撤销是**静默不做**，⛔ 不抛：
   * 少一个可选的手不该让整条撤销链断掉。
   */
  deleteProjectRule?(ruleId: string): void
}

/** 清晰度的收窄 —— 直接问 schema，不在这里抄一份 `['auto','1K','2K','4K']`。 */
function toResolution(
  value: string,
): NonNullable<StudioFormState['advancedParams']['resolution']> | null {
  const parsed = AdvancedParamsSchema.shape.resolution.safeParse(value)
  return parsed.success && parsed.data ? parsed.data : null
}

/**
 * 一步动的是哪个字段 —— 归属标记（✦）与撤销的粒度。
 *
 * ⚠ 读类工具与被拒的步返回 `null`：它们什么都没应用，也就没有东西可撤。
 */
export function getOperatorStepField(
  step: AssistantOperatorStep,
): StudioOperatorField | null {
  /**
   * ⚠ **被拒的那一步没有字段**，哪怕它的 `tool` 是个改动型工具 —— 它什么都没
   * 应用。漏了这道守卫的表现很具体：还原某个字段时，日志里那条「这个模型不在
   * 你能选的表里」也会被划线，看起来像「我撤销了一件根本没发生的事」。
   * （2026-08-30 单测抓到的。）
   */
  if (step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.error) return null

  switch (step.tool) {
    case ASSISTANT_OPERATOR_TOOL_IDS.setPrompt:
      return STUDIO_OPERATOR_FIELD_IDS.prompt
    case ASSISTANT_OPERATOR_TOOL_IDS.setNegative:
      return STUDIO_OPERATOR_FIELD_IDS.negative
    case ASSISTANT_OPERATOR_TOOL_IDS.setModel:
      return STUDIO_OPERATOR_FIELD_IDS.model
    case ASSISTANT_OPERATOR_TOOL_IDS.setSpecs:
    // 视频的规格三格与图片的两格**共用一格登记**：它们回答的是同一个问题
    // 「下一版长什么样」，而两个域不会同时在场。
    case ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs:
      return STUDIO_OPERATOR_FIELD_IDS.specs
    case ASSISTANT_OPERATOR_TOOL_IDS.setCount:
      return STUDIO_OPERATOR_FIELD_IDS.count
    case ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference:
      return STUDIO_OPERATOR_FIELD_IDS.audioReferences
    case ASSISTANT_OPERATOR_TOOL_IDS.setSound:
      return STUDIO_OPERATOR_FIELD_IDS.sound
    case ASSISTANT_OPERATOR_TOOL_IDS.mountReference:
    // 拍板 22 那条动的也是参考位 —— 与 `mount_reference` 共用一格，撤销粒度相同。
    case ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl:
      return STUDIO_OPERATOR_FIELD_IDS.references
    // 挂 / 摘 / 调权重共用一格 —— 它们回答的是同一个问题「这次由哪几把 LoRA
    // 说了算」（理由见 `STUDIO_OPERATOR_FIELD_IDS.loras` 的头注）。
    case ASSISTANT_OPERATOR_TOOL_IDS.mountLora:
    case ASSISTANT_OPERATOR_TOOL_IDS.unmountLora:
    case ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight:
      return STUDIO_OPERATOR_FIELD_IDS.loras
    default:
      // `prime_generate` 有意不算「字段」：生成键不是表单的一格，它的还原由
      // 「清掉全部改动」顺手做掉（拍板 14 要求清完不能留一个亮着的生成键）。
      // `request_generation` 同样落在这里，理由更硬一层：它撤不掉（§6 花钱档），
      // 给它一格 = 在 checkpoint 上摆一颗点了没反应的撤销钮。
      return null
  }
}

/** 助手动它之前那个字段长什么样 —— 归属标记 hover 时显示的「原值」。 */
export function describeOperatorInverse(
  step: AssistantOperatorAppliedStep,
): string {
  switch (step.tool) {
    case ASSISTANT_OPERATOR_TOOL_IDS.setPrompt:
    case ASSISTANT_OPERATOR_TOOL_IDS.setNegative:
      return step.inverse.value
    case ASSISTANT_OPERATOR_TOOL_IDS.setModel:
      return step.inverse.modelId ?? ''
    case ASSISTANT_OPERATOR_TOOL_IDS.setSpecs:
      return [step.inverse.aspectRatio, step.inverse.resolution]
        .filter(Boolean)
        .join(' · ')
    case ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs:
      return [
        step.inverse.durationSeconds === null
          ? null
          : `${step.inverse.durationSeconds}s`,
        step.inverse.aspectRatio,
        step.inverse.resolution,
      ]
        .filter(Boolean)
        .join(' · ')
    case ASSISTANT_OPERATOR_TOOL_IDS.setCount:
      return String(step.inverse.count)
    case ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference:
      return step.payload.label ?? step.payload.url
    /**
     * ⚠ 三态要说得出「没设过」：空串在 hover 里渲染成「原来是空的」，
     * 而那正是这一档的意思（跟着模型目录默认走）。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.setSound:
      return step.inverse.enabled === null ? '' : String(step.inverse.enabled)
    case ASSISTANT_OPERATOR_TOOL_IDS.mountReference:
      return step.payload.url
    case ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl:
      // 显示**源地址**：那是用户自己粘过来的那一串，他认得出来；落地地址是一串
      // 他从没见过的 R2 key。
      return step.payload.url
    /**
     * ⚠ 挂 / 摘显示的是**那把 LoRA 的名字**（不是 id）：用户认得出名字，
     * 认不出 `civitai:12345:67890`。调权重显示的是**改之前那个数**。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.mountLora:
    case ASSISTANT_OPERATOR_TOOL_IDS.unmountLora:
      return step.payload.name
    case ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight:
      return String(step.inverse.weight)
    default:
      return ''
  }
}

/**
 * 应用一步。返回它动了哪个字段（登记簿据此记账），什么都没动就返回 `null`。
 */
export function applyOperatorStep(
  step: AssistantOperatorAppliedStep,
  ctx: StudioOperatorApplyContext,
): StudioOperatorField | null {
  switch (step.tool) {
    case ASSISTANT_OPERATOR_TOOL_IDS.readState:
    case ASSISTANT_OPERATOR_TOOL_IDS.searchAssets:
    case ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders:
    case ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder:
    /**
     * ⚠ `search_web_images` **必须显式列在这里**，不能靠 switch 漏出去：
     * 本仓没开 `noImplicitReturns`，漏掉的分支会返回 `undefined` 而不是 `null`，
     * 编译器一声不吭 —— 而它恰好也「看起来对」（falsy，登记簿不记账）。
     * 写出来是为了让「联网候选不动表单」成为一条读得出来的决定：候选只是预览，
     * 落地由用户点选完成（owner 拍板），⛔ 助手这一步什么都没改。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages:
    /**
     * ⚠ 联网查文字（切片 3b）同理：它只产生一段可读的来源列表，表单一个字都没动。
     * 要照查到的东西改提示词是之后那条 `set_*` 的事——那条各自可撤销、各自记账。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.searchWeb:
    /**
     * ⚠ 有目标的检索与读正文（2026-09-06）同理：它们只把证据摆到桌上，
     * 表单一个字都没动。要照证据改提示词是之后那条 `set_*` 的事 —— 那条各自
     * 可撤销、各自记账。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.research:
    case ASSISTANT_OPERATOR_TOOL_IDS.readUrl:
    /**
     * ⚠ 看图（P3-C）也是读：它只产生一段评价，表单一个字都没动 —— 要改什么由
     * 它之后那几条 `set_*` 各自负责（因此各自可撤销、各自进登记簿）。
     * 让评价这一步也「记一笔改动」的表现是：还原时多撤一格，而那一格什么都没改过。
     */
    /**
     * ⚠ 找 LoRA 也是读（P4-C）：候选行上那几条是纯预览，一把都没下载、没挂上。
     * 与 `search_web_images` 逐字同源 —— 落地由 `mount_lora` 负责。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.searchLoras:
    /**
     * ⚠ 规则两条也不动表单（§10）：读规则是读；**记一条规则的后果落在服务端**
     * （库里多一行），客户端这一步没有任何字段要改。返回 null = 登记簿不记账，
     * 归属标记（✦）因此不会亮在一个它没改过的字段上。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.readProjectRules:
    case ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule:
    /**
     * ⚠ 上下文卡两条也不动表单（K1）：读卡就是把文本摆到模型面前。
     * ⛔ 别因为卡上带着参考图 URL 就以为这一步挂了图 —— 真挂上那一跳是之后那条
     * `mount_reference`，归属标记与撤销都归它。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.listContextCards:
    case ASSISTANT_OPERATOR_TOOL_IDS.readContextCard:
      return null

    case ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult:
      return null

    case ASSISTANT_OPERATOR_TOOL_IDS.setPrompt: {
      const current = ctx.getState().prompt
      // ⚠ 追加用的是**协议里那个分隔符**，不是 `appendPromptFragments`：服务端
      //    算 `inverse` 与 observation 时用的就是它，换一个客户端就与助手说的
      //    话对不上（它会以为提示词里多了个它没写过的顿号）。
      const next =
        step.payload.mode === ASSISTANT_OPERATOR_WRITE_MODES.append && current
          ? `${current}${ASSISTANT_OPERATOR_APPEND_SEPARATOR}${step.payload.value}`
          : step.payload.value
      ctx.dispatch({ type: 'SET_PROMPT', payload: next })
      return STUDIO_OPERATOR_FIELD_IDS.prompt
    }

    case ASSISTANT_OPERATOR_TOOL_IDS.setNegative: {
      const advancedParams = ctx.getState().advancedParams
      const current = advancedParams.negativePrompt ?? ''
      const next =
        step.payload.mode === ASSISTANT_OPERATOR_WRITE_MODES.append && current
          ? `${current}${ASSISTANT_OPERATOR_APPEND_SEPARATOR}${step.payload.value}`
          : step.payload.value
      ctx.dispatch({
        type: 'SET_ADVANCED_PARAMS',
        payload: { ...advancedParams, negativePrompt: next },
      })
      return STUDIO_OPERATOR_FIELD_IDS.negative
    }

    case ASSISTANT_OPERATOR_TOOL_IDS.setModel: {
      const optionId = ctx.resolveOptionId(step.payload.modelId)
      if (!optionId) return null
      ctx.dispatch({ type: 'SET_OPTION_ID', payload: optionId })
      return STUDIO_OPERATOR_FIELD_IDS.model
    }

    case ASSISTANT_OPERATOR_TOOL_IDS.setSpecs: {
      const resolution = toResolution(step.payload.resolution)
      if (!isAspectRatio(step.payload.aspectRatio) || !resolution) return null
      // ⭐ 台账 AE/BG/BS：两个 dispatch 是一件事，不是两件。
      ctx.dispatch({
        type: 'SET_ASPECT_RATIO',
        payload: step.payload.aspectRatio,
      })
      ctx.dispatch({
        type: 'SET_ADVANCED_PARAMS',
        payload: { ...ctx.getState().advancedParams, resolution },
      })
      return STUDIO_OPERATOR_FIELD_IDS.specs
    }

    /**
     * 视频规格三格（P4-A）。
     *
     * ⚠ **三个 dispatch 是一件事**（同图片那条）：载荷永远带齐三格，所以这里
     * 逐格落，`null` 的那格照落 —— 那是「这个模型不吃这个参数」或「交给
     * provider 默认」，两种都是真值，⛔ 不能跳过。
     * ⚠ 比例仍走 `SET_ASPECT_RATIO`（图片/视频共用那个字段），清晰度走
     * `SET_VIDEO_RESOLUTION`（收 `string | null`），时长走 `SET_VIDEO_DURATION`。
     * ⚠ 值域收窄各用各的谓词：视频的清晰度是 `480p/720p/…`，喂给图片那张
     * `auto/1K/2K/4K` 的 schema 永远过不了 —— 这正是「别把图片快照字段硬塞给
     * 视频」在应用层的样子。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs: {
      const { durationSeconds, aspectRatio, resolution } = step.payload
      if (aspectRatio !== null && isAspectRatio(aspectRatio)) {
        ctx.dispatch({ type: 'SET_ASPECT_RATIO', payload: aspectRatio })
      }
      if (durationSeconds !== null) {
        ctx.dispatch({ type: 'SET_VIDEO_DURATION', payload: durationSeconds })
      }
      ctx.dispatch({
        type: 'SET_VIDEO_RESOLUTION',
        payload:
          resolution !== null && isVideoResolution(resolution)
            ? resolution
            : null,
      })
      return STUDIO_OPERATOR_FIELD_IDS.specs
    }

    case ASSISTANT_OPERATOR_TOOL_IDS.setCount: {
      if (!isImageBatchCount(step.payload.count)) return null
      ctx.dispatch({
        type: 'SET_IMAGE_BATCH_COUNT',
        payload: step.payload.count,
      })
      return STUDIO_OPERATOR_FIELD_IDS.count
    }

    case ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference: {
      ctx.addAudioReference({
        url: step.payload.url,
        // 素材库里的音频常常没有文件名 —— 服务端已经把台词首句放进 `label`
        // （与 `StudioVideoAudioPanel` 手动挑素材时同一条兜底）。
        fileName: step.payload.label ?? step.payload.assetId,
        ...(step.payload.ownerName
          ? { ownerName: step.payload.ownerName }
          : {}),
      })
      return STUDIO_OPERATOR_FIELD_IDS.audioReferences
    }

    case ASSISTANT_OPERATOR_TOOL_IDS.setSound: {
      ctx.setSound(step.payload.enabled)
      return STUDIO_OPERATOR_FIELD_IDS.sound
    }

    case ASSISTANT_OPERATOR_TOOL_IDS.mountReference: {
      ctx.addReference(step.payload.url, step.payload.slot)
      return STUDIO_OPERATOR_FIELD_IDS.references
    }

    /**
     * 拍板 22：用户递来的地址。**这一格就地记账**（返回 references），哪怕取图
     * 还在路上 —— 归属标记与撤销认的是「助手动过参考位」这件事，而它此刻已经
     * 板上钉钉；等网络回来再记账的话，用户在那几秒里撤不掉自己刚看到的那一步。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl: {
      ctx.mountUserUrl(step.payload.url, step.payload.domain)
      return STUDIO_OPERATOR_FIELD_IDS.references
    }

    /**
     * LoRA 装配台的三条（P4-C）。
     *
     * ⚠ `ctx.lora` 缺席时**整步不记账**（返回 null）—— 与 `set_model` 查不到
     * optionId 时同一个做法。运行时到不了这里（域工具表 + 服务端硬闸两道），
     * 这一行是让「宿主漏接一只手」在登记簿上表现为「没改过」，而不是
     * 「✦ 亮着、点了没反应」。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.mountLora: {
      if (!ctx.lora) return null
      ctx.lora.mount({
        candidateId: step.payload.candidateId,
        name: step.payload.name,
        weight: step.payload.weight,
        triggerWords: step.payload.triggerWords,
        importPayload: step.payload.importPayload,
      })
      return STUDIO_OPERATOR_FIELD_IDS.loras
    }

    case ASSISTANT_OPERATOR_TOOL_IDS.unmountLora: {
      if (!ctx.lora) return null
      ctx.lora.unmount(step.payload.loraId)
      return STUDIO_OPERATOR_FIELD_IDS.loras
    }

    case ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight: {
      if (!ctx.lora) return null
      ctx.lora.setWeight(step.payload.loraId, step.payload.weight)
      return STUDIO_OPERATOR_FIELD_IDS.loras
    }

    case ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate: {
      ctx.setPrimed(true)
      return null
    }

    /**
     * 请求发送（§6 花钱档）—— 这一跳就是「客户端扣扳机」本身。
     *
     * ⚠ 返回 `null`：它没有动表单的任何一格，因此不进登记簿、不算进 checkpoint
     * 的「已改 N 项」。⛔ 更不该记账的理由是撤销：登记簿里的每一条都配着一个
     * `inverse`，而这一条撤不掉。
     * ⚠ 宿主没有这只手时**什么都不做**（LoRA 装配台）—— 域工具表已经拦在前面，
     * 这里不抛：一条走不到的路不值得让整轮崩掉。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration: {
      ctx.triggerGeneration?.(step.payload)
      return null
    }
  }
}

/**
 * 撤销一步 —— **用的是同一条 step 的 `inverse`**（拍板 18）。
 *
 * ⚠ `mount_reference` 的 inverse 只有 `assetId`，摘除要的却是 URL ——
 * 所以这里读的是 `payload.url`：整条 step 都在手上，不必让契约为客户端的实现
 * 细节多带一个字段。
 */
export function revertOperatorStep(
  step: AssistantOperatorAppliedStep,
  ctx: StudioOperatorApplyContext,
): void {
  switch (step.tool) {
    case ASSISTANT_OPERATOR_TOOL_IDS.readState:
    case ASSISTANT_OPERATOR_TOOL_IDS.searchAssets:
    case ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders:
    case ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder:
    // 读类没有 inverse，也就没有东西可撤 —— 联网候选与看图同理
    // （见 `applyOperatorStep`）。
    case ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages:
    case ASSISTANT_OPERATOR_TOOL_IDS.searchLoras:
    case ASSISTANT_OPERATOR_TOOL_IDS.research:
    case ASSISTANT_OPERATOR_TOOL_IDS.readUrl:
    case ASSISTANT_OPERATOR_TOOL_IDS.readProjectRules:
    case ASSISTANT_OPERATOR_TOOL_IDS.listContextCards:
    case ASSISTANT_OPERATOR_TOOL_IDS.readContextCard:
    case ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult:
      return

    /**
     * ⚠ 唯一一条撤销要**打一次网络**的：记下的那一行在库里，删它得走路由。
     * 宿主没接这条线时静默不做（见 `deleteProjectRule` 头注）。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule:
      ctx.deleteProjectRule?.(step.inverse.ruleId)
      return

    case ASSISTANT_OPERATOR_TOOL_IDS.setPrompt:
      ctx.dispatch({ type: 'SET_PROMPT', payload: step.inverse.value })
      return

    case ASSISTANT_OPERATOR_TOOL_IDS.setNegative:
      ctx.dispatch({
        type: 'SET_ADVANCED_PARAMS',
        payload: {
          ...ctx.getState().advancedParams,
          // 空串 = 那个框本来就是空的 → 回到 `undefined`，而不是留一个空字符串
          //（后者会让「有没有负面词」这个判据在别处变成 true）。
          negativePrompt: step.inverse.value || undefined,
        },
      })
      return

    case ASSISTANT_OPERATOR_TOOL_IDS.setModel: {
      const previous = step.inverse.modelId
      if (previous === null) {
        ctx.dispatch({ type: 'SET_OPTION_ID', payload: null })
        return
      }
      const optionId = ctx.resolveOptionId(previous)
      ctx.dispatch({ type: 'SET_OPTION_ID', payload: optionId })
      return
    }

    case ASSISTANT_OPERATOR_TOOL_IDS.setSpecs: {
      const { aspectRatio, resolution } = step.inverse
      if (aspectRatio && isAspectRatio(aspectRatio)) {
        ctx.dispatch({ type: 'SET_ASPECT_RATIO', payload: aspectRatio })
      }
      ctx.dispatch({
        type: 'SET_ADVANCED_PARAMS',
        payload: {
          ...ctx.getState().advancedParams,
          resolution: resolution
            ? (toResolution(resolution) ?? undefined)
            : undefined,
        },
      })
      return
    }

    /** ⭐ 逆操作也带齐三格 —— 撤销一定落回一个真实存在过的三元组。 */
    case ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs: {
      const { durationSeconds, aspectRatio, resolution } = step.inverse
      if (aspectRatio !== null && isAspectRatio(aspectRatio)) {
        ctx.dispatch({ type: 'SET_ASPECT_RATIO', payload: aspectRatio })
      }
      if (durationSeconds !== null) {
        ctx.dispatch({ type: 'SET_VIDEO_DURATION', payload: durationSeconds })
      }
      ctx.dispatch({
        type: 'SET_VIDEO_RESOLUTION',
        payload:
          resolution !== null && isVideoResolution(resolution)
            ? resolution
            : null,
      })
      return
    }

    case ASSISTANT_OPERATOR_TOOL_IDS.setCount:
      if (isImageBatchCount(step.inverse.count)) {
        ctx.dispatch({
          type: 'SET_IMAGE_BATCH_COUNT',
          payload: step.inverse.count,
        })
      }
      return

    case ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference:
      ctx.removeAudioReference(step.payload.url)
      return

    /** ⚠ 回得到 `null`（用户没设过那一档）—— 见 `setSound` 的 `inverse` 头注。 */
    case ASSISTANT_OPERATOR_TOOL_IDS.setSound:
      ctx.setSound(step.inverse.enabled)
      return

    case ASSISTANT_OPERATOR_TOOL_IDS.mountReference:
      ctx.removeReference(step.payload.url, step.inverse.slot)
      return

    /**
     * ⚠ 摘的是**挂载**，⛔ 不删素材：那条地址是用户亲手递的，图进他库里是他的
     * 决定。拍板 21 的「零残留」管的是助手自己搜出来的候选（他没要的那些），
     * 不是这一条。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl:
      ctx.unmountUserUrl(step.payload.url)
      return

    /**
     * ⚠ 撤销挂载 = **摘掉挂载，⛔ 不删库记录**：那把 LoRA 已经收进用户的库了，
     * 而「收进库」与「这次用不用它」是两件事（同 `import_user_url` 的那条：
     * 撤销不删素材）。要清库有素材页那条既有的路。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.mountLora:
      ctx.lora?.unmountByCandidateId(step.payload.candidateId)
      return

    case ASSISTANT_OPERATOR_TOOL_IDS.unmountLora:
      ctx.lora?.remount(step.inverse.loraId, step.inverse.weight)
      return

    case ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight:
      ctx.lora?.setWeight(step.inverse.loraId, step.inverse.weight)
      return

    case ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate:
      ctx.setPrimed(false)
      return

    /**
     * ⛔ **撤不掉，也不假装撤得掉**（§6 花钱档）。这一枪打出去之后：钱扣了、
     * 队列里多了一条、结果迟早会回来 —— 客户端这一侧没有任何一个动作能把这三件事
     * 收回去。回头路是结果卡（「按这张继续」/ 重新调参再打一枪），不是撤销钮。
     * ⚠ 写出这个空分支是有意的：不写的话 switch 漏出去，而本仓没开
     * `noImplicitReturns`，编译器一声不吭（同 `search_web_images` 那条头注）。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration:
      return
  }
}
