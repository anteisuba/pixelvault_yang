'use client'

/**
 * **确认卡**（v2 §3.3 / 画板 BCards「确认」那一节）—— 五类卡之一。
 *
 * ── 它收掉了什么 ────────────────────────────────────────────────
 * 三张卡合成这一张（§3.2「14 → 5」）：
 *  · 花费确认卡（整文件删，决策 8：花钱不再
 *    确认、不弹花费卡）；它的**生成**那一半留下来，成了 `generate` 支；
 *  · 计划 / 多步确认（此前寄居在反问卡的「阶段清单」里）—— 成了 `multistep` 支；
 *  · 覆盖手写三选（旧 `StudioOperatorConfirmCard`）—— 降级成**问题卡**（§3.1），
 *    ⛔ 不在这里留一支：它本来就是「三选一」那个形状。
 *
 * ── 两支为什么共用一张卡 ─────────────────────────────────────────
 * 用户看的是同一件事：「有一件事等你拍板才能往下走」。两支的差别只在**摆什么**，
 * 而那正是 `kind` 判别联合该干的活。⛔ 别按支再拆两颗组件：两颗组件的下场是
 * 「已确认 · 时间」那一态在其中一颗上忘了实现，而没有人会注意到。
 *
 * ── 状态就地换，⛔ 不离开时间线（§3.2 进离场表）────────────────────
 * 确认 / 取消之后卡**留在原地**换成「已确认 · 11:24」/「已取消 · 11:22」。
 * 理由：它是这一轮里的一次决定，抹掉它等于时间线上少了一段因果。
 *
 * ── 只做摘要：「要改什么：旧值 → 新值」（owner 11-18）──────────────────
 * 同一个值以前有三处能改（工作台 / 跟她说 / 卡上的旋钮下拉），卡上那一处删掉：卡只列这一枪
 * 要用的几格，这一轮助手动过的写「旧值 → 新值」（旧值 = `origins`，第一次动之前的值），
 * 没动过的只写现值；底下只有「确认 / 取消」。要改就在工作台上改，或者跟她说。
 * ⭐ 新值一律读宿主现算的 `controls`（工作台是真值），⛔ 卡上不存一份参数。
 * ⚠ 宿主不给 `controls` 时（LoRA 装配台）回落到 `request` 那份读数。
 * ⚠ 某颗的候选表为空 = 这个模型没有它（视频档大量如此），那一行**不画**。
 * ⚠ 首页那份小配方（没开台）：提示词与参考图只读摆出来，「去图片台接着改」留着（那是去
 *   完整表单的唯一入口，不是改值的控件）；型号没配 key 时按「确认」先就地配（Hard Rule 8）。
 */

import { useState } from 'react'
import Image from 'next/image'
import { ArrowRight } from '@/components/icons'
import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'

import {
  ASSISTANT_OPERATOR_CONFIRM_KIND_IDS,
  type AssistantOperatorConfirmKind,
} from '@/constants/assistant-operator'
import {
  STUDIO_OPERATOR_CONFIRM_STATUS_IDS,
  STUDIO_OPERATOR_GENERATE_KNOB_IDS,
  type StudioOperatorGenerateKnob,
} from '@/constants/studio-assistant-operator'
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import type { StudioOperatorSearchGroundingControl } from '@/contexts/studio-operator-host'
import { BlurSwap, useBlurSwapIn } from '@/components/ui/blur-swap'
import { Spinner } from '@/components/ui/spinner'
import { getTranslatedModelLabel } from '@/lib/model-options'
import type { StudioOperatorKnobOrigins } from '@/lib/studio-operator-confirm-origins'
import {
  buildCanvasGenerationRequest,
  type CanvasNodeGenerationState,
} from '@/lib/studio-operator-canvas-snapshot'
import {
  buildOperatorKnobSpecs,
  type StudioOperatorKnobSpec,
} from '@/lib/studio-operator-knobs'
import { cn } from '@/lib/utils'
import type {
  StudioOperatorConfirmPrompt,
  StudioOperatorGenerationControls,
  StudioOperatorGenerationDraft,
} from '@/types/studio-assistant-operator'

interface StudioOperatorConfirmCardProps {
  /**
   * ⚠ **搭配卡那一支不走这里**（`loraSetup`，lora-assistant §12）：它住在
   * `StudioOperatorLoraSetupCard`，与这三支一个字段都不共用。
   * 卡片助手的设定提议（`characterProfile`）同理，住在 `StudioOperatorCharacterProfileCard`；
   * 候选图（`characterImages`）住自己的卡（C3）；画布放大（`upscale`）住
   * `StudioOperatorUpscaleCard`。
   * ⛔ 别把它加回这份联合去换几行分支 —— 那正是 commit #1 那两个占位分支的下场。
   */
  confirm: Exclude<
    StudioOperatorConfirmPrompt,
    {
      kind:
        | typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.loraSetup
        | typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.characterProfile
        | typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.characterImages
        | typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.upscale
    }
  >
  /** 多步「开始」。 */
  onApprove(): void
  /** 多步「一步一步来」。 */
  onDecline(): void
  /** 生成「确认生成」—— ⚠ 扳机在宿主那颗生成键上，⛔ 不重发一轮（§5）。 */
  onConfirm(): void
  /** 生成「先不要」。 */
  onCancel(): void
  /** 上下文卡「存这张卡」（§8.1）—— 翻面那一跳在 hook 里。 */
  onSaveCard(): void
  /** 上下文卡「不用」—— hook 把那一行待确认删掉。 */
  onDismissCard(): void
  /** 「已取消」态上的「再来一次」。 */
  onRetry(): void
  /** 「已确认 · 11:24」里那个时刻怎么写 —— 面板给（`useFormatter` 在那一层）。 */
  formatTime(iso: string): string
  /**
   * 几格的**真值**（§5.2，宿主现算）。缺席 = 回落到 `request` 那份读数。
   */
  controls?: StudioOperatorGenerationControls
  /** 这一轮助手动过的那几颗、动之前是什么（「旧值 → 新值」的旧值）。 */
  origins?: StudioOperatorKnobOrigins
  canGenerate?: boolean
  canvasState?: CanvasNodeGenerationState | null
  /**
   * 「先搜再画」—— 只读：开着就在摘要里写一格（开关在工作台上）。画布那一枪不走这里。
   */
  searchGrounding?: StudioOperatorSearchGroundingControl
  /**
   * 首页那份小配方（第 9g 步）：没开台时提示词与参考图只读摆出来，外加「去图片台接着改」；
   * 型号没配 key 时按「确认」先就地配。缺席 = 台开着。
   */
  draft?: StudioOperatorGenerationDraft
}

type KnobSpec = StudioOperatorKnobSpec

/**
 * 生成那一支的一行摘要 —— 三态（确认中 / 已确认 / 已取消）都写它。
 * `lead` 是张数（工作台）或那张画布卡的名字（`canvas_generate`）。
 */
function generateSummary(lead: string, modelLabel: string): string {
  return [lead, modelLabel].filter((value) => Boolean(value)).join(' · ')
}

export function StudioOperatorConfirmCard({
  confirm,
  canvasState,
  onApprove,
  onDecline,
  onConfirm,
  onCancel,
  onSaveCard,
  onDismissCard,
  onRetry,
  formatTime,
  controls,
  origins = {},
  canGenerate = true,
  searchGrounding,
  draft,
}: StudioOperatorConfirmCardProps) {
  const t = useTranslations('StudioOperator')
  const tSearch = useTranslations('SearchGrounding')
  /** 卡的档名（角色 / 风格 / 品牌）与编辑器共用一份词表，⛔ 不抄第二份。 */
  const tCards = useTranslations('ContextCards')
  /** 模型显示名与模型选择器同一张词表（`Models.<key>.label`）。 */
  const tModels = useTranslations('Models')
  /** 首页那份配方的型号没配 key：按「出图」先弹这一窗（Hard Rule 8）。 */
  const [keySetupOpen, setKeySetupOpen] = useState(false)
  const decided =
    confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed ||
    confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled
  const busy = confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting
  /**
   * 待决 → 已确认 / 已取消（owner 2026-10-07 动效方向）：那一行「已确认 · 11:24」
   * 糊着进来，⛔ 不是整卡硬切。刷新后本来就定下的卡一挂上就是那一行，不播。
   */
  const decidedSwap = useBlurSwapIn(decided ? 'decided' : 'open')
  const kind: AssistantOperatorConfirmKind = confirm.kind

  const liveCanvasRequest =
    !decided && canvasState ? buildCanvasGenerationRequest(canvasState) : null
  const generate =
    confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate
      ? {
          ...confirm,
          request: liveCanvasRequest
            ? {
                ...liveCanvasRequest,
                // 卡名照服务端给的（剧本镜头卡写镜号 S04a，不是整段镜头描述）。
                canvasNode:
                  confirm.request.canvasNode ?? liveCanvasRequest.canvasNode,
              }
            : confirm.request,
        }
      : null
  /**
   * 提议记一张卡那一支（§8.1）—— 卡上摆的是草稿本身。
   * ⚠ 它没有旋钮、也没有步骤清单：下面那两处分支因此各自早退。
   */
  const contextCard =
    confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.contextCard
      ? confirm
      : null
  /**
   * 四颗旋钮摆什么。
   *
   * ⭐ 有 `controls` 时**一格都不读 `request`**：工作台是真值（§5.2 第一 / 第三行），
   * 读 `request` 等于读卡出现那一刻的快照 —— 用户之后在工作台上改的就看不见了。
   * ⚠ 没有 `controls`（LoRA 装配台）才回落到 `request` 那份只读读数。
   */
  const countLabel = (count: number) => t('confirm.generate.count', { count })
  /**
   * ⚠ 模型一律写**显示名**（D12 B5 / §5.1）：先按工作台的模型表翻；载荷里的
   * `label` 就是 id 时（画布快照只给 id）按模型选择器那张词表翻一次。
   */
  const modelLabel = generate
    ? (controls?.models.find((model) => model.id === generate.request.model.id)
        ?.label ??
      (generate.request.model.label === generate.request.model.id
        ? getTranslatedModelLabel(tModels, generate.request.model.id)
        : generate.request.model.label))
    : ''
  /**
   * 画布那一枪（`canvas_generate`）打在哪张卡上。⚠ 它不写「N 张」：那张卡可能是
   * 视频 / 音频，跑一次就是一次，卡名才是用户要核对的那件事。
   */
  const canvasNode = generate?.request.canvasNode
  /** 首页那份小配方只管工作台那一枪；画布那一枪是卡自己的参数。 */
  const homeDraft = generate && !canvasNode ? (draft ?? null) : null
  /** 工作台那一枪才有这一格；开着才写（开关在工作台上，卡上只读）。 */
  const searchOn = Boolean(
    generate && !canvasNode && searchGrounding?.available && searchGrounding.on,
  )
  /** 旧值的显示名：没设写「模型默认」，模型按工作台的模型表 / 词表翻，张数写「N 张」。 */
  const originLabel = (
    knob: StudioOperatorGenerateKnob,
    value: string | null,
  ) =>
    value === null
      ? t('confirm.generate.modelDefault')
      : knob === STUDIO_OPERATOR_GENERATE_KNOB_IDS.model
        ? (controls?.models.find((model) => model.id === value)?.label ??
          getTranslatedModelLabel(tModels, value))
        : knob === STUDIO_OPERATOR_GENERATE_KNOB_IDS.count
          ? countLabel(Number(value))
          : value
  /** 这一颗这一轮动过、且现值与动之前不一样：返回旧值的显示名；否则 `null`（只写现值）。 */
  const fromOf = (knob: KnobSpec): string | null => {
    if (!(knob.id in origins)) return null
    const origin = origins[knob.id] ?? null
    return origin === knob.current ? null : originLabel(knob.id, origin)
  }
  /**
   * ⚠ 读数空的也不画（2026-09-12 实测第 5 步）：该模型有清晰度档、而工作台那一格
   * 还没有值时，一颗什么都没写的旋钮比没有这颗旋钮更难读（判据在
   * `buildOperatorKnobSpecs`，规格行与这张卡共用）。
   */
  const knobs: readonly KnobSpec[] = !generate
    ? []
    : controls
      ? buildOperatorKnobSpecs(controls, countLabel)
      : (
          [
            {
              id: STUDIO_OPERATOR_GENERATE_KNOB_IDS.model,
              value: modelLabel,
              current: generate.request.model.id,
              options: [],
            },
            {
              id: STUDIO_OPERATOR_GENERATE_KNOB_IDS.aspect,
              value: generate.request.specs.aspectRatio ?? '',
              current: generate.request.specs.aspectRatio ?? '',
              options: [],
            },
            {
              id: STUDIO_OPERATOR_GENERATE_KNOB_IDS.count,
              value:
                canvasNode && canvasState?.kind !== 'image'
                  ? ''
                  : countLabel(generate.request.count),
              current: String(generate.request.count),
              options: [],
            },
            {
              id: STUDIO_OPERATOR_GENERATE_KNOB_IDS.resolution,
              value: generate.request.specs.resolution ?? '',
              current: generate.request.specs.resolution ?? '',
              options: [],
            },
          ] satisfies KnobSpec[]
        ).filter((knob) => Boolean(knob.value))

  const parameters = canvasState?.parameters
  const extraSpecs = parameters
    ? [
        ...(parameters.options.quality?.length
          ? [
              {
                label: t('confirm.generate.quality'),
                value:
                  parameters.values.quality ??
                  t('confirm.generate.modelDefault'),
              },
            ]
          : []),
        ...(parameters.options.resolution?.length &&
        !parameters.values.resolution
          ? [
              {
                label: t('confirm.generate.resolution'),
                value: t('confirm.generate.modelDefault'),
              },
            ]
          : []),
        ...(parameters.options.duration?.length
          ? [
              {
                label: t('confirm.generate.duration'),
                value: parameters.values.duration
                  ? t('confirm.generate.seconds', {
                      seconds: parameters.values.duration,
                    })
                  : t('confirm.generate.modelDefault'),
              },
            ]
          : []),
        ...(parameters.options.generateAudio?.length
          ? [
              {
                label: t('confirm.generate.audio'),
                value:
                  parameters.values.generateAudio === undefined
                    ? t('confirm.generate.modelDefault')
                    : t(
                        parameters.values.generateAudio
                          ? 'confirm.generate.enabled'
                          : 'confirm.generate.disabled',
                      ),
              },
            ]
          : []),
      ]
    : []

  return (
    <section
      data-testid="operator-confirm-card"
      data-kind={kind}
      data-status={confirm.status}
      aria-label={
        canvasNode
          ? t('confirm.generate.titleNode', { name: canvasNode.name })
          : confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate &&
              confirm.request.specs.durationSeconds !== null
            ? t('confirm.generate.titleVideo', {
                seconds: confirm.request.specs.durationSeconds,
              })
            : t(`confirm.${kind}.title`, {
                count:
                  confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep
                    ? confirm.steps.length
                    : confirm.kind ===
                        ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate
                      ? confirm.request.count
                      : 1,
                name: contextCard ? contextCard.card.name : '',
              })
      }
      /* D12 S6 / P6：定下来之后**不再是一张卡**，就地收成一行灰字
         「已确认 · 11:24」+ 淡一档的「1 张 · 模型」。待决时是白底块。
         ⚠ 对话框 B-C（owner 09-25）：卡在助手的灰框里，⛔ 不再带描边与投影
         （线和框层层套是「乱」的原因之一）。 */
      className={cn(decided ? 'min-w-0' : 'overflow-hidden rounded-xl bg-card')}
    >
      {/* ── 已确认 / 已取消：整卡收成一行「态 · 时间」+ 一句交代 ──────── */}
      {decided ? (
        <motion.p
          {...decidedSwap}
          className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-2xs"
        >
          <span
            data-testid="operator-confirm-state"
            className="shrink-0 text-muted-foreground"
          >
            {t(`confirm.state.${confirm.status}`, {
              time: confirm.decidedAt ? formatTime(confirm.decidedAt) : '',
            })}
          </span>
          <span className="min-w-0 truncate text-muted-foreground/70">
            {/* ⚠ 卡那一支写的是**卡名 + 存没存下**：状态那一格只说得出时刻。 */}
            ·{' '}
            {confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.contextCard
              ? `${confirm.card.name} · ${
                  confirm.status ===
                  STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed
                    ? t('confirm.contextCard.saved')
                    : t('confirm.contextCard.notSaved')
                }`
              : confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate
                ? generateSummary(
                    canvasNode
                      ? canvasNode.name
                      : confirm.request.specs.durationSeconds !== null
                        ? t('confirm.generate.countVideo', {
                            count: confirm.request.count,
                            seconds: confirm.request.specs.durationSeconds,
                          })
                        : t('confirm.generate.count', {
                            count: confirm.request.count,
                          }),
                    modelLabel,
                  ) +
                  (confirm.request.searchGrounding
                    ? ` · ${tSearch('confirmedSuffix')}`
                    : '')
                : t('confirm.multistep.title', {
                    count: confirm.steps.length,
                  })}
          </span>
          {/* 「再来一次」只长在**生成 · 已取消**那一格上。 */}
          {confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate &&
          confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled ? (
            <button
              type="button"
              data-testid="operator-confirm-retry"
              onClick={onRetry}
              className="shrink-0 rounded-sm text-foreground/80 transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              · {t('confirm.generate.retry')}
            </button>
          ) : null}
        </motion.p>
      ) : (
        <>
          <div className="border-b border-border px-3 py-2">
            <p
              data-testid="operator-confirm-title"
              className="text-md font-semibold text-foreground"
            >
              {confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep
                ? t('confirm.multistep.title', { count: confirm.steps.length })
                : confirm.kind ===
                    ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.contextCard
                  ? t('confirm.contextCard.title')
                  : canvasNode
                    ? t('confirm.generate.titleNode', { name: canvasNode.name })
                    : confirm.request.specs.durationSeconds !== null
                      ? // 视频恒单条：说「这段 N 秒视频」，⛔ 不说「1 张」。
                        t('confirm.generate.titleVideo', {
                          seconds: confirm.request.specs.durationSeconds,
                        })
                      : t('confirm.generate.title', {
                          count: confirm.request.count,
                        })}
            </p>
          </div>

          {contextCard ? (
            /* ⭐ 卡的**预览**（§8.1 「客户端」那一行）：档 + 名字 + 一句话摘要
               + 正文。⚠ 正文截几行就够 —— 这张卡是让用户认出「说的是这件事」，
               ⛔ 不是编辑器（要改字去设置里那张卡上改）。 */
            <div
              data-testid="operator-confirm-context-card"
              data-card-kind={contextCard.card.kind}
              className="flex flex-col gap-1 px-3 py-2"
            >
              <p className="flex items-baseline gap-1.5">
                <span className="shrink-0 text-2xs uppercase tracking-nav text-muted-foreground">
                  {tCards(`kind.${contextCard.card.kind}`)}
                </span>
                <span className="min-w-0 flex-1 truncate text-md font-semibold text-foreground">
                  {contextCard.card.name}
                </span>
              </p>
              {contextCard.card.summary ? (
                <p className="text-2sm text-muted-foreground">
                  {contextCard.card.summary}
                </p>
              ) : null}
              {contextCard.card.body ? (
                <p className="line-clamp-4 whitespace-pre-wrap text-2sm leading-relaxed text-muted-foreground">
                  {contextCard.card.body}
                </p>
              ) : null}
              {contextCard.card.negative ? (
                <p className="truncate text-2xs text-muted-foreground">
                  {t('confirm.contextCard.negative', {
                    value: contextCard.card.negative,
                  })}
                </p>
              ) : null}
            </div>
          ) : confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep ? (
            /* ⭐ 多步摆的是**一行动作串**而不是一张清单（画板「多步」那一态）：
               这张卡要回答的只有「一共几步、大致做什么」，摊开的清单会让用户以为
               每一步都要他确认一遍。 */
            <p
              data-testid="operator-confirm-steps"
              className="px-3 py-2 text-2sm leading-relaxed text-muted-foreground"
            >
              {confirm.steps.map((step) => step.label).join(' · ')}
              {t('confirm.multistep.stoppable')}
            </p>
          ) : (
            /* ⭐ 只读摘要（owner 11-18）：一行一格「名 · 旧值 → 新值」，这一轮没动过的只写现值。
               ⛔ 不摆下拉 / 输入框 —— 要改去工作台上改，或者跟她说。 */
            <div className="flex flex-col gap-1 px-3 py-2">
              {homeDraft ? (
                <div
                  data-testid="operator-confirm-draft"
                  className="mb-1 flex flex-col gap-1.5"
                >
                  <p
                    data-testid="operator-confirm-draft-prompt"
                    aria-label={t('confirm.generate.prompt')}
                    className="line-clamp-4 whitespace-pre-wrap text-2sm leading-relaxed text-foreground"
                  >
                    {homeDraft.prompt}
                  </p>
                  {homeDraft.references.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {homeDraft.references.map((reference) => (
                        <div
                          key={reference.url}
                          data-testid="operator-confirm-draft-reference"
                          className="relative size-12 overflow-hidden rounded-md border border-border bg-muted"
                        >
                          <Image
                            src={reference.url}
                            alt={reference.name ?? ''}
                            fill
                            sizes="48px"
                            unoptimized
                            className="object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div
                data-testid="operator-confirm-knobs"
                className="flex flex-wrap gap-1.5"
              >
                {knobs.map((knob) => {
                  const label = t(
                    `confirm.generate.${
                      knob.id === STUDIO_OPERATOR_GENERATE_KNOB_IDS.count
                        ? 'countLabel'
                        : knob.id
                    }`,
                  )
                  const from = fromOf(knob)
                  return (
                    <div
                      key={knob.id}
                      data-testid="operator-confirm-knob"
                      data-knob={knob.id}
                      data-changed={from !== null || undefined}
                      className="flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 text-2sm"
                    >
                      <span className="shrink-0 text-muted-foreground">
                        {label}
                      </span>
                      {from !== null ? (
                        <>
                          <span
                            data-testid="operator-confirm-knob-from"
                            className="max-w-40 truncate text-muted-foreground"
                          >
                            {from}
                          </span>
                          <ArrowRight
                            className="size-3 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                        </>
                      ) : null}
                      {/* 工作台那一格变了（创作者或她改的）：值糊着换。 */}
                      <BlurSwap
                        swapKey={knob.value}
                        className="max-w-40 truncate text-foreground"
                      >
                        {knob.value}
                      </BlurSwap>
                    </div>
                  )
                })}
                {extraSpecs.map((spec) => (
                  <div
                    key={spec.label}
                    data-testid="operator-confirm-parameter"
                    className="flex items-center gap-1 rounded-md border border-border bg-muted px-2.5 py-1 text-2sm"
                  >
                    <span className="text-muted-foreground">{spec.label}</span>
                    <span className="text-foreground">{spec.value}</span>
                  </div>
                ))}
                {/* 「先搜再画」开着：只读写一格（开关在工作台上）。 */}
                {searchOn ? (
                  <div
                    data-testid="operator-confirm-search-grounding"
                    className="flex items-center rounded-md border border-border bg-muted px-2.5 py-1 text-2sm text-foreground"
                  >
                    {tSearch('toggle')}
                  </div>
                ) : null}
              </div>
              {canvasState !== undefined && !canvasState?.model ? (
                <p className="text-2xs text-muted-foreground">
                  {t('confirm.generate.nodeUnavailable')}
                </p>
              ) : null}
            </div>
          )}

          <div className="flex items-center gap-2 px-3 pb-3 pt-1">
            <button
              type="button"
              data-testid="operator-confirm-primary"
              disabled={
                busy ||
                (generate !== null && !canGenerate) ||
                (canvasState !== undefined && !canvasState?.model)
              }
              aria-busy={busy}
              onClick={
                contextCard
                  ? onSaveCard
                  : confirm.kind ===
                      ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep
                    ? onApprove
                    : homeDraft?.keySetup
                      ? () => setKeySetupOpen(true)
                      : onConfirm
              }
              className="flex h-8 items-center rounded-md bg-foreground px-4 text-2sm font-semibold text-background transition-[background-color,transform] duration-fast ease-standard hover:bg-foreground/90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
            >
              {/* ⚠ 「确认中」是**按钮上的字**而不是另起一行（画板「确认中」那一
                  态）：那一刻用户的眼睛就在这颗按钮上，写在别处等于没写。 */}
              {/* 按下去那一刻（owner 2026-10-07）：同一颗键里换成转圈 +「确认中」，
                  糊着换过去，⛔ 不另起一行。 */}
              <BlurSwap swapKey={busy ? 'busy' : 'idle'} className="gap-1.5">
                {busy ? (
                  <>
                    <Spinner size="sm" className="text-background" />
                    {t('confirm.state.submitting')}
                  </>
                ) : contextCard ? (
                  t('confirm.contextCard.save')
                ) : confirm.kind ===
                  ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep ? (
                  t('confirm.multistep.start')
                ) : (
                  t('confirm.generate.confirm')
                )}
              </BlurSwap>
            </button>
            <button
              type="button"
              data-testid="operator-confirm-secondary"
              disabled={busy}
              onClick={
                contextCard
                  ? onDismissCard
                  : confirm.kind ===
                      ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep
                    ? onDecline
                    : onCancel
              }
              className="flex h-8 items-center rounded-md border border-border bg-card px-4 text-2sm text-muted-foreground transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
            >
              {contextCard
                ? t('confirm.contextCard.dismiss')
                : confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep
                  ? t('confirm.multistep.stepByStep')
                  : t('confirm.generate.cancel')}
            </button>
            {homeDraft ? (
              <button
                type="button"
                data-testid="operator-confirm-open-bench"
                disabled={busy}
                onClick={homeDraft.openBench}
                className="ml-auto flex h-8 items-center rounded-md px-2 text-2sm text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
              >
                {t('confirm.generate.openBench')}
              </button>
            ) : null}
          </div>
          {homeDraft?.keySetup ? (
            <QuickSetupDialog
              open={keySetupOpen}
              onOpenChange={setKeySetupOpen}
              modelId={homeDraft.keySetup.modelId}
              modelLabel={homeDraft.keySetup.modelLabel}
              adapterType={homeDraft.keySetup.adapterType}
              optionId={homeDraft.keySetup.optionId}
              // 卡在首页那份表单外面：选中由配方自己落（配好的那把 key），再扣扳机。
              selectStudioModel={false}
              onVerified={(_modelId, keyId) => {
                homeDraft.keySetup?.onVerified(keyId)
                setKeySetupOpen(false)
                onConfirm()
              }}
            />
          ) : null}
        </>
      )}
    </section>
  )
}
