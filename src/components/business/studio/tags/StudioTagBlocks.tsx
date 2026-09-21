'use client'
import { useTranslations } from 'next-intl'
import { useStudioForm } from '@/contexts/studio-context'
import { useStudioGen } from '@/contexts/studio-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { X } from '@/components/icons'
import { PromptTemplatePicker } from '@/components/business/studio/PromptTemplatePicker'
import type { TagPromptBlock } from '@/types/tag-composer'

export function StudioTagBlocks() {
  const t = useTranslations('StudioTags.workbench')
  const { state, dispatch } = useStudioForm()
  const { isGenerating } = useStudioGen()
  const blocks = state.tagPromptBlocks ?? []
  const write = (payload: TagPromptBlock[]) => {
    if (!isGenerating) dispatch({ type: 'SET_TAG_PROMPT_BLOCKS', payload })
  }
  const add = (name = t('newBlock'), text = '') =>
    write([...blocks, { id: crypto.randomUUID(), name, text, enabled: true }])
  const update = (id: string, patch: Partial<TagPromptBlock>) =>
    write(
      blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)),
    )
  return (
    <section className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('blocksHint')}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={isGenerating}
          onClick={() => add()}
        >
          {t('addBlock')}
        </Button>
        <PromptTemplatePicker
          currentPrompt={state.prompt}
          currentOutputType="IMAGE"
          onApply={(recipe) =>
            add(recipe.name || t('newBlock'), recipe.compiledPrompt)
          }
        />
      </div>
      {blocks.map((block) => (
        <article
          key={block.id}
          className="space-y-3 rounded-lg border border-border p-3"
        >
          <div className="flex items-center gap-2">
            <Input
              aria-label={t('blockName')}
              maxLength={100}
              value={block.name}
              disabled={isGenerating}
              onChange={(e) => update(block.id, { name: e.target.value })}
            />
            <Switch
              aria-label={t('enableBlock', { name: block.name })}
              checked={block.enabled}
              disabled={isGenerating}
              onCheckedChange={(enabled) => update(block.id, { enabled })}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('removeBlock', { name: block.name })}
              disabled={isGenerating}
              onClick={() =>
                write(blocks.filter((item) => item.id !== block.id))
              }
            >
              <X className="size-4" />
            </Button>
          </div>
          <Textarea
            aria-label={t('blockText')}
            value={block.text}
            disabled={isGenerating}
            onChange={(e) => update(block.id, { text: e.target.value })}
          />
          <PromptTemplatePicker
            currentPrompt={block.text}
            currentOutputType="IMAGE"
            onApply={(recipe) =>
              update(block.id, {
                name: recipe.name || block.name,
                text: recipe.compiledPrompt,
              })
            }
          />
        </article>
      ))}
    </section>
  )
}
