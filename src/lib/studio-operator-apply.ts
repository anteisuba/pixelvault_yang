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
  ASSISTANT_OPERATOR_VERB_IDS,
  ASSISTANT_OPERATOR_WRITE_MODES,
  type AssistantOperatorDomain,
  type AssistantOperatorReferenceSlot,
  type GenerationReviewState,
} from '@/constants/assistant-operator'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { isAspectRatio } from '@/constants/config'
import { isImageBatchCount } from '@/constants/studio'
import { isVideoResolution } from '@/constants/video-options'
import {
  STUDIO_OPERATOR_FIELD_IDS,
  STUDIO_OPERATOR_GENERATE_KNOB_IDS,
  type StudioOperatorField,
  type StudioOperatorGenerateKnob,
} from '@/constants/studio-assistant-operator'
import type { LoraCandidateConfirmOutcome } from '@/types/lora-candidate'
import { describeLoraParameters } from '@/lib/studio-operator-history'
import type { StudioAction, StudioFormState } from '@/contexts/studio-context'
import { AdvancedParamsSchema } from '@/types'
import type {
  AssistantAssetWriteRevert,
  AssistantOperatorAppliedStep,
  AssistantOperatorGenerationRequest,
  AssistantOperatorStep,
} from '@/types/assistant-operator'
import type { LoraCandidateImportPayload } from '@/types/lora-candidate'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type {
  StudioOperatorGenerationChoices,
  StudioOperatorGenerationControls,
} from '@/types/studio-assistant-operator'

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
  setParameters?(
    parameters: import('@/types/assistant-operator').AssistantLoraParameters,
  ): void
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
  }): Promise<LoraCandidateConfirmOutcome>
  /** 撤销挂载：按 **candidateId** 反查它挂上去的那一把并摘掉（库记录 id 在宿主手上）。 */
  unmountByCandidateId(candidateId: string): void
  /** 摘一把（按库记录 id）。 */
  unmount(loraId: string): void
  /** 撤销摘除：挂回去。⚠ 那条库记录由宿主在摘的一刻扣下来 —— 服务端没有它。 */
  remount(loraId: string, weight: number): void
  setWeight(loraId: string, weight: number): void
}

/**
 * 画布宿主**专属**的那只手（进度表 22）。
 *
 * ── 为什么又是一个可选能力组，而不是几个必填成员 ────────────────────
 * 判据与上面 `StudioOperatorLoraContext` 逐字同源：这份上下文现在有三个宿主
 * （工作台 / 装配台 / 画布），必填成员会逼另外两个实现一件它们做不到的事，而
 * 「实现成空函数」正是本仓最讨厌的那种失败（点了没反应，三绿）。
 * ⚠ 缺席在运行时**不会发生**：域工具表已经把画布那三条锁在 canvas 域里。
 *
 * ── ⛔ 为什么 `applyOp` 收一整条 op 而不是拆成八只手 ────────────────
 * 落地那一跳已经有一个逐条实现（`lib/node-assistant-op-apply-v4.ts`），它同时
 * 算出 inverse。拆成八只手等于把那个 switch 在这里再写一遍 —— 第二处定义。
 */
export interface StudioOperatorCanvasContext {
  /**
   * 落一条 v4 op。
   *
   * ⚠ 返回**这一条撤得掉吗**：执行器拒了（连不上 / 节点没了）时是 `false`，
   * 调用方据此不记账 —— ⛔ 别返回 void，那会让一条被拒的 op 在登记簿里留下一格
   * 「改过」，而参数栏上那颗 ✦ 指向一个什么都没变的节点。
   * ⚠ 撤销载荷由宿主在这一刻扣下来（按 step id 存），⛔ 服务端手上没有它。
   */
  applyOp(stepId: string, op: NodeAssistantOpV4): boolean
  /** 撤销：按 step id 取回宿主扣着的那份逆载荷并回放。 */
  revertOp(stepId: string): void
  /**
   * 扣扳机 —— 画布那一枪。⚠ 与工作台的 `triggerGeneration` 同一条纪律：
   * 交出去就不管（`applyOperatorStep` 是同步纯函数），结果回灌由画布自己的
   * 生成链完成。
   */
  generate(nodeId: string): void
  /**
   * 下游名单：沿具名槽边算一遍后继闭包。⚠ 由宿主算而不是服务端 —— 服务端那份
   * 快照是分层的，折叠的镜里没有边，闭包会漏。
   */
  planRerunDownstream(nodeId: string, includeSelf: boolean): readonly string[]
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
   * ⚠ 此 URL 导入由宿主独立回传结果，接口保持 void 而不是
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
  /**
   * **这一枪叫什么**（切片 Y）—— `prime_generate` / `request_generation` 的
   * `label`。
   *
   * ⭐ 名字不是装饰：产物名的摘要段按它算（`lib/generation-name.ts`），而用户
   * 之后就是打 `@图_012·银发少女` 来指认这一张的。助手给了名字却丢在半路上的
   * 表现是产物名回落成提示词头 8 个字 —— 一批 4 张全叫同一个名字。
   * ⚠ 缺席 = 这个宿主的生成链还没有名字这一格（LoRA 装配台）。缺席静默不做。
   */
  setGenerationLabel?(label: string): void
  /**
   * 助手把一件产物标成**已确认 / 已否**（切片 Y 的 `set_review_state`）。
   *
   * ⚠ 它落在操作员 store 而不是表单上（见 `applyOperatorStep` 里那条分支的头注）。
   */
  setReviewState?(assetId: string, state: GenerationReviewState): void
  /** ⚠ 缺席 = 这个宿主没有 LoRA 挂载栈。见 `StudioOperatorLoraContext` 头注。 */
  lora?: StudioOperatorLoraContext
  /** ⚠ 缺席 = 这个宿主不是画布（进度表 22）。判据同 `lora` 那条。 */
  canvas?: StudioOperatorCanvasContext
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
  /**
   * 撤销一条**素材库写操作**（v2 §10）—— 打标签 / 收藏 / 建夹 / 移动那四条。
   *
   * ⚠ 与 `deleteProjectRule` 同一条论据，只是四条共用一只手：这四条的后果**在库里**
   * （表单一个字都没动），所以「应用」在客户端是空操作，撤销才要真的做一件事 ——
   * 把 step 上那份 `inverse` 原样交回服务端（走 `revertAssistantAssetWriteAPI`）。
   * ⛔ 别在这一侧重新算一份 inverse：算第二遍就有第二份判据，而应用与撤销必须是
   * 同一份判据的两侧（本文件头注）。
   * ⚠ 缺席 = 这个宿主还没接素材库那条线；缺席时撤销**静默不做**，⛔ 不抛。
   */
  revertAssetWrite?(input: AssistantAssetWriteRevert): void
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
    case ASSISTANT_OPERATOR_TOOL_IDS.setLoraParameters:
    case ASSISTANT_OPERATOR_TOOL_IDS.setSpecs:
    // 视频的规格三格与图片的两格**共用一格登记**：它们回答的是同一个问题
    // 「下一版长什么样」，而两个域不会同时在场。
    case ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs:
      return STUDIO_OPERATOR_FIELD_IDS.specs
    case ASSISTANT_OPERATOR_TOOL_IDS.setCount:
      return STUDIO_OPERATOR_FIELD_IDS.count
    case ASSISTANT_OPERATOR_TOOL_IDS.setCapability:
      return STUDIO_OPERATOR_FIELD_IDS.capabilities
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
    /**
     * ⚠ 空串 = 「这一格用户没设过」—— hover 里渲染成「原来是空的」，与 `set_sound`
     * 的三态逐字同源。⛔ 别在这里填缺省值：那会让 hover 说「原来是 auto」，
     * 而撤销之后那一格并不会变成一个明确选中的 auto。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.setCapability:
      return step.inverse.value === null ? '' : String(step.inverse.value)
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
    /** ⚠ 显示的是**摘掉的那张**的地址 —— 那正是撤销会挂回去的那一条。 */
    case ASSISTANT_OPERATOR_TOOL_IDS.unmountReference:
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
    case ASSISTANT_OPERATOR_TOOL_IDS.setLoraParameters:
      return describeLoraParameters(step.inverse)
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
    case ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences:
      return null
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
    /** ⚠ 翻证据本（§7.3）也是读：它只把库里已有的正文摆出来，表单一个字都没动。 */
    case ASSISTANT_OPERATOR_TOOL_IDS.recallEvidence:
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
    /**
     * ⚠ 提议一张卡（§8.1）在这条通道上什么都没动：写库整条链都在客户端那一侧
     * （收到提议帧写一行 `proposed`，点「存这张卡」翻面），走的是
     * `/api/context-cards`，⛔ 不在这条应用通道上（那条改的是工作台上的旋钮）。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.proposeContextCard:
    /**
     * ⚠ 摆一张 LoRA 推荐卡（lora-assistant §10.2.2）同理：它只是把候选摆出来，
     * 装配台一格都没动。真正挂上那几把是下一轮各自独立的 `mount_lora`，
     * 应用与撤销都发生在那条上。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.planLoraPick:
    /**
     * ⚠ 素材库四条（§10）也**不动表单**：它们改的是用户库里那几件东西的标签 /
     * 星 / 归属夹，工作台上一格旋钮都没动。返回 null = 登记簿不记账、归属标记（✦）
     * 不会亮在一个它没改过的字段上 —— 与规则那条逐字同源。
     * ⛔ 但它们**照旧可撤销**：撤销那一跳走 `revertAssetWrite`（后果在库里），
     * 不靠登记簿。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.tagAsset:
    case ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset:
    case ASSISTANT_OPERATOR_TOOL_IDS.createFolder:
    case ASSISTANT_OPERATOR_TOOL_IDS.moveAssets:
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
        payload: {
          ...ctx.getState().advancedParams,
          resolution,
          ...(step.payload.quality !== undefined
            ? { quality: step.payload.quality }
            : {}),
          ...(step.payload.preview !== undefined
            ? { preview: step.payload.preview }
            : {}),
          ...(step.payload.background !== undefined
            ? { background: step.payload.background }
            : {}),
        },
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

    /**
     * 专属 chip 那一格（进度表 21）。
     *
     * ⚠ `SET_ADVANCED_PARAMS` **是整体替换**（本文件头注 ①）：只发一个键会把用户
     * 调好的 seed / resolution 一起清空，所以照旧 `{ ...current, [key]: value }`。
     * ⚠ 值域收窄在**服务端**做完了（键来自快照现给的那一行，值按 chip 形态校验），
     * 这里⛔ 不再抄一份判据 —— 抄第二份就有第二处会漂的真值。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.setCapability: {
      const next = {
        ...ctx.getState().advancedParams,
        [step.payload.key]: step.payload.value,
      } as StudioFormState['advancedParams']
      ctx.dispatch({ type: 'SET_ADVANCED_PARAMS', payload: next })
      return STUDIO_OPERATOR_FIELD_IDS.capabilities
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
     * 摘一张（进度表 21）—— **与挂载共用那两只手**，⛔ 不新开一条通道：
     * `removeReference` 在三个宿主上已经分好了「清一个帧槽」与「从轨上删一张」
     * 两条路（见 `use-studio-workbench-operator-host.ts` 那段头注）。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.unmountReference: {
      ctx.removeReference(step.payload.url, step.payload.slot)
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

    case ASSISTANT_OPERATOR_TOOL_IDS.setLoraParameters:
      if (!ctx.lora?.setParameters) return null
      ctx.lora.setParameters(step.payload)
      return STUDIO_OPERATOR_FIELD_IDS.specs
    case ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight: {
      if (!ctx.lora) return null
      ctx.lora.setWeight(step.payload.loraId, step.payload.weight)
      return STUDIO_OPERATOR_FIELD_IDS.loras
    }

    case ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate: {
      ctx.setPrimed(true)
      // ⭐ 备枪时给的名字**跟着这一枪走**（切片 Y）：它会成为产物名的摘要段
      //    （`图_012·银发少女立绘`），用户之后就是按这串字指认这一张的。
      //    ⚠ 没给名字时**不清掉**上一次的：模型常常先 `prime_generate` 定名、
      //    再改两格参数、最后 `request_generation` 空着 label 发出去。
      if (step.payload.label) ctx.setGenerationLabel?.(step.payload.label)
      return null
    }

    /**
     * 审核态（切片 Y）—— **落在 store，不落表单**。
     *
     * ⚠ 返回 `null`：它一格旋钮都没动，因此不进登记簿、✦ 不亮。撤销这件事由
     * 结果格上那两颗动作自己负责（再点一次就改回去），⛔ 不走撤销链 —— 那条链
     * 撤的是「助手对表单做过的事」。
     * ⚠ 宿主没接这只手时静默不做（同 `triggerGeneration` 的判据）。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.setReviewState: {
      ctx.setReviewState?.(step.payload.assetId, step.payload.state)
      return null
    }

    /**
     * 素材库四条（§10）—— **后果已经落在库里了**，客户端这一步什么都不做。
     *
     * ⚠ 返回 `null`：一格旋钮都没动，所以不进登记簿。撤销不走登记簿而走
     * `revertAssetWrite`（见 `revertOperatorStep`）—— 与 `add_project_rule` 同形。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.tagAsset:
    case ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset:
    case ASSISTANT_OPERATOR_TOOL_IDS.createFolder:
    case ASSISTANT_OPERATOR_TOOL_IDS.moveAssets:
      return null

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
      // ⚠ 名字先落、再扣扳机：扣扳机那一跳是同步 dispatch，落在它后面的话
      //    这一枪带的还是上一次的名字（或者干脆没有）。
      if (step.payload.label) ctx.setGenerationLabel?.(step.payload.label)
      ctx.triggerGeneration?.(step.payload)
      return null
    }

    /**
     * 画布：落一条 v4 op（进度表 22）。
     *
     * ⚠ 载荷原样交给执行器 —— 中间一个字段都不翻译（翻译层是分叉的温床）。
     * ⚠ 执行器拒了就**不记账**：一条没落成的 op 在登记簿里留一格「改过」的表现
     *   是节点上闪一次 outline 而它什么都没变。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.canvasApply: {
      const landed = ctx.canvas?.applyOp(step.id, step.payload) ?? false
      return landed ? STUDIO_OPERATOR_FIELD_IDS.canvasNodes : null
    }

    /**
     * 画布：算下游名单（读类）—— ⚠ 画布上一个节点都没动，所以不记账。
     * 名单本身由宿主在读流里回填进 step 的 `result`。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.canvasPlanRerun:
      return null

    /**
     * 画布：那一枪（花钱档）—— 这一跳就是「客户端扣扳机」本身。
     * ⚠ 返回 `null`：与 `request_generation` 逐字同源，它撤不掉，所以不记账。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.canvasGenerate:
      ctx.canvas?.generate(step.payload.target)
      return null
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
    case ASSISTANT_OPERATOR_TOOL_IDS.recallEvidence:
    case ASSISTANT_OPERATOR_TOOL_IDS.readProjectRules:
    case ASSISTANT_OPERATOR_TOOL_IDS.listContextCards:
    case ASSISTANT_OPERATOR_TOOL_IDS.readContextCard:
    case ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult:
    /** ⚠ 画布的下游名单也是读：一个节点都没动，也就没有东西可撤。 */
    case ASSISTANT_OPERATOR_TOOL_IDS.canvasPlanRerun:
      return

    /**
     * 画布：撤一条 op（进度表 22）。
     *
     * ⚠ 走的是**宿主扣着的那份逆载荷**，按 step id 取回 —— step 上那份 `inverse`
     * 只是指路条（服务端手上没有整份 data 快照）。形态与 `mount_lora` 的
     * `candidateId` 逐字同源。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.canvasApply:
      ctx.canvas?.revertOp(step.id)
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
      const { aspectRatio, resolution, quality, background, preview } =
        step.inverse
      if (aspectRatio && isAspectRatio(aspectRatio)) {
        ctx.dispatch({ type: 'SET_ASPECT_RATIO', payload: aspectRatio })
      }
      ctx.dispatch({
        type: 'SET_ADVANCED_PARAMS',
        payload: {
          ...ctx.getState().advancedParams,
          ...(quality !== undefined ? { quality: quality ?? undefined } : {}),
          ...(preview !== undefined ? { preview: preview ?? undefined } : {}),
          ...(background !== undefined
            ? { background: background ?? undefined }
            : {}),
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

    /**
     * ⚠ 撤回 `null` 时**把那个键删掉**，⛔ 不是写一个缺省值进去：删掉才等于
     * 「用户没设过」——留一个显式的缺省值会照样发给 provider，而那两件事在请求
     * 体里长得不一样（判据与 `pruneIncompatibleCapabilityValues` 逐字同源）。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.setCapability: {
      const next = { ...ctx.getState().advancedParams } as Record<
        string,
        unknown
      >
      if (step.inverse.value === null) delete next[step.inverse.key]
      else next[step.inverse.key] = step.inverse.value
      ctx.dispatch({
        type: 'SET_ADVANCED_PARAMS',
        payload: next as StudioFormState['advancedParams'],
      })
      return
    }

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

    /** ⚠ 撤销 = 原样挂回同一个位置（`inverse` 与载荷同形，不必反查对照表）。 */
    case ASSISTANT_OPERATOR_TOOL_IDS.unmountReference:
      ctx.addReference(step.inverse.url, step.inverse.slot)
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

    case ASSISTANT_OPERATOR_TOOL_IDS.setLoraParameters:
      ctx.lora?.setParameters?.(step.inverse)
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

    /**
     * ⛔ 审核态**不进撤销链**（切片 Y）：它不是「助手改了表单的一格」，而是
     * 一条对产物的判断。改回去的入口是结果格上那两颗动作 —— 那里能看见那张图。
     * ⚠ 空分支照旧写出来（同上一条的理由：本仓没开 `noImplicitReturns`）。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.setReviewState:
      return

    /**
     * 素材库四条（§10）—— 撤销要**打一次网络**：后果在库里，客户端手上没有任何
     * 东西可以往回改。交出去的是 step 上那份 `inverse` **原样**（逐条原值），
     * ⛔ 这一侧不重算。
     * ⚠ 宿主没接这条线时静默不做（同 `deleteProjectRule` 的判据）。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.tagAsset:
      ctx.revertAssetWrite?.({
        tool: ASSISTANT_OPERATOR_TOOL_IDS.tagAsset,
        entries: step.inverse.entries,
      })
      return

    case ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset:
      ctx.revertAssetWrite?.({
        tool: ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset,
        entries: step.inverse.entries,
      })
      return

    case ASSISTANT_OPERATOR_TOOL_IDS.createFolder:
      ctx.revertAssetWrite?.({
        tool: ASSISTANT_OPERATOR_TOOL_IDS.createFolder,
        folderId: step.inverse.folderId,
      })
      return

    case ASSISTANT_OPERATOR_TOOL_IDS.moveAssets:
      ctx.revertAssetWrite?.({
        tool: ASSISTANT_OPERATOR_TOOL_IDS.moveAssets,
        entries: step.inverse.entries,
      })
      return
  }
}

/**
 * ─── 生成确认卡的就地改参数（v2 §5，commit #9）─────────────────────────
 *
 * 这一段是 §5.2 那张表的**第二行与第四行**在纯函数层的落点：卡上改一项要
 * 「立刻写回工作台，走 `apply` 的同一条 op 通道，带 `inverse`」，于是它需要
 * ① 换模型之后的回落判据，② 把一次旋钮改动翻译成若干条 `AssistantOperatorAppliedStep`。
 *
 * ⭐ 为什么两件事都在这里而不在组件里：**应用与撤销必须是同一份判据的两侧**
 * （本文件头注）。卡上改出来的那一步与助手改出来的那一步走的是同一个
 * `applyOperatorStep` / `revertOperatorStep`，于是「谁改的」在撤销这一侧根本不需要
 * 分辨 —— 这正是 §5.2 第五行（先不要 = 已写回的改动不回滚，用户可以用 checkpoint 撤）
 * 能成立的结构理由。
 */

/** 四颗旋钮里**随模型变的那三格**的当前值。 */
export interface StudioOperatorGenerationValues {
  aspectRatio: string
  resolution: string | null
  count: number
}

export interface StudioOperatorGenerationFallback {
  values: StudioOperatorGenerationValues
  /** 这一次回落动了哪几颗 —— 卡上那句「已按 X 调整」按它写（§5.1）。 */
  adjusted: readonly StudioOperatorGenerateKnob[]
}

/**
 * **换模型之后的回落**（§5.1 那条 ⚠：不合法的值就地回落到该模型的默认值，
 * 并在卡上标一行「已按 X 调整」，⛔ 不弹二次确认）。
 *
 * ⭐ 「默认值」= **候选表的第一条**。这不是随手取的：三张表（`STUDIO_IMAGE_ASPECT_RATIOS`
 * / `IMAGE_BATCH_COUNTS` / 各 provider 的 `resolutionOptions`）的第一条本来就是
 * 工作台各自控件上的默认档，取它等于「回到用户自己点开那颗控件时会看到的那一档」。
 * ⚠ **空表不等于「随便填一个」**：比例与张数空表时保持原值（那说明这张表压根没算
 * 出来，改它只会凭空造一个值）；清晰度空表则落 `null` —— 那是「这个模型没有清晰度
 * 这颗旋钮」，而 `null` 正是表单里那一格的「不设」态。
 */
export function fallbackGenerationValues(
  current: StudioOperatorGenerationValues,
  choices: StudioOperatorGenerationChoices,
): StudioOperatorGenerationFallback {
  const adjusted: StudioOperatorGenerateKnob[] = []

  let aspectRatio = current.aspectRatio
  if (
    choices.aspectRatios.length > 0 &&
    !choices.aspectRatios.includes(aspectRatio)
  ) {
    aspectRatio = choices.aspectRatios[0]!
    adjusted.push(STUDIO_OPERATOR_GENERATE_KNOB_IDS.aspect)
  }

  let resolution = current.resolution
  if (choices.resolutions.length === 0) {
    if (resolution !== null) {
      resolution = null
      adjusted.push(STUDIO_OPERATOR_GENERATE_KNOB_IDS.resolution)
    }
  } else if (resolution === null || !choices.resolutions.includes(resolution)) {
    resolution = choices.resolutions[0]!
    adjusted.push(STUDIO_OPERATOR_GENERATE_KNOB_IDS.resolution)
  }

  let count = current.count
  if (choices.counts.length > 0 && !choices.counts.includes(count)) {
    count = choices.counts[0]!
    adjusted.push(STUDIO_OPERATOR_GENERATE_KNOB_IDS.count)
  }

  return { values: { aspectRatio, resolution, count }, adjusted }
}

export interface StudioOperatorGenerationKnobInput {
  knob: StudioOperatorGenerateKnob
  /** 下拉里点中的那一项（张数也是字符串 —— 它从 DOM 上来）。 */
  value: string
  domain: AssistantOperatorDomain
  controls: StudioOperatorGenerationControls
  /** 这一批步的 id 前缀 —— 调用方给（面板那只发号器）。 */
  stepId: string
  /** 步上那句话。⚠ i18n 在调用方（本文件是纯函数，碰不到 `useTranslations`）。 */
  title: string
  /** 归属标记 hover 里那句「为什么」。 */
  reason: string
  /** 图片档 `set_specs` 的三个附带格 —— 原样带回，撤销才回得去。 */
  advanced: {
    quality: StudioFormState['advancedParams']['quality']
    preview: StudioFormState['advancedParams']['preview']
    background: StudioFormState['advancedParams']['background']
  }
}

export interface StudioOperatorGenerationKnobSteps {
  steps: readonly AssistantOperatorAppliedStep[]
  /** 换模型顺手回落了哪几颗（§5.1 那行「已按 X 调整」）。 */
  adjusted: readonly StudioOperatorGenerateKnob[]
}

/**
 * 把卡上**一次旋钮改动**翻译成要落的那几条 step（§5.2 第二行）。
 *
 * ⭐ 换模型是**一次动作、可能两三条 step**：模型本身一条，回落掉的比例 / 清晰度
 * 一条（`set_specs` 台账 AE/BG/BS：两格必须同时下），张数一条。分开记账是因为
 * 登记簿按**字段**存（`STUDIO_OPERATOR_FIELD_IDS`）—— 合成一条的话「撤销比例」
 * 会把模型也一起撤回去，而用户按的那颗 ✦ 上写的是比例。
 * ⚠ 张数在视频档**不发**：那一档一次就是一条片子，卡上那颗旋钮本来就不画。
 * ⚠ 值域收窄不在这里做第二遍 —— `applyOperatorStep` 那三道守卫是唯一一道
 *   （收不窄就整条不落，⛔ 不 `as`）。
 */
export function buildGenerationKnobSteps({
  knob,
  value,
  domain,
  controls,
  stepId,
  title,
  reason,
  advanced,
}: StudioOperatorGenerationKnobInput): StudioOperatorGenerationKnobSteps {
  const base = {
    verb: ASSISTANT_OPERATOR_VERB_IDS.apply,
    title,
    reason,
    status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
  } as const
  const current: StudioOperatorGenerationValues = {
    aspectRatio: controls.aspectRatio,
    resolution: controls.resolution,
    count: controls.count,
  }

  /** 图片 / 视频两条规格通道 —— 载荷形状不同，⛔ 别硬塞给对方（P4-A 那条教训）。 */
  const specsStep = (
    id: string,
    next: StudioOperatorGenerationValues,
  ): AssistantOperatorAppliedStep =>
    domain === ASSISTANT_PROTOCOL_DOMAIN_IDS.video
      ? {
          ...base,
          id,
          tool: ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
          payload: {
            durationSeconds: null,
            aspectRatio: next.aspectRatio,
            resolution: next.resolution,
          },
          inverse: {
            durationSeconds: null,
            aspectRatio: current.aspectRatio,
            resolution: current.resolution,
          },
        }
      : {
          ...base,
          id,
          tool: ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
          payload: {
            aspectRatio: next.aspectRatio,
            // ⚠ 图片档的 `set_specs` 只有两格齐了才落（台账 AE/BG/BS）——
            //   这个模型没有清晰度这颗旋钮时写 `auto`，那正是表单里那一格的默认档。
            resolution: next.resolution ?? 'auto',
            quality: advanced.quality,
            preview: advanced.preview,
            background: advanced.background,
          },
          inverse: {
            aspectRatio: current.aspectRatio,
            resolution: current.resolution,
            quality: advanced.quality ?? null,
            preview: advanced.preview ?? null,
            background: advanced.background ?? null,
          },
        }

  if (knob === STUDIO_OPERATOR_GENERATE_KNOB_IDS.model) {
    if (value === controls.model?.id) return { steps: [], adjusted: [] }
    const { values, adjusted } = fallbackGenerationValues(
      current,
      controls.choicesByModel[value] ?? {
        aspectRatios: [],
        resolutions: [],
        counts: [],
      },
    )
    const steps: AssistantOperatorAppliedStep[] = [
      {
        ...base,
        id: `${stepId}-model`,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.setModel,
        payload: {
          modelId: value,
          ...(controls.models.find((model) => model.id === value)?.label
            ? {
                modelLabel: controls.models.find((model) => model.id === value)!
                  .label,
              }
            : {}),
        },
        inverse: { modelId: controls.model?.id ?? null },
      },
    ]
    if (
      adjusted.includes(STUDIO_OPERATOR_GENERATE_KNOB_IDS.aspect) ||
      adjusted.includes(STUDIO_OPERATOR_GENERATE_KNOB_IDS.resolution)
    ) {
      steps.push(specsStep(`${stepId}-specs`, values))
    }
    if (adjusted.includes(STUDIO_OPERATOR_GENERATE_KNOB_IDS.count)) {
      steps.push({
        ...base,
        id: `${stepId}-count`,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.setCount,
        payload: { count: values.count },
        inverse: { count: current.count },
      })
    }
    return { steps, adjusted }
  }

  if (knob === STUDIO_OPERATOR_GENERATE_KNOB_IDS.count) {
    const next = Number(value)
    if (!Number.isFinite(next) || next === current.count) {
      return { steps: [], adjusted: [] }
    }
    return {
      steps: [
        {
          ...base,
          id: `${stepId}-count`,
          tool: ASSISTANT_OPERATOR_TOOL_IDS.setCount,
          payload: { count: next },
          inverse: { count: current.count },
        },
      ],
      adjusted: [],
    }
  }

  const next: StudioOperatorGenerationValues =
    knob === STUDIO_OPERATOR_GENERATE_KNOB_IDS.aspect
      ? { ...current, aspectRatio: value }
      : { ...current, resolution: value }
  if (
    next.aspectRatio === current.aspectRatio &&
    next.resolution === current.resolution
  ) {
    return { steps: [], adjusted: [] }
  }
  return { steps: [specsStep(`${stepId}-specs`, next)], adjusted: [] }
}
