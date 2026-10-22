'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { Check } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { FavoriteLoraRequest } from '@/types'
import { useCharacterLorasContext } from '@/components/business/studio/lora/character-loras-context'
import { cn } from '@/lib/utils'

interface LoraCharactersSectionProps {
  /** 详情页当前这一版（与收藏同一份描述）：没收藏的第一次加到角色时服务端按它记一行。 */
  lora: FavoriteLoraRequest
  /** 右栏小标题的样式（与同栏别的段一致）。 */
  titleClassName: string
}

/**
 * LoRA 库详情右栏「角色」一段（角色③，owner 2026-10-22）：它属于哪些角色 +
 * 「加到角色…」。没收藏的也能加（加到角色≠收藏，不进「我的收藏」）。
 *
 * ⚠ 现阶段用现有弹层拼最简版本，统一样式留到 UI 地基「统一库组件 + 选择器」。
 */
export function LoraCharactersSection({
  lora,
  titleClassName,
}: LoraCharactersSectionProps) {
  const t = useTranslations('LoraWorkbench.characterLoras')
  const context = useCharacterLorasContext()
  const [open, setOpen] = useState(false)
  if (!context) return null

  const owners = context.charactersOf(lora.loraUrl)
  return (
    <section className="flex flex-col gap-2">
      <h5 className={titleClassName}>{t('sectionTitle')}</h5>
      {owners.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {owners.map((group) => (
            <span
              key={group.characterCardId}
              className="rounded-full bg-muted px-2 py-0.5 text-foreground/80"
            >
              {group.name}
            </span>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs text-muted-foreground transition-colors duration-fast ease-linear hover:text-foreground"
      >
        {t('addToCharacter')}
      </button>
      {open ? (
        <LoraCharactersDialog
          lora={lora}
          initialIds={owners.map((group) => group.characterCardId)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </section>
  )
}

function LoraCharactersDialog({
  lora,
  initialIds,
  onClose,
}: {
  lora: FavoriteLoraRequest
  initialIds: readonly string[]
  onClose: () => void
}) {
  const t = useTranslations('LoraWorkbench.characterLoras')
  const context = useCharacterLorasContext()
  const [picked, setPicked] = useState(() => new Set(initialIds))
  const [saving, setSaving] = useState(false)
  if (!context) return null
  const { groups, setLoraCharacters } = context

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const save = async () => {
    setSaving(true)
    const ok = await setLoraCharacters(lora, [...picked])
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex flex-col gap-3 sm:max-w-sm">
        <DialogTitle className="text-base">{t('addToCharacter')}</DialogTitle>
        {groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('noCharacters')}
          </p>
        ) : (
          <ul className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
            {groups.map((group) => {
              const on = picked.has(group.characterCardId)
              return (
                <li key={group.characterCardId}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(group.characterCardId)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-4 shrink-0 place-items-center rounded border',
                        on
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border',
                      )}
                    >
                      {on ? <Check className="size-3" /> : null}
                    </span>
                    <span className="min-w-0 truncate">{group.name}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button size="sm" disabled={saving} onClick={() => void save()}>
            {t('save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
