'use client'
import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { StudioCanvas } from '@/components/business/studio-shared/chrome/StudioCanvas'
import type { StudioImageEditTarget } from '@/components/business/studio-shared/editor/StudioImageEditStage'
import { StudioStageSwap } from '@/components/business/studio-shared/chrome/StudioStageSwap'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useStudioGen } from '@/contexts/studio-context'
import { useIsMobile } from '@/hooks/use-mobile'
import { useNovelAiCharacters } from '@/hooks/use-novelai-characters'
import { StudioTagsPromptArea } from './StudioTagsPromptArea'
import { NovelAiCharacterComposer } from './NovelAiCharacterComposer'
import { StudioDanbooruPanel } from './StudioDanbooruPanel'

export type TagWorkbenchPanel = 'composition' | 'catalog' | 'templates'
/** 标签台自己的两块面板（模板面板自带头部，走 `templates` 那一格）。 */
type TagOwnPanel = Exclude<TagWorkbenchPanel, 'templates'>

/**
 * 标签台的舞台：平时是结果区，按需换成查资料 / 构图 / 模板之一。
 * 手机底部输入框（`StudioTagsWorkbench`）与桌面底部输入框（`StudioWorkspaceUI` 直接挂，
 * 与自然语言台同一个 `StudioWorkbenchLayout`，头部那颗写法切换因此跨两台不重挂）
 * 共用这一份。换场走 `StudioStageSwap`（面板淡入上浮 · 收起时结果淡入回来）。
 */
export function StudioTagsStage({
  panel,
  onClose,
  bottom = false,
  templates,
  onEditImage,
}: {
  panel: TagWorkbenchPanel | null
  onClose: () => void
  /** 桌面底部输入框：参考图住在输入框的附件行里，舞台不画参考轨。 */
  bottom?: boolean
  /** 模板面板（宿主给，它自带头部与「返回结果」）。 */
  templates?: ReactNode
  onEditImage?: (target: StudioImageEditTarget) => void
}) {
  const t = useTranslations('StudioTags.workbench')
  const c = useNovelAiCharacters()
  const { isGenerating } = useStudioGen()
  /** 打开面板的那颗按钮 —— 关掉时焦点回到它身上。 */
  const trigger = useRef<HTMLElement | null>(null)
  useEffect(() => {
    // 模板面板自己管焦点。
    if (!panel || panel === 'templates') return
    // 面板之间直接切时保留最初那颗；焦点此刻还在刚点的按钮上。
    if (!trigger.current && document.activeElement instanceof HTMLElement) {
      trigger.current = document.activeElement
    }
  }, [panel])
  const phone = useIsMobile()
  /**
   * 标题**挂上时**才落焦点、滚到看得见 —— 换场是「结果先淡出一拍，面板再上来」，
   * ⛔ 在 `panel` 一变就去找标题（那一拍它还没挂上）。
   * 手机上把整块面板顶到顶栏下，高度扣掉固定编辑框，底部「加到哪 + 加入」保持可见。
   * 桌面舞台只在看不见时才动。
   */
  const focusHeading = useCallback(
    (node: HTMLHeadingElement | null) => {
      if (!node) return
      node.focus({ preventScroll: true })
      if (phone) {
        ;(node.closest('section') ?? node).scrollIntoView({ block: 'start' })
      } else {
        node.scrollIntoView({ block: 'nearest' })
      }
    },
    [phone],
  )
  const close = () => {
    onClose()
    if (!phone) trigger.current?.focus()
    trigger.current = null
  }

  const renderOwnPanel = (key: TagOwnPanel) =>
    // 查资料自带头部（「查资料」+ 角色 | 画风 + 返回结果）与 Esc。
    key === 'catalog' ? (
      <StudioDanbooruPanel onClose={close} headingRef={focusHeading} />
    ) : (
      <section
        className="studio-mobile-stage-panel flex min-h-0 scroll-mt-16 flex-col gap-4 overflow-y-auto pb-4 lg:h-auto lg:overflow-visible"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            close()
          }
        }}
      >
        {/* 标签台 A（owner 2026-10-09）：标题 · 自动定位开关排一行，右边返回结果；
            板下面 ⛔ 不再有角色药丸 / 加人（加人只在输入框页签的 ＋）。 */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* ⚠ `outline-none`：打开面板时焦点被程序挪到这里（给读屏一个落点），
            浏览器自带的焦点框会把标题框起来（owner 2026-09-26 截图）。 */}
          <h2
            ref={focusHeading}
            tabIndex={-1}
            className="text-base font-medium outline-none"
          >
            {t(key)}
          </h2>
          {c.mode ? (
            <label className="flex items-center gap-2 text-2xs text-muted-foreground">
              {t('auto')}
              <Switch
                checked={c.layout?.positioning !== 'manual'}
                disabled={isGenerating || !c.layout}
                onCheckedChange={(automatic) => {
                  if (c.layout)
                    c.setLayout({
                      ...c.layout,
                      positioning: automatic ? 'auto' : 'manual',
                    })
                }}
              />
            </label>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto min-h-11 lg:min-h-0"
            onClick={close}
          >
            {t('backToResults')}
          </Button>
        </div>
        {c.mode ? (
          <>
            {/* 构图格是正方形 —— 按舞台宽度铺开会比屏幕还高，收成一块居中的方格。 */}
            <div className="mx-auto w-full max-w-md">
              <NovelAiCharacterComposer
                mode={c.mode}
                value={c.layout}
                activeIndex={c.activeIndex}
                disabled={isGenerating}
                onChange={c.setLayout}
                onSelect={c.select}
              />
            </div>
          </>
        ) : null}
      </section>
    )

  return (
    <StudioStageSwap
      panelKey={panel}
      renderResults={(motionClass) => (
        <StudioCanvas
          referenceRail={!bottom}
          className={motionClass}
          onEdit={onEditImage}
        />
      )}
      renderPanel={(key) =>
        key === 'templates' ? templates : renderOwnPanel(key as TagOwnPanel)
      }
    />
  )
}

export function StudioTagsWorkbench({
  panel,
  onPanelChange,
  templates,
  templatesRestoring,
  overlay,
  onEditImage,
  children,
}: {
  panel: TagWorkbenchPanel | null
  onPanelChange: (panel: TagWorkbenchPanel | null) => void
  templates: ReactNode
  templatesRestoring?: boolean
  overlay?: ReactNode
  onEditImage?: (target: StudioImageEditTarget) => void
  children: (slots: { stage: ReactNode; composer: ReactNode }) => ReactNode
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const openPanel = (next: TagWorkbenchPanel | null) => {
    onPanelChange(next)
    stageRef.current?.scrollIntoView({ block: 'start' })
  }
  const showResults = () => {
    onPanelChange(null)
    stageRef.current?.focus({ preventScroll: true })
    stageRef.current?.scrollIntoView({ block: 'start' })
  }

  return children({
    stage: (
      <div
        ref={stageRef}
        tabIndex={-1}
        className="flex min-h-0 flex-1 scroll-mt-16 flex-col outline-none"
      >
        <StudioTagsStage
          panel={panel}
          onClose={showResults}
          bottom
          templates={templates}
          onEditImage={onEditImage}
        />
      </div>
    ),
    composer: (
      <StudioTagsPromptArea
        onOpenPanel={openPanel}
        activePanel={panel}
        restoring={templatesRestoring}
        overlay={overlay}
      />
    ),
  })
}
