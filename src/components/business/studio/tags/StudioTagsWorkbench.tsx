'use client'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { StudioWorkbenchLayout } from '@/components/business/studio-shared/chrome/StudioWorkbenchLayout'
import { StudioCanvas } from '@/components/business/studio-shared/chrome/StudioCanvas'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useStudioGen } from '@/contexts/studio-context'
import { useNovelAiCharacters } from '@/hooks/use-novelai-characters'
import { StudioTagsPromptArea } from './StudioTagsPromptArea'
import { NovelAiCharacterComposer } from './NovelAiCharacterComposer'
import { StudioDanbooruPanel } from './StudioDanbooruPanel'
import { StudioTagBlocks } from './StudioTagBlocks'

export type TagWorkbenchPanel = 'composition' | 'catalog' | 'blocks'
export function StudioTagsWorkbench() {
  const t = useTranslations('StudioTags.workbench')
  const [panel, setPanel] = useState<TagWorkbenchPanel | null>(null)
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
  return (
    <StudioWorkbenchLayout
      paramsWidthClass="lg:w-105"
      params={<StudioTagsPromptArea onOpenPanel={open} />}
      stage={
        <>
          <div className={panel ? 'hidden' : 'contents'}>
            <StudioCanvas />
          </div>
          {panel ? (
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
                <h2
                  ref={heading}
                  tabIndex={-1}
                  className="text-base font-medium"
                >
                  {t(panel)}
                </h2>
                <Button variant="outline" size="sm" onClick={close}>
                  {t('backToResults')}
                </Button>
              </div>
              {panel === 'catalog' ? (
                <StudioDanbooruPanel />
              ) : panel === 'blocks' ? (
                <StudioTagBlocks />
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
                  <NovelAiCharacterComposer
                    mode={c.mode}
                    maxCharacters={c.max}
                    value={c.layout}
                    activeIndex={c.activeIndex}
                    disabled={isGenerating}
                    onChange={c.setLayout}
                    onSelect={c.select}
                  />
                </>
              ) : null}
            </section>
          ) : null}
        </>
      }
    />
  )
}
