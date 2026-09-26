'use client'
import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { StudioWorkbenchLayout } from '@/components/business/studio-shared/chrome/StudioWorkbenchLayout'
import { StudioCanvas } from '@/components/business/studio-shared/chrome/StudioCanvas'
import { StudioStageSwap } from '@/components/business/studio-shared/chrome/StudioStageSwap'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useStudioForm, useStudioGen } from '@/contexts/studio-context'
import { useNovelAiCharacters } from '@/hooks/use-novelai-characters'
import { StudioTagsPromptArea } from './StudioTagsPromptArea'
import { NovelAiCharacterComposer } from './NovelAiCharacterComposer'
import { StudioDanbooruPanel } from './StudioDanbooruPanel'
import { StudioTagBlocks } from './StudioTagBlocks'

export type TagWorkbenchPanel =
  | 'composition'
  | 'catalog'
  | 'blocks'
  | 'templates'
/** 标签台自己的三块面板（模板面板自带头部，走 `templates` 那一格）。 */
type TagOwnPanel = Exclude<TagWorkbenchPanel, 'templates'>

/**
 * 标签台的舞台：平时是结果区，按需换成查资料 / 构图 / 提示词块 / 模板之一。
 * 手机两栏（`StudioTagsWorkbench`）与桌面底部输入框（`StudioWorkspaceUI` 直接挂，
 * 与自然语言台同一个 `StudioWorkbenchLayout`，头部那颗写法切换因此跨两台不重挂）
 * 共用这一份。换场走 `StudioStageSwap`（面板淡入上浮 · 收起时结果淡入回来）。
 */
export function StudioTagsStage({
  panel,
  onClose,
  bottom = false,
  templates,
}: {
  panel: TagWorkbenchPanel | null
  onClose: () => void
  /**
   * 桌面底部输入框：参考图住在输入框的附件行里、舞台不画参考轨；输入框里没有
   * 「最终画面提示词」的位置，挪进提示词块面板。
   */
  bottom?: boolean
  /** 模板面板（宿主给，它自带头部与「返回结果」）。 */
  templates?: ReactNode
}) {
  const t = useTranslations('StudioTags.workbench')
  const { state } = useStudioForm()
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
  /**
   * 标题**挂上时**才落焦点、滚到看得见 —— 换场是「结果先淡出一拍，面板再上来」，
   * ⛔ 在 `panel` 一变就去找标题（那一拍它还没挂上）。
   */
  const focusHeading = useCallback((node: HTMLHeadingElement | null) => {
    if (!node) return
    node.focus({ preventScroll: true })
    node.scrollIntoView({ block: 'nearest' })
  }, [])
  const close = () => {
    onClose()
    trigger.current?.focus()
    trigger.current = null
  }

  const renderOwnPanel = (key: TagOwnPanel) => (
    <section
      className="flex min-h-0 flex-col gap-4 pb-4"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          close()
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        {/* ⚠ `outline-none`：打开面板时焦点被程序挪到这里（给读屏一个落点），
            浏览器自带的焦点框会把标题框起来（owner 2026-09-26 截图）。 */}
        <h2
          ref={focusHeading}
          tabIndex={-1}
          className="text-base font-medium outline-none"
        >
          {t(key)}
        </h2>
        <Button variant="outline" size="sm" onClick={close}>
          {t('backToResults')}
        </Button>
      </div>
      {key === 'catalog' ? (
        <StudioDanbooruPanel />
      ) : key === 'blocks' ? (
        <>
          <StudioTagBlocks />
          {bottom ? (
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">
                {t('compiled')}
              </summary>
              <p className="whitespace-pre-wrap break-words py-2 text-sm">
                {state.prompt}
              </p>
            </details>
          ) : null}
        </>
      ) : c.mode ? (
        <>
          <label className="flex items-center gap-2 text-sm">
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
            {t('auto')}
          </label>
          {/* 构图格是正方形 —— 按舞台宽度铺开会比屏幕还高，收成一块居中的方格。 */}
          <div className="mx-auto w-full max-w-md">
            <NovelAiCharacterComposer
              mode={c.mode}
              maxCharacters={c.max}
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
        <StudioCanvas referenceRail={!bottom} className={motionClass} />
      )}
      renderPanel={(key) =>
        key === 'templates' ? templates : renderOwnPanel(key as TagOwnPanel)
      }
    />
  )
}

/**
 * 标签台手机那一版：参数栏在上、结果在下（桌面见 `StudioTagsStage` 的说明）。
 * 舞台上开着哪块面板由宿主（`StudioWorkspaceUI`）持有 —— 模板面板的套用与撤销
 * 住在那里，两台共用一份。
 */
export function StudioTagsWorkbench({
  panel,
  onPanelChange,
  templates,
  templatesRestoring,
  overlay,
}: {
  panel: TagWorkbenchPanel | null
  onPanelChange: (panel: TagWorkbenchPanel | null) => void
  /** 模板面板（宿主给）。 */
  templates: ReactNode
  /** 刚撤销了一次套用（正向标签那一栏淡回来）。 */
  templatesRestoring?: boolean
  /** 浮在底部生成栏上沿的东西（「已套用 · 撤销」）。 */
  overlay?: ReactNode
}) {
  const t = useTranslations('StudioTags.workbench')
  const stageRef = useRef<HTMLDivElement>(null)
  const promptRef = useRef<HTMLDivElement>(null)

  return (
    <StudioWorkbenchLayout
      paramsWidthClass="lg:w-105"
      params={
        <div ref={promptRef} className="scroll-mt-14 lg:contents">
          <div className="mb-2 pr-12 lg:hidden">
            <Button
              className="w-full"
              variant="outline"
              onClick={() =>
                stageRef.current?.scrollIntoView({ block: 'start' })
              }
            >
              {t('backToResults')}
            </Button>
          </div>
          <StudioTagsPromptArea
            onOpenPanel={onPanelChange}
            templates={{
              open: panel === 'templates',
              onToggle: () =>
                onPanelChange(panel === 'templates' ? null : 'templates'),
              restoring: templatesRestoring,
            }}
            overlay={overlay}
          />
        </div>
      }
      stage={
        <div ref={stageRef} className="scroll-mt-20 pb-28 lg:contents">
          <Button
            className="mb-3 w-full lg:hidden"
            variant="outline"
            onClick={() =>
              promptRef.current?.scrollIntoView({ block: 'start' })
            }
          >
            {t('backToEditor')}
          </Button>
          <StudioTagsStage
            panel={panel}
            onClose={() => onPanelChange(null)}
            templates={templates}
          />
        </div>
      }
    />
  )
}
