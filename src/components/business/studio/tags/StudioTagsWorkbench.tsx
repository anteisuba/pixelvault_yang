'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { StudioWorkbenchLayout } from '@/components/business/studio-shared/chrome/StudioWorkbenchLayout'
import { StudioCanvas } from '@/components/business/studio-shared/chrome/StudioCanvas'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useStudioForm, useStudioGen } from '@/contexts/studio-context'
import { useNovelAiCharacters } from '@/hooks/use-novelai-characters'
import { StudioTagsPromptArea } from './StudioTagsPromptArea'
import { StudioTagsComposer } from './StudioTagsComposer'
import { NovelAiCharacterComposer } from './NovelAiCharacterComposer'
import { StudioDanbooruPanel } from './StudioDanbooruPanel'
import { StudioTagBlocks } from './StudioTagBlocks'

export type TagWorkbenchPanel = 'composition' | 'catalog' | 'blocks'

interface StudioTagsWorkbenchProps {
  /**
   * `columns` = 参数栏 + 结果区（手机那一版照旧）。
   * `bottom` = 桌面：舞台在上 + 底部输入框（owner 2026-09-26，与自然语言台同一副
   * 骨架）；查资料 / 构图 / 提示词块三块面板开在舞台上。
   */
  layout?: 'columns' | 'bottom'
  /** `bottom` 布局舞台上方那一行（标题 + 写法切换），宿主给。 */
  header?: ReactNode
}

export function StudioTagsWorkbench({
  layout = 'columns',
  header,
}: StudioTagsWorkbenchProps = {}) {
  const t = useTranslations('StudioTags.workbench')
  const { state } = useStudioForm()
  const [panel, setPanel] = useState<TagWorkbenchPanel | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const promptRef = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (panel) {
      heading.current?.focus({ preventScroll: true })
      heading.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [panel])
  const trigger = useRef<HTMLElement | null>(null)
  const c = useNovelAiCharacters()
  const { isGenerating } = useStudioGen()
  const open = (value: TagWorkbenchPanel) => {
    trigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setPanel(value)
  }
  const close = () => {
    setPanel(null)
    trigger.current?.focus()
  }
  const panelSection = panel ? (
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
        <h2 ref={heading} tabIndex={-1} className="text-base font-medium">
          {t(panel)}
        </h2>
        <Button variant="outline" size="sm" onClick={close}>
          {t('backToResults')}
        </Button>
      </div>
      {panel === 'catalog' ? (
        <StudioDanbooruPanel />
      ) : panel === 'blocks' ? (
        <>
          <StudioTagBlocks />
          {/* 底部输入框没有地方放「最终画面提示词」—— 挪到这块面板里。 */}
          {layout === 'bottom' ? (
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
  ) : null

  if (layout === 'bottom') {
    return (
      <StudioWorkbenchLayout
        layout="bottom"
        header={header}
        params={<StudioTagsComposer onOpenPanel={open} />}
        stage={
          <>
            {/* 参考图住在输入框的附件行里，舞台只放结果（与自然语言台同一条）。 */}
            <div className={panel ? 'hidden' : 'contents'}>
              <StudioCanvas referenceRail={false} />
            </div>
            {panelSection}
          </>
        }
      />
    )
  }

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
          <StudioTagsPromptArea onOpenPanel={open} />
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
          <div className={panel ? 'hidden' : 'contents'}>
            <StudioCanvas />
          </div>
          {panelSection}
        </div>
      }
    />
  )
}
