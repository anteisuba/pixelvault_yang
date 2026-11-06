'use client'

/**
 * 镜头表「素材」那一格（H2a，owner 2026-11-07，`canvas-shotlist.md` 第 21–25 条）。
 *
 * 以图为主（第 25 条，owner 否掉「头像胶囊 + 文字菜单」那版）：
 * - 格子里一张方形缩略图 = 这一镜真实挂着的一项素材（`readShotMaterials`），右下角的小图标
 *   说它在这镜管什么（首帧 / 角色 / 场景 / 参考），配音是一块墨底波形；名字只在悬停时出现。
 *   首帧那张描墨边、角标反白；弹层开着的那张描 `highlight`（ui-spec：强调色只表示「选中了」）。
 * - 点缩略图 = 弹层：顶上大图，下面「首帧 / 参考」两个大按钮（首帧被占着时按钮右上角
 *   放占位者的小图，点了就对调），再下面一排同类素材点了就换，最底下两个图标：定位 · 移除。
 * - 「+」= 一格格全片素材，点哪张加哪张。
 *
 * ⛔ 这一层不编 op：回调交给 `ShotTable`，由它用 `shot-table-materials.ts` 的规划函数编好
 * 再发 —— 单测只看「点了哪个、传了谁」。
 */

import { useState, type ComponentType, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import {
  ArrowLeftRight,
  AudioLines,
  Clapperboard,
  Film,
  Locate,
  Mountain,
  Palette,
  Plus,
  Trash2,
  UserRound,
} from '@/components/icons'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import {
  firstFrameHolder,
  type ShotFilmMaterial,
  type ShotMaterialKindRole,
  type ShotMaterialRole,
  type ShotTableMaterial,
} from '@/lib/shot-table-materials'
import { cn } from '@/lib/utils'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

type MaterialSlot = 'firstFrame' | 'reference'

export interface ShotTableMaterialsCellProps {
  readonly shotNo: number
  readonly materials: readonly ShotTableMaterial[]
  /** 全片素材（「+」与「换一张」的候选）。 */
  readonly film: readonly ShotFilmMaterial[]
  onAdd(film: ShotFilmMaterial): void
  onRemove(material: ShotTableMaterial): void
  /** `holder` = 首帧现在是谁；选「首帧」时它在就对调（第 25 条）。 */
  onSlot(
    material: ShotTableMaterial,
    slot: MaterialSlot,
    holder?: ShotTableMaterial,
  ): void
  onReplace(material: ShotTableMaterial, film: ShotFilmMaterial): void
  onLocateSource(nodeId: string): void
}

type IconComponent = ComponentType<{ className?: string }>

/** 角标图标。配音不走角标（整格就是波形）。 */
const ROLE_ICON: Record<Exclude<ShotMaterialRole, 'voice'>, IconComponent> = {
  first: Clapperboard,
  character: UserRound,
  scene: Mountain,
  reference: Palette,
}

const sameSource = (
  a: Pick<ShotFilmMaterial, 'origin' | 'sourceId'>,
  b: Pick<ShotFilmMaterial, 'origin' | 'sourceId'>,
) => a.origin === b.origin && a.sourceId === b.sourceId

export function ShotTableMaterialsCell({
  shotNo,
  materials,
  film,
  onAdd,
  onRemove,
  onSlot,
  onReplace,
  onLocateSource,
}: ShotTableMaterialsCellProps) {
  const t = useTranslations('StudioNode.shotTable.materials')
  const [addOpen, setAddOpen] = useState(false)
  const holder = firstFrameHolder(materials)
  const addable = film.filter(
    (entry) => !materials.some((material) => sameSource(material, entry)),
  )
  return (
    <div
      className="flex w-64 flex-wrap gap-1.5"
      data-testid="shot-table-materials"
    >
      {materials.map((material) => (
        <MaterialTile
          key={material.key}
          shotNo={shotNo}
          material={material}
          holder={holder}
          candidates={film.filter(
            (entry) =>
              entry.mediaKind === material.mediaKind &&
              !materials.some((other) => sameSource(other, entry)),
          )}
          onRemove={() => onRemove(material)}
          onSlot={(slot) =>
            onSlot(
              material,
              slot,
              holder && holder.key !== material.key ? holder : undefined,
            )
          }
          onReplace={(entry) => onReplace(material, entry)}
          onLocate={() => onLocateSource(material.sourceId)}
        />
      ))}
      <Popover open={addOpen} onOpenChange={setAddOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="shot-table-material-add"
            aria-label={t('addTitle', { shotNo })}
            title={t('addTitle', { shotNo })}
            className={cn(
              'nodrag inline-flex size-11.5 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground transition-colors duration-fast hover:border-foreground hover:text-foreground',
              addOpen && 'border-highlight text-highlight',
            )}
          >
            <Plus className="size-4.5" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-48 p-2">
          {addable.length === 0 ? (
            <p className="px-1 py-1.5 text-xs text-muted-foreground">
              {t('filmEmpty')}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {addable.map((entry) => (
                <button
                  key={`${entry.origin}:${entry.sourceId}`}
                  type="button"
                  data-testid="shot-table-material-add-item"
                  data-source={entry.sourceId}
                  title={entry.name}
                  aria-label={entry.name}
                  onClick={() => {
                    onAdd(entry)
                    setAddOpen(false)
                  }}
                  className="relative aspect-square overflow-hidden rounded-lg transition-transform duration-fast hover:scale-103 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <TileFace item={entry} role={entry.kindRole} large />
                </button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}

function MaterialTile({
  shotNo,
  material,
  holder,
  candidates,
  onRemove,
  onSlot,
  onReplace,
  onLocate,
}: {
  readonly shotNo: number
  readonly material: ShotTableMaterial
  readonly holder?: ShotTableMaterial
  readonly candidates: readonly ShotFilmMaterial[]
  onRemove(): void
  onSlot(slot: MaterialSlot): void
  onReplace(film: ShotFilmMaterial): void
  onLocate(): void
}) {
  const t = useTranslations('StudioNode.shotTable.materials')
  const [open, setOpen] = useState(false)
  const isEdge = material.origin === 'edge'
  // 首帧槽只收图；语音、角色库人物都没有「换槽」这回事。
  const isImage = material.mediaKind === NODE_MEDIA_KIND_IDS.image
  const canSwapSlot = isEdge && isImage
  const isFirst = material.role === 'first'
  const swapWith = holder && holder.key !== material.key ? holder : undefined
  const roleLabel = t(`roles.${material.role}`)
  const pick = (run: () => void) => {
    run()
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="shot-table-material"
          data-role={material.role}
          data-source={material.sourceId}
          title={`${material.name} · ${roleLabel}`}
          aria-label={`${material.name} · ${roleLabel}`}
          className={cn(
            'nodrag relative size-11.5 shrink-0 overflow-hidden rounded-lg ring-offset-1 ring-offset-background transition-transform duration-fast hover:scale-105 focus-visible:outline-none',
            isFirst && 'ring-2 ring-foreground',
            open && 'ring-2 ring-highlight',
          )}
        >
          <TileFace item={material} role={material.role} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 overflow-hidden p-0"
        aria-label={t('inShot', { name: material.name, shotNo })}
      >
        <Hero item={material} />
        {canSwapSlot ? (
          <div className="grid grid-cols-2 gap-2 p-3">
            <SlotButton
              testId="shot-table-material-as-first"
              icon={Clapperboard}
              label={t('slotFirst')}
              active={isFirst}
              {...(swapWith ? { swapWith } : {})}
              swapLabel={
                swapWith ? t('swapWith', { name: swapWith.name }) : undefined
              }
              onClick={() => pick(() => onSlot('firstFrame'))}
            />
            <SlotButton
              testId="shot-table-material-as-reference"
              icon={
                ROLE_ICON[
                  material.kindRole === 'voice'
                    ? 'reference'
                    : material.kindRole
                ]
              }
              label={t(`roles.${material.kindRole}`)}
              active={!isFirst}
              onClick={() => pick(() => onSlot('reference'))}
            />
          </div>
        ) : null}
        {canSwapSlot && candidates.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 px-3 pb-3">
            {candidates.map((entry) => (
              <button
                key={`${entry.origin}:${entry.sourceId}`}
                type="button"
                data-testid="shot-table-material-replace-item"
                data-source={entry.sourceId}
                title={t('replaceWith', { name: entry.name })}
                aria-label={t('replaceWith', { name: entry.name })}
                onClick={() => pick(() => onReplace(entry))}
                className="relative size-13 overflow-hidden rounded-lg transition-transform duration-fast hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <TileFace item={entry} role={entry.kindRole} />
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
          {isEdge ? (
            <IconAction
              testId="shot-table-material-locate"
              label={t('locate')}
              onClick={() => pick(onLocate)}
            >
              <Locate className="size-4.5" aria-hidden />
            </IconAction>
          ) : (
            <span />
          )}
          <IconAction
            testId="shot-table-material-remove"
            label={t('remove')}
            destructive
            onClick={() => pick(onRemove)}
          >
            <Trash2 className="size-4.5" aria-hidden />
          </IconAction>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** 一格的脸：图（或墨底波形 / 胶片占位）+ 右下角管什么的小图标。 */
function TileFace({
  item,
  role,
  large,
}: {
  readonly item: Pick<ShotFilmMaterial, 'thumbUrl' | 'mediaKind'>
  readonly role: ShotMaterialRole | ShotMaterialKindRole
  readonly large?: boolean
}) {
  if (item.mediaKind === NODE_MEDIA_KIND_IDS.audio) {
    return (
      <span className="flex size-full items-center justify-center bg-foreground text-background">
        <AudioLines className={large ? 'size-7' : 'size-5'} aria-hidden />
      </span>
    )
  }
  const Icon = role === 'voice' ? undefined : ROLE_ICON[role]
  return (
    <>
      {item.thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- R2 产物直链，不走优化
        <img src={item.thumbUrl} alt="" className="size-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center bg-muted text-muted-foreground">
          <Film className="size-5" aria-hidden />
        </span>
      )}
      {Icon ? (
        <span
          className={cn(
            'absolute right-0.5 bottom-0.5 flex size-4.5 items-center justify-center rounded-md',
            role === 'first'
              ? 'bg-foreground text-background'
              : 'bg-media-chip text-on-media-chip',
          )}
        >
          <Icon className="size-3" aria-hidden />
        </span>
      ) : null}
    </>
  )
}

/** 弹层顶上的大图，名字压在图的左下角。 */
function Hero({
  item,
}: {
  readonly item: Pick<ShotFilmMaterial, 'thumbUrl' | 'mediaKind' | 'name'>
}) {
  const isAudio = item.mediaKind === NODE_MEDIA_KIND_IDS.audio
  return (
    <div className="relative aspect-video bg-foreground">
      {isAudio ? (
        <span className="flex size-full items-center justify-center text-background">
          <AudioLines className="size-10" aria-hidden />
        </span>
      ) : item.thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- R2 产物直链，不走优化
        <img src={item.thumbUrl} alt="" className="size-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center bg-muted text-muted-foreground">
          <Film className="size-8" aria-hidden />
        </span>
      )}
      <span className="absolute inset-x-2 bottom-2 flex">
        <span className="inline-flex h-6 min-w-0 items-center rounded-full bg-media-chip px-2.5 text-xs font-semibold text-on-media-chip">
          <span className="truncate">{item.name}</span>
        </span>
      </span>
    </div>
  )
}

function SlotButton({
  testId,
  icon: Icon,
  label,
  active,
  swapWith,
  swapLabel,
  onClick,
}: {
  readonly testId: string
  readonly icon: IconComponent
  readonly label: string
  readonly active: boolean
  readonly swapWith?: ShotTableMaterial
  readonly swapLabel?: string | undefined
  onClick(): void
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      title={swapLabel}
      aria-label={swapLabel ? `${label} · ${swapLabel}` : label}
      onClick={onClick}
      className={cn(
        'relative flex h-14 flex-col items-center justify-center gap-1 rounded-xl border text-sm font-semibold transition-colors duration-fast',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border text-foreground hover:border-foreground',
      )}
    >
      <Icon className="size-4.5" aria-hidden />
      {label}
      {swapWith ? (
        <span
          className="absolute top-1.5 right-1.5 flex items-center gap-1 text-muted-foreground"
          data-testid="shot-table-material-swap-with"
        >
          <ArrowLeftRight className="size-3" aria-hidden />
          <span className="size-5 overflow-hidden rounded-md ring-1 ring-border">
            {swapWith.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- R2 产物直链，不走优化
              <img
                src={swapWith.thumbUrl}
                alt=""
                className="size-full object-cover"
              />
            ) : null}
          </span>
        </span>
      ) : null}
    </button>
  )
}

function IconAction({
  testId,
  label,
  destructive,
  onClick,
  children,
}: {
  readonly testId: string
  readonly label: string
  readonly destructive?: boolean
  onClick(): void
  readonly children: ReactNode
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex size-9 items-center justify-center rounded-lg transition-colors duration-fast hover:bg-surface-fill',
        destructive ? 'text-destructive' : 'text-foreground',
      )}
    >
      {children}
    </button>
  )
}
