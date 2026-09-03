'use client'

/**
 * 一条日志（拍板 18）。
 *
 * 三件事长在这一颗上：**点开详情**（查询词 / 命中数 / 候选与放弃理由）、
 * **hover 撤销**（划线 + 线程插系统行由调用方做）、以及 `prime_generate` 的
 * **钱色**——整条日志里唯一花钱相关的条目，钱是唯一硬闸（拍板 2）。
 *
 * ⚠ 被拒的那一支（`status: 'error'`）**照样渲染**，不是静默丢掉：模型编了个不
 * 存在的模型 id 时，用户该看到「这个模型不在你能选的表里」，而不是助手默默什么
 * 都没做。它没有 payload / inverse，所以也没有撤销按钮。
 */

import { memo, useState } from 'react'
import {
  Ban,
  Blocks,
  Check,
  CircleDollarSign,
  Eye,
  FolderSearch,
  Globe,
  ImagePlus,
  Layers,
  Link2,
  Music2,
  Pencil,
  RectangleHorizontal,
  ScanEye,
  Search,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Unplug,
  Volume2,
  type LucideIcon,
} from 'lucide-react'
import Image from 'next/image'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import {
  ASSISTANT_OPERATOR_READ_TOOLS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  type AssistantOperatorTool,
} from '@/constants/assistant-operator'
import {
  STUDIO_OPERATOR_REFERENCE_STAGGER_SECONDS,
  STUDIO_OPERATOR_WEB_CANDIDATE_PIXELS,
} from '@/constants/studio-assistant-operator'
import { openOperatorLightbox } from '@/components/business/studio/assistant-operator/StudioOperatorLightbox'
import { Spinner } from '@/components/ui/spinner'
import { describeOperatorStepDetail } from '@/lib/studio-operator-history'
import { cn } from '@/lib/utils'
import type {
  AssistantOperatorStep,
  AssistantOperatorWebImage,
} from '@/types/assistant-operator'
import type {
  StudioOperatorWebImportPick,
  StudioOperatorWebImportState,
} from '@/hooks/use-studio-operator-web-import'

/** 一张都没选时共用这一份，⛔ 别写成行内 `[]`（每次 render 换引用）。 */
const NO_PICKS: readonly StudioOperatorWebImportPick[] = []

/**
 * ⚠ `Record<Tool, …>`：工具表加一条而图标没跟上，编译期就红。
 *
 * ⚠ 导出是给**历史条**用的（P4-B）：刷新之后那些只读日志得长同一张脸，
 * 而抄一份图标表就是「同一步在历史里换了个图标」这种没人会去查的不一致。
 */
export const OPERATOR_TOOL_ICONS: Record<AssistantOperatorTool, LucideIcon> = {
  [ASSISTANT_OPERATOR_TOOL_IDS.readState]: Eye,
  [ASSISTANT_OPERATOR_TOOL_IDS.searchAssets]: Search,
  [ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders]: FolderSearch,
  [ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder]: ScanEye,
  [ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages]: Globe,
  [ASSISTANT_OPERATOR_TOOL_IDS.mountReference]: ImagePlus,
  [ASSISTANT_OPERATOR_TOOL_IDS.setModel]: Sparkles,
  [ASSISTANT_OPERATOR_TOOL_IDS.setPrompt]: Pencil,
  [ASSISTANT_OPERATOR_TOOL_IDS.setNegative]: Ban,
  [ASSISTANT_OPERATOR_TOOL_IDS.setSpecs]: RectangleHorizontal,
  /** 视频规格与图片规格是同一件事的两个形状 —— 同一枚图标，日志流里读起来才连贯。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs]: RectangleHorizontal,
  [ASSISTANT_OPERATOR_TOOL_IDS.setCount]: Layers,
  /** 挂音色 —— 与 🖼 参考图分开：两个槽，用户一眼要看得出这一条动的是声音。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference]: Music2,
  [ASSISTANT_OPERATOR_TOOL_IDS.setSound]: Volume2,
  [ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate]: CircleDollarSign,
  /**
   * ⚠ 看图那一条**正常不会走到这颗组件**：面板把它渲染成评价卡（拍板 6）。
   * 这里仍要有一枚图标 —— 被拒的那一支（没有结果可看 / 借不到视觉线）走的是
   * 普通日志条，它照样要有脸。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult]: ScanEye,
  /** 用户递来的链接（拍板 22）—— 与联网搜图的 🌐 分开：那是「我去找」，这是「你给我」。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl]: Link2,
  /**
   * LoRA 那四条（P4-C）。
   * ⚠ 找 LoRA 与 `search_assets` **共用 🔍**：两条都是「去找东西」，日志流里
   * 一眼扫过去该是同一族；区别写在标题与详情里（一条说库、一条说 Civitai/HF）。
   * ⚠ 挂 / 摘用**一对方向相反**的图标，⛔ 不共用一枚：撤销之后线程里会同时出现
   * 这两条，长一样就分不出哪条是哪条。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.searchLoras]: Search,
  [ASSISTANT_OPERATOR_TOOL_IDS.mountLora]: Blocks,
  [ASSISTANT_OPERATOR_TOOL_IDS.unmountLora]: Unplug,
  [ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight]: SlidersHorizontal,
}

interface StudioOperatorLogItemProps {
  /**
   * ⚠ 撤销认的是**线程里这一条的 id**，不是 `step.id` —— 服务端每轮从
   * `step-1` 重新编号，两者只在第一轮碰巧相等（见 `operatorStepEntryId`）。
   */
  entryId: string
  step: AssistantOperatorStep
  undone: boolean
  onUndo(entryId: string): void
  /**
   * 这一条日志上的联网候选选用态（P3-B / 拍板 21）。`undefined` = 一张都还没选。
   *
   * ⚠ 写成**必填但可为 undefined**，不是 `?:` —— 台账：可选 prop 漏传 = 编译器
   * 不报、全量测试全过、功能全失效。宿主必须显式写出这个键。
   */
  webImport: StudioOperatorWebImportState | undefined
  /** 一行最多能选几张（工作台参考位上限）—— 「已选 n/m」里的 m。 */
  webImportLimit: number
  /** 点「选用」—— 导入并挂上 / 取消选用（拍板 21）。⛔ 点缩略图不走这条。 */
  onToggleWebImage(entryId: string, image: AssistantOperatorWebImage): void
}

export const StudioOperatorLogItem = memo(function StudioOperatorLogItem({
  entryId,
  step,
  undone,
  onUndo,
  webImport,
  webImportLimit,
  onToggleWebImage,
}: StudioOperatorLogItemProps) {
  const t = useTranslations('StudioOperator')
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)

  const Icon = OPERATOR_TOOL_ICONS[step.tool]
  const isRunning = step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.running
  const isRejected = step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.error
  const isMoney =
    step.tool === ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate && !isRejected
  // 撤销只对**落地了的改动**开放：读类没有东西可撤，被拒的什么都没应用。
  // ⚠ 判据取**词表**不是手列三条：加一条读工具而这里没跟上，表现是那条日志上
  //    多出一个撤不掉任何东西的「撤销」（`search_web_images` 就是新加的那条）。
  const canUndo =
    !undone &&
    step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done &&
    !(ASSISTANT_OPERATOR_READ_TOOLS as readonly string[]).includes(step.tool)

  /**
   * 详情文本。
   *
   * ⚠ 实现搬去了 `lib/studio-operator-history.ts`：**落库的历史条目要用同一份
   * 摘要**（P4-B）。抄成两份的下场是刷新前后同一步的详情不一样 —— 而那种不一致
   * 没有任何人会去查。
   */
  const detail =
    !isRejected && step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done
      ? describeOperatorStepDetail(step)
      : null

  // 联网候选行的三个派生量（拍板 21）。⚠ 空数组常量化，免得每次 render 换引用。
  const picks = webImport?.picks ?? NO_PICKS
  const failedPicks = picks.filter((pick) => pick.status === 'error')
  const usedCount = picks.length - failedPicks.length

  return (
    <div
      data-testid="operator-log-item"
      data-tool={step.tool}
      data-status={step.status}
      data-undone={undone ? 'true' : 'false'}
      className={cn(
        'group relative rounded-xl border border-border/70 bg-background px-2.5 py-2 text-xs transition-colors duration-fast ease-standard',
        isRunning && 'border-primary/40 bg-primary/5',
        isMoney && 'border-status-warning/40 bg-status-warning-surface',
        isRejected && 'border-destructive/40 bg-destructive/5',
        undone && 'opacity-55',
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border border-primary/30 bg-primary/10 text-primary',
            isMoney &&
              'border-status-warning/40 bg-status-warning-surface text-status-warning',
            isRejected &&
              'border-destructive/40 bg-destructive/10 text-destructive',
          )}
        >
          <Icon className="size-3" aria-hidden />
        </span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          <span
            data-testid="operator-log-title"
            className={cn(
              'block font-medium text-foreground',
              isMoney && 'text-status-warning',
              undone && 'line-through',
            )}
          >
            {step.title}
          </span>
          {step.reason ? (
            <span className="mt-0.5 block text-2xs text-muted-foreground">
              {step.reason}
            </span>
          ) : null}
          {isRejected ? (
            <span className="mt-0.5 block text-2xs text-destructive">
              {t(`reject.${step.error.reason}`)}
            </span>
          ) : null}
        </button>
        {canUndo ? (
          <button
            type="button"
            data-testid="operator-log-undo"
            onClick={() => onUndo(entryId)}
            className="shrink-0 rounded-md px-1.5 py-0.5 text-2xs text-muted-foreground opacity-0 transition-opacity duration-fast ease-standard hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          >
            {t('log.undo')}
          </button>
        ) : null}
      </div>

      {/* 挂上去的那张参考图 —— 挂载弹入 + hover 浮起 + 点击灯箱（拍板 17）。 */}
      {step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done &&
      step.tool === ASSISTANT_OPERATOR_TOOL_IDS.mountReference ? (
        <motion.button
          type="button"
          data-testid="operator-log-reference"
          onClick={() => openOperatorLightbox(step.payload.url, step.title)}
          initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.88 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          whileHover={reduceMotion ? undefined : { y: -3, scale: 1.045 }}
          transition={{
            duration: reduceMotion ? 0 : 0.42,
            delay: reduceMotion ? 0 : STUDIO_OPERATOR_REFERENCE_STAGGER_SECONDS,
            ease: [0.2, 0.9, 0.3, 1.25],
          }}
          className="mt-2 block w-16 cursor-zoom-in overflow-hidden rounded-lg border border-primary/30"
        >
          <Image
            src={step.payload.thumbnailUrl ?? step.payload.url}
            alt={step.title}
            width={128}
            height={170}
            className="aspect-[3/4] h-auto w-full object-cover"
          />
        </motion.button>
      ) : null}

      {/* 文件夹视觉检查的证据格：只画这次真正送进视觉模型的素材。
          结果里的 inspectedImages / totalImages 负责说明覆盖率，格子负责让用户
          复核「助手究竟看了哪几张」；截断时绝不拿未检查素材来凑数。 */}
      {step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done &&
      step.tool === ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder &&
      step.result &&
      step.result.findings.length > 0 ? (
        <div
          className="mt-2 flex flex-wrap gap-1.5"
          data-testid="operator-folder-vision-evidence"
        >
          {step.result.findings.map((finding) => (
            <button
              key={finding.assetId}
              type="button"
              data-testid="operator-folder-vision-image"
              onClick={() =>
                openOperatorLightbox(finding.url, finding.observation)
              }
              title={finding.observation}
              aria-label={finding.observation}
              className="size-14 cursor-zoom-in overflow-hidden rounded-lg border border-border/70 bg-muted transition-colors duration-fast ease-standard hover:border-primary/50"
            >
              <Image
                src={finding.thumbnailUrl ?? finding.url}
                alt={finding.observation}
                width={112}
                height={112}
                className="size-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}

      {/* 联网候选（拍板 21）—— **看与选是两件事**：
          · 点缩略图 = 灯箱看大图，零网络零入库；
          · 点「选用」= 才导入进素材库并挂上（取消选用会把它一并清掉）。
          🔬 owner 2026-08-31 真机打回的就是这两件事合成一个手势：浏览即采购。 */}
      {step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done &&
      step.tool === ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages &&
      step.result &&
      step.result.images.length > 0 ? (
        <div className="mt-2" data-testid="operator-web-candidates">
          <p className="mb-1 text-2xs text-muted-foreground">
            {t('web.candidates')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {step.result.images.map((image) => {
              const pick = picks.find(
                (item) => item.imageUrl === image.imageUrl,
              )
              const importing = pick?.status === 'importing'
              const failed = pick?.status === 'error'
              const imported = pick?.status === 'imported'
              // ⚠ 每格算自己的态：一行里可以同时有「已选用」「在飞」「取不到」
              //    三种格子，把整行的状态印到每一格会让没出事的那些也标红。
              const tileState = importing
                ? 'importing'
                : failed
                  ? 'error'
                  : imported
                    ? 'imported'
                    : 'idle'
              const caption =
                image.title ?? image.domain ?? (image.pageUrl || image.imageUrl)
              return (
                <div
                  key={image.imageUrl}
                  className="flex w-14 shrink-0 flex-col gap-1"
                >
                  {/* 看 —— ⛔ 这一颗不发任何网络请求，它只开灯箱。
                      ⚠ 灯箱吃的是**原图直链**（看大图的意义就在这儿）；缩略图
                        只画在格子里。取不到的那三成会在灯箱里显形，而那正是
                        用户在按「选用」之前该知道的事。 */}
                  <button
                    type="button"
                    data-testid="operator-web-candidate"
                    data-selected={pick ? 'true' : 'false'}
                    data-state={tileState}
                    onClick={() =>
                      openOperatorLightbox(image.imageUrl, caption)
                    }
                    title={caption}
                    aria-label={t('web.viewLarge')}
                    className={cn(
                      'relative size-14 cursor-zoom-in overflow-hidden rounded-lg border border-border/70 bg-muted transition-colors duration-fast ease-standard hover:border-primary/50',
                      imported && 'border-primary ring-1 ring-primary',
                      failed && 'border-destructive ring-1 ring-destructive',
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- 任意第三方图床，进不了 next.config 的 remotePatterns 白名单；而且画的是 gstatic 缩略图（原图直链约三成 403）。 */}
                    <img
                      src={image.thumbnailUrl ?? image.imageUrl}
                      alt={image.title ?? image.domain ?? ''}
                      width={STUDIO_OPERATOR_WEB_CANDIDATE_PIXELS}
                      height={STUDIO_OPERATOR_WEB_CANDIDATE_PIXELS}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                    {importing ? (
                      <span className="absolute inset-0 grid place-items-center bg-background/70">
                        <Spinner className="size-4 text-primary" />
                      </span>
                    ) : null}
                    {imported ? (
                      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-primary/90 py-px text-3xs text-primary-foreground">
                        <Check className="size-2.5" aria-hidden />
                        {t('web.imported')}
                      </span>
                    ) : null}
                    {/* ⚠ 失败角标底色用 `bg-background` 而不是实心 destructive：
                        本仓没有 `--color-destructive-foreground` 这枚 token，实心
                        红上没有配得上的字色（暗档会变成深红压深底）。 */}
                    {failed ? (
                      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-background/90 py-px text-3xs text-destructive">
                        <TriangleAlert className="size-2.5" aria-hidden />
                        {t('web.importFailedShort')}
                      </span>
                    ) : null}
                  </button>
                  {/* 选 —— 这一颗才花钱（花的是存储与一次下载）。 */}
                  <button
                    type="button"
                    data-testid="operator-web-candidate-use"
                    data-state={tileState}
                    aria-pressed={imported}
                    onClick={() => onToggleWebImage(entryId, image)}
                    className={cn(
                      'rounded-md border px-1 py-0.5 text-3xs transition-colors duration-fast ease-standard',
                      imported
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border/70 text-muted-foreground hover:border-primary/50 hover:text-primary',
                      failed && 'border-destructive/50 text-destructive',
                    )}
                  >
                    {imported
                      ? t('web.used')
                      : failed
                        ? t('web.retry')
                        : t('web.use')}
                  </button>
                </div>
              )
            })}
          </div>
          {/* ⛔ 失败不静默：每一条原因都写出来 —— 「我点了但什么都没发生」
              是本仓最难查的那一类。 */}
          {failedPicks.length > 0 ? (
            <p
              data-testid="operator-web-import-error"
              className="mt-1 text-2xs text-destructive"
            >
              {failedPicks[0]?.error ?? t('web.importFailed')}
            </p>
          ) : null}
          {webImport?.cleanupError ? (
            <p
              data-testid="operator-web-cleanup-error"
              className="mt-1 text-2xs text-destructive"
            >
              {webImport.cleanupError}
            </p>
          ) : null}
          <p className="mt-1 text-2xs text-muted-foreground">
            {usedCount > 0
              ? t('web.selectedHint', {
                  count: usedCount,
                  limit: webImportLimit,
                })
              : t('web.pickHint')}
          </p>
        </div>
      ) : null}

      {open && detail ? (
        <p
          data-testid="operator-log-detail"
          className="mt-2 whitespace-pre-wrap border-t border-dashed border-border/70 pt-2 text-2xs text-muted-foreground"
        >
          {detail}
        </p>
      ) : null}
    </div>
  )
})
