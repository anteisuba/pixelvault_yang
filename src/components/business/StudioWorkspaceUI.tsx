'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { usePathname } from 'next/navigation'
import { motion, useTransform } from 'motion/react'
import { useTranslations } from 'next-intl'

import { DURATION_MS } from '@/constants/motion'
import { getProviderLabel } from '@/constants/providers'
import { STUDIO_PREFILL_PROMPT_STORAGE_KEY } from '@/constants/studio'
import { STUDIO_OPERATOR_WORKBENCH_COLUMN_ANCHOR } from '@/constants/studio-assistant-operator'
import { parseTagChips } from '@/lib/tag-composer'
import { ROUTES } from '@/constants/routes'
import {
  StudioAssistantDock,
  StudioAssistantFab,
  StudioCanvas,
  StudioWorkbenchLayout,
  StudioPromptArea,
  StudioCommandPalette,
} from '@/components/business/studio'
import { StudioDockPanelArea } from '@/components/business/studio/StudioDockPanelArea'
import { StudioMobileComposer } from '@/components/business/studio/StudioMobileComposer'
import {
  StudioTagsStage,
  StudioTagsWorkbench,
  type TagWorkbenchPanel,
} from '@/components/business/studio/tags/StudioTagsWorkbench'
import { StudioTagsComposer } from '@/components/business/studio/tags/StudioTagsComposer'
import { StudioTemplatesPanel } from '@/components/business/studio/templates/StudioTemplatesPanel'
import { StudioTemplateUndoToast } from '@/components/business/studio/templates/StudioTemplateUndoToast'
import { StudioStageSwap } from '@/components/business/studio-shared/chrome/StudioStageSwap'
import { StudioDialectHeader } from '@/components/business/studio/tags/StudioDialectHeader'
import { StudioOperatorDock } from '@/components/business/studio/assistant-operator'
import { StudioKeepChangePanel } from '@/components/business/image/StudioKeepChangePanel'
import { Button } from '@/components/ui/button'

import {
  useStudioData,
  useStudioForm,
  useStudioGen,
} from '@/contexts/studio-context'
import { StudioOperatorHostProvider } from '@/contexts/studio-operator-host'
import { useIsMobile } from '@/hooks/use-mobile'
import { useStudioModeModelOptions } from '@/hooks/use-studio-mode-model-options'
import { useStudioTemplateApply } from '@/hooks/use-studio-template-apply'
import { useStudioOperatorYield } from '@/hooks/use-studio-operator-yield'
import { useStudioWorkbenchOperatorHost } from '@/hooks/use-studio-workbench-operator-host'
import { useRouter } from '@/i18n/navigation'
import { useStudioReplayFromUrl } from '@/hooks/use-studio-replay-from-url'
import { useStudioDraft, type StudioDraft } from '@/hooks/use-studio-draft'
import {
  clearStudioNodeHandoff,
  readStudioNodeHandoff,
  writeStudioNodeResult,
  type StudioNodeHandoff,
} from '@/lib/studio-node-handoff'

const STUDIO_MODE_KEY = 'studio-workflow-mode'

/** 把「保留 / 改变」的标签拼回提示词尾巴。原样搬自退役的 `StudioBottomDock`。 */
function buildRefinePrompt(
  basePrompt: string,
  keepTags: string[],
  changeTags: string[],
  freeText: string,
): string {
  const keepText = keepTags.length > 0 ? `Keep ${keepTags.join(', ')}.` : ''
  const changeText =
    changeTags.length > 0 ? `Change ${changeTags.join(', ')}.` : ''
  const suffix = [keepText, changeText, freeText.trim()]
    .filter((part) => part.length > 0)
    .join(' ')
  const trimmedBase = basePrompt.trim()

  if (!suffix) return trimmedBase
  return trimmedBase ? `${trimmedBase}. ${suffix}` : suffix
}

/**
 * StudioWorkspaceUI — the workspace's visual + non-mode-sync logic, lifted
 * out of the page level so the layout in (workspace)/layout.tsx can mount
 * it once and keep it mounted while the user flicks between
 * /studio/image, /studio/video, /studio/audio.
 *
 * The mode-sync side effect (dispatching SET_SELECTED_WORKFLOW_ID when the
 * route mode changes) lives in StudioModeSync — pages emit it; this
 * component never sees the prop.
 */
export function StudioWorkspaceUI() {
  const t = useTranslations('StudioPage')
  const { state, dispatch } = useStudioForm()
  const { imageUpload } = useStudioData()
  const { lastGeneration, isGenerating } = useStudioGen()
  const tEmptyState = useTranslations('StudioEmptyState')
  const router = useRouter()
  const [nodeHandoff, setNodeHandoff] = useState<StudioNodeHandoff | null>(null)
  /**
   * 操作员面板服务**图片与视频**两档（P4-A，拍板 8：一个助手跨域，域是头部一枚
   * chip；切域换工具、不断会话）。
   *
   * ⛔ **音频档有意不挂**（owner 2026-08-31 拍板「P4 的声音那边不用管」）：
   * 配音间已经是一套独立的对话式界面，再叠一个操作员就是同一件事两个入口。
   * 所以这里是白名单而不是 `!== 'audio'` —— 将来多一个模态时，默认不给它助手
   * 比默认给它一个拧不动任何旋钮的助手安全（拍板 19）。
   */
  const isOperatorSurface =
    state.outputType === 'image' || state.outputType === 'video'
  /**
   * 操作员在**工作台**这个宿主上的那一份（P4-C）。面板的外壳（`StudioOperatorDock`）
   * 与撤销链从 P4-C 起都读它，因此那颗外壳变成了页面无关的东西 —— 同一个 Dock
   * 也挂在 LoRA 装配台上（那条路由没有 `<StudioProvider>`）。
   */
  const workbenchOperatorHost = useStudioWorkbenchOperatorHost()
  /**
   * 移动端画布优先形态（owner 2026-09-03 拍板方向 A，需求卡
   * `docs/references/pages/studio-image-mobile-request.md` +
   * `studio-video-mobile-request.md`）：`<1024` 且**图片 / 视频档**时参数栏整颗
   * 不渲染，参数收进底部固定 composer 的 chip 行。
   *
   * ⚠ 白名单而不是 `!== 'audio'`：音频的移动端仍走既有纵向栈（参数栏在上、
   * 结果在下），它的音色 / 朗读 / 高级三栏还没有对应的 chip 与 sheet ——
   * 默认不给一个新模态 composer，比默认给它一个拧不动一半旋钮的 composer 安全。
   * ⚠ 二选一而不是 CSS 隐藏 —— `StudioPromptArea` 与 `StudioMobileComposer` 各自
   * 调 `useStudioGenerateAction`，同时挂载会让 `REQUEST_GENERATE` 发两遍请求。
   */
  const isMobile = useIsMobile()
  const useMobileComposer =
    isMobile && (state.outputType === 'image' || state.outputType === 'video')
  /**
   * 标签台（D10 ⑤）—— **同一个壳**：结果区 / 参考轨 / 助手 / 任务条一个字都不换，
   * 左侧集中标签与参数，右侧按需展开资料和构图。方言由路由说了算（`StudioModeSync`），
   * ⛔ 不由选中的模型反推。
   */
  const isTagsWorkbench =
    state.outputType === 'image' && state.promptDialect === 'tags'
  /**
   * 图片台（桌面，自然语言与标签两台）= 上面一整块结果舞台 + 底部一条输入框
   * （owner 2026-09-26 按可点原型拍板）；视频台桌面同一个外壳（09-27 视频台 A：素材
   * 挂在输入框里）。音频 / 手机这一片不动。
   */
  const isBottomComposer =
    !useMobileComposer &&
    (state.outputType === 'image' || state.outputType === 'video')
  /** 底部输入框里装的是 `StudioPromptArea`（自然语言图片台与视频台；标签台装自己的）。 */
  const isPromptAreaBottom = isBottomComposer && !isTagsWorkbench
  /**
   * 图片 / 视频台桌面的助手是**让位**不是覆盖（owner 2026-09-26）：面板外面就是工作台，
   * 点参数、改标签都是正常操作 —— 与画布同一档，⛔ 点外面不收。收起走头部收起键、
   * 头像与 Esc。面板排成工作台旁边的一列（布局 A「分栏并排」）：上下与舞台 /
   * 输入框对齐，头像留在右上那一行里。
   */
  const operatorHost = useMemo(
    () =>
      isBottomComposer
        ? {
            ...workbenchOperatorHost,
            collapseOnOutsidePointer: false,
            anchor: STUDIO_OPERATOR_WORKBENCH_COLUMN_ANCHOR,
          }
        : workbenchOperatorHost,
    [isBottomComposer, workbenchOperatorHost],
  )
  /**
   * 舞台上开着哪块面板：模板（每一台都有 —— 图片两台与视频，桌面与手机，模板 C
   * 第二片）· 查资料 / 构图 / 提示词块（只有标签台）。换档（图片 ↔ 视频）全收；
   * 离开标签台时标签台那三块收掉。
   */
  const [stagePanel, setStagePanel] = useState<TagWorkbenchPanel | null>(null)
  const [stagePanelOutputType, setStagePanelOutputType] = useState(
    state.outputType,
  )
  if (stagePanelOutputType !== state.outputType) {
    setStagePanelOutputType(state.outputType)
    setStagePanel(null)
  } else if (stagePanel && stagePanel !== 'templates' && !isTagsWorkbench)
    setStagePanel(null)
  /**
   * 模板 C（owner 2026-09-26）：模板在舞台上打开；点一张直接套用、回到结果，
   * 输入框正上方给 5 秒「撤销」。套用与撤销住在这里 —— 面板和那句撤销是两处，
   * 得是同一份快照。
   */
  const { modelOptions: modeModelOptions, selectedModel: modeModel } =
    useStudioModeModelOptions()
  const templateApply = useStudioTemplateApply(modeModelOptions)
  const templatesPanel = (
    <StudioTemplatesPanel
      // 手机（<1024）走画板「模板 C · 手机」那一版：‹ 标题 ＋、搜索独占一行。
      variant={isMobile ? 'phone' : 'stage'}
      // 提示词在舞台下面的只有底部输入框两种（桌面图片台 · 手机图片 / 视频）。
      promptBelow={isBottomComposer || useMobileComposer}
      dialect={state.outputType === 'image' ? state.promptDialect : 'natural'}
      save={{
        outputType: templateApply.templates.currentTemplateOutputType,
        prompt: templateApply.templates.currentTemplatePrompt,
        params: templateApply.templates.currentTemplateParams,
        modelId: modeModel?.modelId,
        provider: modeModel
          ? getProviderLabel(modeModel.providerConfig)
          : undefined,
      }}
      onApply={(recipe) => {
        templateApply.apply(recipe)
        setStagePanel(null)
      }}
      onClose={() => setStagePanel(null)}
    />
  )
  const toggleTemplates = useCallback(
    () =>
      setStagePanel((current) =>
        current === 'templates' ? null : 'templates',
      ),
    [],
  )
  /** 撤销那一下输入框里的内容从 40% 淡回来 —— 看得出「换回去了」。 */
  const [composerRestoring, setComposerRestoring] = useState(false)
  useEffect(() => {
    if (!composerRestoring) return
    const timer = window.setTimeout(
      () => setComposerRestoring(false),
      DURATION_MS.base,
    )
    return () => window.clearTimeout(timer)
  }, [composerRestoring])
  const templatesControl = {
    open: stagePanel === 'templates',
    onToggle: toggleTemplates,
    restoring: composerRestoring,
  }
  /**
   * 「已套用 · 撤销」挂在哪：有底部输入框 / 底栏的挂在它上沿（`above`）；竖排
   * 参数栏那一台（音频）没有，浮在舞台底部（`inside`）。
   */
  const undoToast = (anchor: 'above' | 'inside') =>
    templateApply.appliedName ? (
      <StudioTemplateUndoToast
        key={templateApply.appliedId}
        anchor={anchor}
        name={templateApply.appliedName}
        onUndo={() => {
          templateApply.undo()
          setComposerRestoring(true)
        }}
        onDismiss={templateApply.dismiss}
      />
    ) : null
  /**
   * 助手展开时工作台让位（owner 2026-09-26）：`studioOperatorYield` 由 Dock 按
   * 形状第二拍的弹簧驱动，这里只把它绑到地台的右内边距。
   * ⚠ 恒绑同一个 motion 值、按布局在变换里取值 —— ⛔ 不在 style 上把它换成
   *   `undefined`：motion 的 style 从 motion 值换成静态值时不解绑（同 Dock 那条）。
   */
  const operatorYield = useStudioOperatorYield()
  const groundPaddingRight = useTransform(operatorYield, (reserve) =>
    isBottomComposer && reserve > 0
      ? `max(var(--workbench-pad), ${reserve}px)`
      : 'var(--workbench-pad)',
  )
  /**
   * 底部输入框那几台舞台上方同一行：标题 + 自然语言 / 标签切换。
   * ⛔ 写法切换只给图片档：视频没有方言这一说。
   */
  const workbenchHeader = isBottomComposer ? (
    <div className="flex items-center gap-3.5">
      <h1 className="text-sm font-semibold text-muted-foreground">
        {tEmptyState(
          state.outputType === 'video' ? 'modeLabel.video' : 'modeLabel.image',
        )}
      </h1>
      {state.outputType === 'image' ? (
        <StudioDialectHeader disabled={isGenerating} />
      ) : null}
    </div>
  ) : undefined

  const { isLoaded, userId } = useAuth()
  const pathname = usePathname()
  const draft = useMemo<StudioDraft>(
    () => ({
      prompt: state.prompt,
      negativePrompt: state.advancedParams.negativePrompt ?? '',
      novelAiLayout: state.advancedParams.novelAiLayout,
      referenceImages: imageUpload.referenceEntries.map((entry) => entry.url),
      aspectRatio: state.aspectRatio,
      resolution: state.advancedParams.resolution,
    }),
    [
      state.aspectRatio,
      state.advancedParams.resolution,
      state.prompt,
      state.advancedParams.negativePrompt,
      state.advancedParams.novelAiLayout,
      imageUpload.referenceEntries,
    ],
  )
  const restoreDraft = useCallback(
    (saved: StudioDraft) => {
      imageUpload.clearAllImages()
      saved.referenceImages.forEach((url) => imageUpload.addReferenceImage(url))
      dispatch({ type: 'SET_PROMPT', payload: saved.prompt })
      dispatch({
        type: 'SET_TAG_CHIPS',
        payload: {
          polarity: 'negative',
          chips: parseTagChips(saved.negativePrompt),
        },
      })
      dispatch({
        type: 'SET_ADVANCED_PARAMS',
        payload: {
          ...state.advancedParams,
          negativePrompt: saved.negativePrompt,
          novelAiLayout: saved.novelAiLayout,
          ...(saved.resolution ? { resolution: saved.resolution } : {}),
        },
      })
      if (saved.aspectRatio)
        dispatch({ type: 'SET_ASPECT_RATIO', payload: saved.aspectRatio })
    },
    [imageUpload, dispatch, state.advancedParams],
  )
  useStudioDraft({
    userId: isLoaded ? userId : null,
    enabled:
      (pathname.endsWith('/studio/image') ||
        pathname.endsWith('/studio/image/tags')) &&
      state.outputType === 'image',
    draft,
    onRestore: restoreDraft,
  })

  // Phase 1C: hydrate prompt / seed / negativePrompt / aspectRatio from
  // the URL on mount when the user arrived via "Use this image" replay.
  // LoRA `?style=` URL params are handled separately inside
  // `useActiveLoraStack`; together the two cover the full replay path.
  useStudioReplayFromUrl()

  // Restore workflow mode from localStorage on mount.
  // Also close any panels left open from the previous session — the
  // reducer's initialState keeps panels closed, but a stale tab restore
  // (or hot-reload in dev) can resurrect an open panel and pop a Dialog
  // the moment the user lands on /studio/{image,video,audio}.
  useEffect(() => {
    dispatch({ type: 'CLOSE_ALL_PANELS' })
    const saved = localStorage.getItem(STUDIO_MODE_KEY)
    if (saved === 'card' || saved === 'quick') {
      dispatch({ type: 'SET_WORKFLOW_MODE', payload: saved })
    }

    const prefillPrompt = sessionStorage.getItem(
      STUDIO_PREFILL_PROMPT_STORAGE_KEY,
    )
    if (prefillPrompt) {
      dispatch({ type: 'SET_PROMPT', payload: prefillPrompt })
      sessionStorage.removeItem(STUDIO_PREFILL_PROMPT_STORAGE_KEY)
      window.requestAnimationFrame(() => {
        document.getElementById('studio-prompt')?.scrollIntoView({
          block: 'center',
          behavior: 'smooth',
        })
      })
    }
  }, [dispatch])

  // Open-Image-Studio round-trip: a canvas image node navigated here with a
  // handoff. Prefill prompt + reference images, and keep the handoff live so
  // the user can attach the generated result back to the origin node. Runs
  // once on mount (the handoff is consumed on attach/cancel).
  const didReadHandoffRef = useRef(false)
  useEffect(() => {
    if (didReadHandoffRef.current) return
    didReadHandoffRef.current = true
    const handoff = readStudioNodeHandoff()
    if (!handoff) return
    // One-time sessionStorage hydration is an external browser sync on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNodeHandoff(handoff)
    if (handoff.prompt) {
      dispatch({ type: 'SET_PROMPT', payload: handoff.prompt })
    }
    for (const url of handoff.referenceUrls) {
      void imageUpload.addFromUrl(url)
    }
    window.requestAnimationFrame(() => {
      document.getElementById('studio-prompt')?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      })
    })
  }, [dispatch, imageUpload])

  // Persist workflow mode changes
  useEffect(() => {
    localStorage.setItem(STUDIO_MODE_KEY, state.workflowMode)
  }, [state.workflowMode])

  const canAttach = Boolean(lastGeneration?.url)

  const handleAttachToNode = useCallback(() => {
    if (!nodeHandoff || !lastGeneration?.url) return
    writeStudioNodeResult({
      originNodeId: nodeHandoff.originNodeId,
      url: lastGeneration.url,
      generationId: lastGeneration.id,
      label: nodeHandoff.characterName ?? lastGeneration.model ?? undefined,
    })
    clearStudioNodeHandoff()
    setNodeHandoff(null)
    router.push(ROUTES.STUDIO_NODE)
  }, [lastGeneration, nodeHandoff, router])

  const handleCancelHandoff = useCallback(() => {
    clearStudioNodeHandoff()
    setNodeHandoff(null)
  }, [])

  // 「保留与改变」的提交 —— 随 `StudioBottomDock` 一起搬过来（切片 A）。
  const handleKeepChangeSubmit = useCallback(
    (keepTags: string[], changeTags: string[], freeText: string) => {
      const refinedPrompt = buildRefinePrompt(
        state.prompt,
        keepTags,
        changeTags,
        freeText,
      )

      dispatch({ type: 'SET_PROMPT', payload: refinedPrompt })
      dispatch({ type: 'CLOSE_PANEL', payload: 'keepChange' })
      dispatch({ type: 'REQUEST_GENERATE' })
    },
    [dispatch, state.prompt],
  )

  return (
    /**
     * 操作员的**宿主**（P4-C）—— 面板从这里读表单、往这里落笔。
     *
     * ⚠ 必须包住 `StudioPromptArea`（参数栏里的归属标记 ✦ 与就地确认条走的是
     * 同一份上下文）和 `StudioOperatorDock` 两者 —— 只包 dock 的话，✦ 那一侧会在
     * 运行时抛「must be used within provider」。
     * ⚠ 音频档也照包：`useStudioWorkbenchOperatorHost` 是纯读，包了不渲染面板
     * 什么都不会发生；按 `isOperatorSurface` 条件包反而会让 hook 有条件地调。
     */
    <StudioOperatorHostProvider host={operatorHost}>
      <a
        href="#studio-prompt"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        {t('skipToPrompt')}
      </a>

      {nodeHandoff ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
          <span className="flex-1 text-foreground">
            {t('nodeHandoffBanner')}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleCancelHandoff}
          >
            {t('nodeHandoffCancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canAttach}
            onClick={handleAttachToNode}
            title={canAttach ? undefined : t('nodeHandoffNeedResult')}
          >
            {t('nodeHandoffAttach')}
          </Button>
        </div>
      ) : null}

      <div
        role="tabpanel"
        id={`studio-panel-${state.outputType}`}
        aria-labelledby={`studio-tab-${state.outputType}`}
        className="flex"
      >
        {/*
         * Unified canvas-centric layout for image / video / audio. The
         * inline gallery strip was removed in Phase 5.5d — users now
         * reach their archive through the Image chip popover's "Select
         * asset" path, which is also where reference images are picked.
         * Projects + API key management used to live in a Studio-local
         * sidebar but that sidebar had no trigger after the Phase 3.1
         * toggle removal — Projects moved to /assets and API keys to
         * the sidebar's Card section (single source of truth, no
         * duplicate entry in the top bar), so the workspace now renders
         * inside the (main) layout's SidebarProvider directly.
         *
         * The assistant remains a DOM sibling of the canvas column, but its
         * desktop shell is a fixed overlay so opening it never subtracts
         * width from the work surface.
         */}
        {/* ⚠ `contain-inline-size`：工作台的宽度**只听外面的**（owner 2026-09-26
            「我认为固定比较好」）。里面一段不带空格的长字、一颗整句变成的标签，
            它们的最小内容宽度会沿 flex 链一路往上传，把整个工作台撑到助手底下、
            撑出视口 —— 在地台这一层截断，里面的东西只能在自己格子里折行。 */}
        <motion.div
          className="studio-layout-v2 workbench-ground min-w-0 flex-1 contain-inline-size"
          style={{ paddingRight: groundPaddingRight }}
        >
          {/* 三个模态共用一套外壳（切片 A，owner 2026-08-23）。此前只有图片走
              横向工作台，视频 / 音频还留在「纵向 canvas + 底部丸」那条路上；
              那条路连同 `StudioFlowLayout` / `StudioBottomDock` /
              `StudioToolbarPanels` / `StudioToolbar` 已整条退役，不留兼容层。
              栏位差异归 `StudioPromptArea` 自己按 outputType 分。 */}
          {/* ⚠ 桌面两台（自然语言 · 标签）挂的是**同一个** `StudioWorkbenchLayout`
              元素，只换 params / stage —— 头部那颗写法切换因此跨台不重挂，液态
              分段才演得完（owner 2026-09-26）。手机标签台仍是自己的两栏。 */}
          {isTagsWorkbench && !isBottomComposer ? (
            <StudioTagsWorkbench
              panel={stagePanel}
              onPanelChange={setStagePanel}
              templates={templatesPanel}
              templatesRestoring={composerRestoring}
              overlay={undoToast('above')}
            />
          ) : (
            <StudioWorkbenchLayout
              layout={isBottomComposer ? 'bottom' : 'columns'}
              header={workbenchHeader}
              params={
                useMobileComposer ? null : isTagsWorkbench ? (
                  <StudioTagsComposer
                    onOpenPanel={setStagePanel}
                    activePanel={stagePanel}
                  />
                ) : (
                  <StudioPromptArea
                    layout={isPromptAreaBottom ? 'bottom' : 'column'}
                    templates={templatesControl}
                  />
                )
              }
              stage={
                isTagsWorkbench ? (
                  <StudioTagsStage
                    panel={stagePanel}
                    onClose={() => setStagePanel(null)}
                    bottom
                    templates={templatesPanel}
                  />
                ) : (
                  <StudioStageSwap
                    panelKey={stagePanel === 'templates' ? 'templates' : null}
                    renderPanel={() => templatesPanel}
                    renderResults={(motionClass) => (
                      <StudioCanvas
                        referenceRail={!isPromptAreaBottom}
                        className={motionClass}
                      />
                    )}
                  />
                )
              }
              composer={
                useMobileComposer ? (
                  <StudioMobileComposer
                    templates={templatesControl}
                    overlay={undoToast('above')}
                  />
                ) : null
              }
              composerOverlay={isBottomComposer ? undoToast('above') : null}
              stageOverlay={
                !isBottomComposer && !useMobileComposer
                  ? undoToast('inside')
                  : null
              }
              paramsClassName={
                composerRestoring
                  ? 'animate-in fade-in-40 duration-base ease-standard motion-reduce:animate-none'
                  : undefined
              }
            />
          )}
        </motion.div>
        {/* 助手 —— **图片工作台整体切到操作员面板**。它自带三态：展开的
            覆盖层 + 收起的胶囊，所以图片档不再挂 `StudioAssistantFab`（那颗浮标
            是旧面板的入口，两个同时在等于右上角摆两个助手）。
            ⚠ 视频 / 音频仍走旧面板：把统一底盘扩到这两档是后续切片，那之前两套并存。
            ⛔ 不加 feature flag —— 本仓 flag 文化已死（只有 comfyRunner 活着）。 */}
        {isOperatorSurface ? (
          <StudioOperatorDock />
        ) : (
          <>
            <StudioAssistantDock />
            {/* 右上角助手浮标 —— 小屏没有它，抽屉宿主长在参数栏那颗「助手」丸里
                （`lg:hidden`），两者不重复。 */}
            <StudioAssistantFab />
          </>
        )}
      </div>

      {/* 工具面板 —— 原来挂在 `StudioBottomDock` 上，dock 一退役就必须改挂
          这里，否则视频设置 / 剧本 / 音色库 / 克隆 / 转脚本 / 图片高级参数
          全部变成「点了没反应」。
          ⚠ 这也顺手补上了一个既有缺陷：`StudioDockPanelArea` 里那条
          `imageUpload.setMaxImages(...)` 是全仓唯一给 Studio 设参考图上限的地方，
          而图片模态走横向工作台之后它一直没挂载 —— 于是图片的参考图上限一直是
          Infinity，`over_limit` 那条禁用理由永远不触发（服务端仍会拦，所以是
          「提示缺席」不是「越权」）。现在三个模态都挂着，上限按模型生效。 */}
      <StudioDockPanelArea />
      <StudioKeepChangePanel
        open={state.panels.keepChange}
        onOpenChange={(open) =>
          dispatch({
            type: open ? 'OPEN_PANEL' : 'CLOSE_PANEL',
            payload: 'keepChange',
          })
        }
        currentIntent={null}
        onSubmit={handleKeepChangeSubmit}
      />

      <StudioCommandPalette />
    </StudioOperatorHostProvider>
  )
}
