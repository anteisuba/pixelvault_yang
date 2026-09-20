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
  BookmarkPlus,
  BookUser,
  CircleDollarSign,
  Eye,
  FolderInput,
  FolderPlus,
  FolderSearch,
  Globe,
  ImageOff,
  ImagePlus,
  IdCard,
  Layers,
  BookOpen,
  Library,
  Link2,
  ListChecks,
  Music2,
  NotebookPen,
  Pencil,
  Play,
  RectangleHorizontal,
  RefreshCw,
  ScanEye,
  ScrollText,
  Search,
  ScanText,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tags,
  TextSearch,
  CheckCheck,
  Unplug,
  Volume2,
  Waypoints,
  type LucideIcon,
} from '@/components/icons'
import Image from 'next/image'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import {
  isRevertibleAssistantOperatorTool,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  type AssistantOperatorTool,
} from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_REFERENCE_STAGGER_SECONDS } from '@/constants/studio-assistant-operator'
import { openOperatorLightbox } from '@/components/business/studio/assistant-operator/StudioOperatorLightbox'
import { StudioOperatorWebCandidateGrid } from '@/components/business/studio/assistant-operator/StudioOperatorWebCandidateGrid'
import { describeOperatorStepDetail } from '@/lib/studio-operator-history'
import { cn } from '@/lib/utils'
import type {
  AssistantOperatorStep,
  AssistantOperatorWebImage,
} from '@/types/assistant-operator'
import type { StudioOperatorWebImportState } from '@/hooks/use-studio-operator-web-import'

/**
 * ⚠ `Record<Tool, …>`：工具表加一条而图标没跟上，编译期就红。
 *
 * ⚠ 导出是给**历史条**用的（P4-B）：刷新之后那些只读日志得长同一张脸，
 * 而抄一份图标表就是「同一步在历史里换了个图标」这种没人会去查的不一致。
 */
export const OPERATOR_TOOL_ICONS: Record<AssistantOperatorTool, LucideIcon> = {
  [ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences]: ScanEye,
  [ASSISTANT_OPERATOR_TOOL_IDS.readState]: Eye,
  [ASSISTANT_OPERATOR_TOOL_IDS.searchAssets]: Search,
  [ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders]: FolderSearch,
  [ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder]: ScanEye,
  [ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages]: Globe,
  /**
   * 联网查文字（切片 3b）—— 与搜图的 🌐 **分开**：日志流里这两条常常前后脚出现
   * （先查一句设定，再去找参考图），长一样就分不出哪条是哪条（同挂/摘 LoRA 那一对）。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.searchWeb]: TextSearch,
  /**
   * 有目标的检索（2026-09-06）—— 与 `search_web` 的 🔤 **分开**：日志流里这两条
   * 常常前后脚出现（先查一句拼写、再去弄清整件事），长一样就分不出哪条是哪条
   * （同挂/摘 LoRA 那一对）。📚 的意思是「翻了好几个来源」。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.research]: Library,
  /** 读正文 —— 「把那一页看完了」，与「去搜」是两个动作，两枚图标。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.readUrl]: ScanText,
  /**
   * 翻证据本（§7.3）—— 与 📚 `research` **分开**：那条是「去外面查了一圈」，
   * 这条是「翻回自己记过的那一条」。日志流里两者常前后脚出现。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.recallEvidence]: BookOpen,
  [ASSISTANT_OPERATOR_TOOL_IDS.mountReference]: ImagePlus,
  /** 摘一张（进度表 21）—— 与挂载那颗成对，日志流里一眼分得出方向。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.unmountReference]: ImageOff,
  [ASSISTANT_OPERATOR_TOOL_IDS.setModel]: Sparkles,
  [ASSISTANT_OPERATOR_TOOL_IDS.setPrompt]: Pencil,
  [ASSISTANT_OPERATOR_TOOL_IDS.setNegative]: Ban,
  [ASSISTANT_OPERATOR_TOOL_IDS.setSpecs]: RectangleHorizontal,
  [ASSISTANT_OPERATOR_TOOL_IDS.setLoraParameters]: RectangleHorizontal,
  /** 视频规格与图片规格是同一件事的两个形状 —— 同一枚图标，日志流里读起来才连贯。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs]: RectangleHorizontal,
  [ASSISTANT_OPERATOR_TOOL_IDS.setCount]: Layers,
  /**
   * 专属 chip（进度表 21）—— 借 `set_lora_weight` 那颗滑杆图标：两条在日志流里
   * 不会同屏（一条住工作台、一条住装配台），而「拧了一颗旋钮」本来就是同一件事。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.setCapability]: SlidersHorizontal,
  /** 挂音色 —— 与 🖼 参考图分开：两个槽，用户一眼要看得出这一条动的是声音。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference]: Music2,
  [ASSISTANT_OPERATOR_TOOL_IDS.setSound]: Volume2,
  [ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate]: CircleDollarSign,
  /**
   * 请求发送（§6 花钱档）—— 与 `prime_generate` **共用 💲**：两条说的是同一件事
   * 的两个力度（备着 / 请你按），日志流里该是同一族。区别写在标题与那张硬确认卡上。
   * ⚠ 这一条正常也不会走到这颗组件：面板把它渲染成硬确认卡 / 结果卡（第 3 轮接线）。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration]: CircleDollarSign,
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
  /**
   * 摆一张 LoRA 推荐卡（lora-assistant §10.2.2）—— 「这几把你要哪几把」，
   * 所以是一张勾选清单。⚠ 与上面的搜索放一对：日志流里这两条前后脚出现。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.planLoraPick]: ListChecks,
  [ASSISTANT_OPERATOR_TOOL_IDS.mountLora]: Blocks,
  [ASSISTANT_OPERATOR_TOOL_IDS.unmountLora]: Unplug,
  [ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight]: SlidersHorizontal,
  /**
   * 规则两条（§10）。⚠ 读与记**不共用一枚**：日志流里这两条常常前后脚出现
   * （先翻一遍旧规则，再记下新的一条），长一样就分不出哪条是哪条 ——
   * 与上面挂/摘 LoRA 那一对同一条论据。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.readProjectRules]: ScrollText,
  [ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule]: NotebookPen,
  /**
   * 上下文卡两条（K1）。⚠ 与规则那一对同一条论据：翻卡与读全文在日志流里常常
   * 前后脚出现，长一样就分不出哪条是哪条。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.listContextCards]: BookUser,
  [ASSISTANT_OPERATOR_TOOL_IDS.readContextCard]: IdCard,
  /** 提议一张卡（§8.1）—— 「要不要把这个记下来」，所以是一颗书签。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.proposeContextCard]: BookmarkPlus,
  /**
   * 标审核态（切片 Y）—— ✓/✕ 的那一枚。
   * ⚠ 用 `CheckCheck` 而不是 `Check`：单钩在日志流里与「这一步完成了」那个状态
   * 记号长得一样，而这一条说的是「它替你把那张标了」——两件事。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.setReviewState]: CheckCheck,
  /**
   * 素材库四条（§10）。⚠ 四枚**各不相同**，与上面挂/摘 LoRA 那一对同一条论据：
   * 这四条在日志流里常常一串出现（建个夹子 → 挪进去 → 打标签 → 收藏），
   * 长一样就分不出哪条是哪条。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.tagAsset]: Tags,
  [ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset]: Star,
  [ASSISTANT_OPERATOR_TOOL_IDS.createFolder]: FolderPlus,
  [ASSISTANT_OPERATOR_TOOL_IDS.moveAssets]: FolderInput,
  /**
   * 画布三条（进度表 22）。⚠ 三个图标**互不相同**：日志流里它们常常前后脚出现
   * （改一格 → 算下游 → 跑一枪），长一样就分不出哪条是哪条。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.canvasApply]: Waypoints,
  [ASSISTANT_OPERATOR_TOOL_IDS.canvasPlanRerun]: RefreshCw,
  [ASSISTANT_OPERATOR_TOOL_IDS.canvasGenerate]: Play,
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
  /**
   * 这一条要不要**自己画候选网格**（2026-09-07 真机）。
   *
   * 🔬 根因：调查卡把同一轮的 `search_web_images` 候选画在卡面上，**同时**把这几条
   * 日志原样塞进卡底那段「过程」——而日志条自己也画一份网格。`<details>` 收着时
   * DOM 里照样有，于是 `[data-testid=operator-web-candidate]` 数出 16 个而唯一候选
   * 只有 8 个，两份还共用同一个 `entryId`（选中态完全镜像）。
   *
   * ⚠ 写成**必填**而不是带默认值：默认值等于「谁忘了传谁就多画一份」，而这正是
   * 出过事的那条路。⛔ 也不在这颗组件里去猜「我是不是长在卡里」——那是宿主的知识。
   */
  renderWebCandidates: boolean
}

export const StudioOperatorLogItem = memo(function StudioOperatorLogItem({
  entryId,
  step,
  undone,
  onUndo,
  webImport,
  webImportLimit,
  onToggleWebImage,
  renderWebCandidates,
}: StudioOperatorLogItemProps) {
  const t = useTranslations('StudioOperator')
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)

  const Icon = OPERATOR_TOOL_ICONS[step.tool]
  const isRunning = step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.running
  const isRejected = step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.error
  const isMoney =
    step.tool === ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate && !isRejected
  // 撤销只对**落地了的改动**开放：被拒的那一步什么都没应用。
  // ⚠ 判据是 `isRevertibleAssistantOperatorTool`（切片 3a 换的），⛔ 不再是
  //    「不是读类」：`request_generation` 两者都不是 —— 它不读，也没有 inverse
  //    （钱已经花出去了）。用旧判据的表现是那条日志上挂着一颗点了没反应的撤销钮。
  const canUndo =
    !undone &&
    step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done &&
    isRevertibleAssistantOperatorTool(step.tool)

  /**
   * 详情文本。
   *
   * ⚠ 实现搬去了 `lib/studio-operator-history.ts`：**落库的历史条目要用同一份
   * 摘要**（P4-B）。抄成两份的下场是刷新前后同一步的详情不一样 —— 而那种不一致
   * 没有任何人会去查。
   */
  const detail = isRejected
    ? (step.error.detail ?? null)
    : step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done
      ? describeOperatorStepDetail(step)
      : null

  return (
    <div
      data-testid="operator-log-item"
      data-tool={step.tool}
      data-status={step.status}
      data-undone={undone ? 'true' : 'false'}
      className={cn(
        'group relative rounded-xl border border-border/70 bg-background px-2.5 py-2 text-md transition-colors duration-fast ease-standard',
        isRunning && 'border-primary/40 bg-primary/5',
        isMoney && 'border-status-warning/40 bg-status-warning-surface',
        isRejected && 'border-status-risk/40 bg-status-risk-surface',
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
              'border-status-risk/40 bg-status-risk-surface text-status-risk',
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
            <span className="mt-0.5 block text-2sm text-muted-foreground">
              {step.reason}
            </span>
          ) : null}
          {isRejected ? (
            <span className="mt-0.5 block text-2sm text-destructive">
              {t(`reject.${step.error.reason}`)}
            </span>
          ) : null}
        </button>
        {canUndo ? (
          <button
            type="button"
            data-testid="operator-log-undo"
            onClick={() => onUndo(entryId)}
            className="shrink-0 rounded-md px-1.5 py-0.5 text-2sm text-muted-foreground opacity-0 transition-opacity duration-fast ease-standard hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
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

      {/* 联网候选（拍板 21）—— 网格搬去了 `StudioOperatorWebCandidateGrid`
          （切片 3b）：那一块有自己的交互与自己的每格状态机，⛔ 别搬回来。
          ⚠ `renderWebCandidates` 为假 = 调查卡已经在卡面上画过这一份了（见 prop
            头注）：这里再画一遍就是同一张候选出现两次。 */}
      {renderWebCandidates &&
      step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done &&
      step.tool === ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages &&
      step.result ? (
        <StudioOperatorWebCandidateGrid
          entryId={entryId}
          images={step.result.images}
          webImport={webImport}
          limit={webImportLimit}
          onToggle={onToggleWebImage}
        />
      ) : null}

      {/* 联网**查文字**的来源列表（切片 3b）。
          ⚠ 它长在日志条里而不是自己一张卡：这一步是过程不是结论，折叠归 ToolGroup
            管（§11.4「ToolGroup」那一行），展开之后看到的就是这份来源。
          ⚠ 标题**可点开原页**（新窗）——摘要只有一两句，判断可信度靠的是出处。 */}
      {step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done &&
      step.tool === ASSISTANT_OPERATOR_TOOL_IDS.searchWeb &&
      step.result &&
      step.result.results.length > 0 ? (
        <ul
          data-testid="operator-web-sources"
          className="mt-2 flex flex-col gap-1.5"
        >
          {step.result.results.map((entry) => (
            <li key={entry.url} className="min-w-0">
              <a
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="operator-web-source"
                className="block truncate text-2sm text-foreground underline-offset-2 transition-colors duration-fast ease-standard hover:text-primary hover:underline"
              >
                {entry.title}
              </a>
              <span className="block truncate text-xs tracking-nav text-muted-foreground">
                {entry.publisher ?? t('web.publisherUnknown')}
              </span>
              <span className="mt-0.5 block text-2sm text-muted-foreground">
                {entry.snippet}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* 证据卡（2026-09-06）—— `research` 的来源列表。
          ⚠ 它**复用 `search_web` 那份来源列表的骨架**（标题可点 / 出处小字 /
            摘要），多的只有两枚标：`kind`（一段话 / 一串标签 / 一张图）与
            `confidence`（这个源有多权威）。⛔ 别为它另起一张卡：日志流里
            「查了一下」的形状该是一个，两张卡会让用户以为发生了两种不同的事。
          ⚠ `url` 可选 —— danbooru 的共现标签没有单一页面可点，那种没有链接，
            ⛔ 不渲染成一颗点不开的链接。 */}
      {step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done &&
      step.tool === ASSISTANT_OPERATOR_TOOL_IDS.research &&
      step.result &&
      step.result.evidence.length > 0 ? (
        <ul
          data-testid="operator-evidence-list"
          className="mt-2 flex flex-col gap-1.5"
        >
          {step.result.evidence.map((item, index) => (
            <li
              key={`${item.url ?? item.title}-${index}`}
              data-testid="operator-evidence-item"
              data-kind={item.kind}
              data-confidence={item.confidence}
              className="min-w-0"
            >
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="operator-evidence-link"
                  className="block truncate text-2sm text-foreground underline-offset-2 transition-colors duration-fast ease-standard hover:text-primary hover:underline"
                >
                  {item.title}
                </a>
              ) : (
                <span className="block truncate text-2sm text-foreground">
                  {item.title}
                </span>
              )}
              <span className="flex min-w-0 items-center gap-1">
                <span
                  data-testid="operator-evidence-publisher"
                  className="truncate text-xs tracking-nav text-muted-foreground"
                >
                  {item.publisher}
                </span>
                {/* 两枚标 —— 一眼看出「这是标签还是一段话」「信得过几分」。
                    ⚠ `high` 用 applied 绿、`low` 用 risk 橙，中间档走
                      `muted-foreground`：三档各有各的颜色会让整片证据变成灯泡墙。 */}
                <span
                  data-testid="operator-evidence-kind"
                  className="shrink-0 rounded-sm border border-border/70 px-1 text-xs text-muted-foreground"
                >
                  {t(`evidence.kind.${item.kind}`)}
                </span>
                <span
                  data-testid="operator-evidence-confidence"
                  className={cn(
                    'shrink-0 text-xs',
                    item.confidence === 'high'
                      ? 'text-status-applied'
                      : item.confidence === 'low'
                        ? 'text-status-risk'
                        : 'text-muted-foreground',
                  )}
                >
                  {t(`evidence.confidence.${item.confidence}`)}
                </span>
              </span>
              <span className="mt-0.5 block text-2sm text-muted-foreground">
                {item.snippet}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* 读回来的正文段（2026-09-06）。
          ⚠ 它**默认折叠在详情里**是不行的：这一段正是助手接下来写进提示词的
            原文，用户要能当场对照。所以摊开画，但夹在一条可点开原页的地址下面。
          ⚠ `whitespace-pre-wrap` —— 服务端截的是**段落**，换行是内容的一部分。 */}
      {step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done &&
      step.tool === ASSISTANT_OPERATOR_TOOL_IDS.readUrl &&
      step.result ? (
        <div data-testid="operator-read-url" className="mt-2 min-w-0">
          <a
            href={step.result.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="operator-read-url-link"
            className="block truncate text-xs tracking-nav text-muted-foreground underline-offset-2 transition-colors duration-fast ease-standard hover:text-primary hover:underline"
          >
            {step.result.title}
          </a>
          <p
            data-testid="operator-read-url-excerpt"
            className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-2sm text-muted-foreground"
          >
            {step.result.excerpt}
          </p>
        </div>
      ) : null}

      {open && detail ? (
        <p
          data-testid="operator-log-detail"
          className="mt-2 whitespace-pre-wrap border-t border-dashed border-border/70 pt-2 text-2sm text-muted-foreground"
        >
          {detail}
        </p>
      ) : null}
    </div>
  )
})
