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
 * - 「+」= 一格格全片素材，点哪张加哪张（H2b 第 26 条）：拖进来还闲着的悬停出 ✕ 移出全片素材，
 *   正被某镜用的没有 ✕；最后一格「从画布 / 角色库拿」= 弹层换成两段大图格子（「画布上的」+
 *   「角色库」），点一张 = 加进这一镜（于是也进了全片素材）。
 * - 画布上点着一张素材时（`focusSourceId`），它在这格里的那张描 `highlight`。
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
  X,
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
  /** 全片素材（「+」与「换一张」的候选）；闲着的带 `idle`。 */
  readonly film: readonly ShotFilmMaterial[]
  /** 「从画布 / 角色库拿」的两段：还不在全片素材里的画布卡 / 角色库的人。 */
  readonly picks: {
    readonly canvas: readonly ShotFilmMaterial[]
    readonly library: readonly ShotFilmMaterial[]
  }
  /** 画布上点着的那张素材卡（它在这格里的那张描蓝边）。 */
  readonly focusSourceId?: string | null
  onAdd(film: ShotFilmMaterial): void
  /** 「+」里闲着的那张悬停出的 ✕：移出全片素材。 */
  onRemoveFromFilm(film: ShotFilmMaterial): void
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
  picks,
  focusSourceId = null,
  onAdd,
  onRemoveFromFilm,
  onRemove,
  onSlot,
  onReplace,
  onLocateSource,
}: ShotTableMaterialsCellProps) {
  const t = useTranslations('StudioNode.shotTable.materials')
  const [addOpen, setAddOpen] = useState(false)
  // 「从画布 / 角色库拿」那一屏；弹层关上就回到全片素材那一屏。
  const [picking, setPicking] = useState(false)
  const openAdd = (open: boolean) => {
    setAddOpen(open)
    if (!open) setPicking(false)
  }
  const add = (entry: ShotFilmMaterial) => {
    onAdd(entry)
    openAdd(false)
  }
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
          focused={
            material.origin === 'edge' && material.sourceId === focusSourceId
          }
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
      <Popover open={addOpen} onOpenChange={openAdd}>
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
        <PopoverContent align="start" className="w-auto p-2.5">
          {picking ? (
            <PickView shotNo={shotNo} picks={picks} onPick={add} />
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {addable.map((entry) => (
                <div
                  key={`${entry.origin}:${entry.sourceId}`}
                  className="group relative size-16"
                >
                  <button
                    type="button"
                    data-testid="shot-table-material-add-item"
                    data-source={entry.sourceId}
                    data-idle={entry.idle ? 'true' : undefined}
                    title={entry.name}
                    aria-label={entry.name}
                    onClick={() => add(entry)}
                    className="relative size-full overflow-hidden rounded-lg transition-transform duration-fast hover:scale-103 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <TileFace item={entry} role={entry.kindRole} large />
                  </button>
                  {entry.idle ? (
                    <button
                      type="button"
                      data-testid="shot-table-material-film-remove"
                      data-source={entry.sourceId}
                      aria-label={t('removeFromFilm', { name: entry.name })}
                      title={t('removeFromFilm', { name: entry.name })}
                      onClick={() => onRemoveFromFilm(entry)}
                      className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border-2 border-popover bg-foreground text-background opacity-0 transition-opacity duration-fast group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                data-testid="shot-table-material-pick-more"
                onClick={() => setPicking(true)}
                className="flex size-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border px-1 text-center text-3xs leading-tight text-muted-foreground transition-colors duration-fast hover:border-highlight hover:bg-highlight-soft hover:text-highlight"
              >
                <Plus className="size-4" aria-hidden />
                <span>{t.rich('pickMore', { br: () => <br /> })}</span>
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}

/**
 * 「从画布 / 角色库拿」那一屏：两段大图格子，点一张 = 加进这一镜。
 * 格子下面写名字（owner 2026-11-07）：角色库里同一个人常有几张同封面的卡，只看图分不出。
 */
function PickView({
  shotNo,
  picks,
  onPick,
}: {
  readonly shotNo: number
  readonly picks: ShotTableMaterialsCellProps['picks']
  onPick(entry: ShotFilmMaterial): void
}) {
  const t = useTranslations('StudioNode.shotTable.materials')
  const sections = [
    { id: 'canvas', label: t('pickCanvas'), items: picks.canvas },
    { id: 'library', label: t('pickLibrary'), items: picks.library },
  ].filter((section) => section.items.length > 0)
  return (
    <div className="w-38" data-testid="shot-table-material-picks">
      {sections.length === 0 ? (
        <p className="py-1 text-xs text-muted-foreground">{t('pickEmpty')}</p>
      ) : (
        sections.map((section, index) => (
          <section
            key={section.id}
            data-testid={`shot-table-material-picks-${section.id}`}
            className={cn(index > 0 && 'mt-2.5')}
          >
            <h4 className="mb-1.5 text-xs font-bold">{section.label}</h4>
            <div className="grid grid-cols-2 gap-2">
              {section.items.map((entry) => (
                <button
                  key={`${entry.origin}:${entry.sourceId}`}
                  type="button"
                  data-testid="shot-table-material-pick"
                  data-source={entry.sourceId}
                  title={t('pickAdd', { name: entry.name, shotNo })}
                  aria-label={t('pickAdd', { name: entry.name, shotNo })}
                  onClick={() => onPick(entry)}
                  className="group flex w-18 flex-col gap-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="relative block size-18 overflow-hidden rounded-lg transition-transform duration-fast group-hover:scale-103">
                    <TileFace item={entry} role={entry.kindRole} large />
                  </span>
                  <span
                    data-testid="shot-table-material-pick-name"
                    className="truncate text-2xs leading-tight text-muted-foreground group-hover:text-foreground"
                  >
                    {entry.name}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function MaterialTile({
  shotNo,
  material,
  focused,
  holder,
  candidates,
  onRemove,
  onSlot,
  onReplace,
  onLocate,
}: {
  readonly shotNo: number
  readonly material: ShotTableMaterial
  readonly focused: boolean
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
          data-focused={focused ? 'true' : undefined}
          title={`${material.name} · ${roleLabel}`}
          aria-label={`${material.name} · ${roleLabel}`}
          className={cn(
            'nodrag relative size-11.5 shrink-0 overflow-hidden rounded-lg ring-offset-1 ring-offset-background transition-transform duration-fast hover:scale-105 focus-visible:outline-none',
            isFirst && 'ring-2 ring-foreground',
            (open || focused) && 'ring-2 ring-highlight',
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
