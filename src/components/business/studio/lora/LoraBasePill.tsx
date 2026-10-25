'use client'

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { Check, ChevronDown } from '@/components/icons'
import {
  LORA_BASE_MODELS,
  getLoraBaseArchitectureGroup,
  type LoraBaseArchitectureGroup,
  type LoraBaseModel,
} from '@/constants/lora-base-models'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import {
  studioOutlineChipClass,
  studioOutlineChipOpenClass,
  studioToolPopoverBaseClass,
  useStudioChipPopoverMotion,
} from '@/components/business/studio-shared/primitives/tool-surface'
import { cn } from '@/lib/utils'

const GROUP_ORDER: readonly LoraBaseArchitectureGroup[] = ['sdxl', 'dit']

interface LoraBasePillProps {
  /** 兼容当前挂载的底模子集（没挂 LoRA 时 = 纯底模能出图的那一份）。 */
  compatibleBases: readonly LoraBaseModel[]
  selectedBase: LoraBaseModel | null
  onSelect: (id: string) => void
  /** 有挂载才有家族约束，「只看兼容的」开关才有意义。 */
  hasMountedLora: boolean
  /** 界面上那个名字（`spine.<translationKey>` 优先）。 */
  baseLabel: (base: LoraBaseModel) => string
  /** 列表最底下那一行（本月 Runner 剩余）。 */
  footer?: ReactNode
  disabled?: boolean
}

/**
 * 底模就是模型药丸（ui-spec ㊲）：点开和模型选择器同一种列表 —— 分 SDXL 系 / DiT 系，
 * 顶上「只看兼容的」开关，装不上的变淡写「装不上」，快出的标「快出」；兼容 = 同一家族
 * （`lora-base-models.ts`）。每行字母小方块 + 名字，选中那一行浅灰底 + 勾（㉓）。
 */
export function LoraBasePill({
  compatibleBases,
  selectedBase,
  onSelect,
  hasMountedLora,
  baseLabel,
  footer,
  disabled = false,
}: LoraBasePillProps) {
  const t = useTranslations('LoraWorkbench')
  const [open, setOpen] = useState(false)
  const [onlyCompatible, setOnlyCompatible] = useState(true)
  const motion = useStudioChipPopoverMotion({
    side: 'top',
    align: 'end',
    sideOffset: 8,
  })
  const compatibleIds = new Set(compatibleBases.map((base) => base.id))
  const showAll = hasMountedLora && !onlyCompatible
  const bases = showAll ? LORA_BASE_MODELS : compatibleBases
  const groups = GROUP_ORDER.map((group) => ({
    group,
    list: bases.filter(
      (base) => getLoraBaseArchitectureGroup(base.family) === group,
    ),
  })).filter(({ list }) => list.length > 0)

  if (compatibleBases.length === 0) {
    return (
      <span className={cn(studioOutlineChipClass, 'text-muted-foreground')}>
        {t('spine.baseModelPending')}
      </span>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          data-assistant-field="base"
          aria-label={`${t('spine.baseModel')} · ${
            selectedBase ? baseLabel(selectedBase) : ''
          }`}
          className={cn(
            studioOutlineChipClass,
            'max-w-56 text-foreground',
            open && studioOutlineChipOpenClass,
          )}
        >
          <span className="min-w-0 truncate">
            {selectedBase
              ? baseLabel(selectedBase)
              : t('spine.baseModelPending')}
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform duration-base ease-standard',
              open && 'rotate-180',
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        style={motion.style}
        className={cn(
          studioToolPopoverBaseClass,
          'flex max-h-120 w-80 flex-col p-1.5',
          motion.className,
        )}
      >
        {hasMountedLora ? (
          <label className="flex h-9 shrink-0 cursor-pointer items-center justify-between gap-2 border-b border-border/60 px-2.5 text-2sm text-foreground">
            {t('baseModal.onlyCompatible')}
            <Switch
              checked={onlyCompatible}
              onCheckedChange={setOnlyCompatible}
              aria-label={t('baseModal.onlyCompatible')}
            />
          </label>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
          {groups.map(({ group, list }) => (
            <section key={group} className="pt-1.5">
              <p className="px-2.5 pb-1 text-2xs text-muted-foreground">
                {group === 'dit'
                  ? t('spine.baseGroupDit')
                  : t('spine.baseGroupSdxl')}
              </p>
              {list.map((base) => {
                const selected = base.id === selectedBase?.id
                const incompatible = showAll && !compatibleIds.has(base.id)
                const name = baseLabel(base)
                return (
                  <button
                    key={base.id}
                    type="button"
                    disabled={!base.available}
                    aria-pressed={selected}
                    onClick={() => {
                      onSelect(base.id)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-2sm transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed',
                      selected ? 'bg-muted' : 'hover:bg-muted/60',
                      (incompatible || !base.available) &&
                        'text-muted-foreground',
                    )}
                  >
                    <span
                      aria-hidden
                      className="grid size-5.5 shrink-0 place-items-center rounded-sm bg-muted font-mono text-2xs font-semibold text-muted-foreground"
                    >
                      {name.charAt(0).toUpperCase()}
                    </span>
                    <span
                      className={cn(
                        'min-w-0 truncate',
                        selected && 'font-medium text-foreground',
                      )}
                    >
                      {name}
                    </span>
                    {base.distilled ? (
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-3xs text-muted-foreground">
                        {t('baseModal.fast')}
                      </span>
                    ) : null}
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {selected ? (
                        <Check
                          className="size-3.5 text-foreground"
                          aria-hidden
                        />
                      ) : !base.available ? (
                        t('spine.comingSoon')
                      ) : incompatible ? (
                        t('pill.incompatible')
                      ) : null}
                    </span>
                  </button>
                )
              })}
            </section>
          ))}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-border/60 px-2.5 pt-2 pb-1">
            {footer}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
