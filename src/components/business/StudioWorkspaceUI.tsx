'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { STUDIO_PREFILL_PROMPT_STORAGE_KEY } from '@/constants/studio'
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
import { StudioOperatorDock } from '@/components/business/studio/assistant-operator'
import { StudioKeepChangePanel } from '@/components/business/image/StudioKeepChangePanel'
import { Button } from '@/components/ui/button'

import {
  useStudioData,
  useStudioForm,
  useStudioGen,
} from '@/contexts/studio-context'
import { StudioOperatorHostProvider } from '@/contexts/studio-operator-host'
import { useStudioWorkbenchOperatorHost } from '@/hooks/use-studio-workbench-operator-host'
import { useRouter } from '@/i18n/navigation'
import { useStudioReplayFromUrl } from '@/hooks/use-studio-replay-from-url'
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
  const { lastGeneration } = useStudioGen()
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
  const operatorHost = useStudioWorkbenchOperatorHost()

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
        <div className="studio-layout-v2 min-w-0 flex-1">
          {/* 三个模态共用一套外壳（切片 A，owner 2026-08-23）。此前只有图片走
              横向工作台，视频 / 音频还留在「纵向 canvas + 底部丸」那条路上；
              那条路连同 `StudioFlowLayout` / `StudioBottomDock` /
              `StudioToolbarPanels` / `StudioToolbar` 已整条退役，不留兼容层。
              栏位差异归 `StudioPromptArea` 自己按 outputType 分。 */}
          <StudioWorkbenchLayout
            params={<StudioPromptArea />}
            stage={<StudioCanvas />}
          />
        </div>
        {/* 助手 —— **图片工作台整体切到操作员面板**（任务包
            `studio-assistant-operator-2026-08-30.md` P2）。它自带三态：展开的
            覆盖层 + 收起的胶囊，所以图片档不再挂 `StudioAssistantFab`（那颗浮标
            是旧面板的入口，两个同时在等于右上角摆两个助手）。
            ⚠ 视频 / 音频仍走旧面板：统一底盘扩域是 P4，那之前两套并存。
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
