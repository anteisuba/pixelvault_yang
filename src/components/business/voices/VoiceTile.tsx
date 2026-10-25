'use client'

import { useTranslations } from 'next-intl'

import {
  ImagePlus,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
  UserRound,
} from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { VoiceAvatarButton } from '@/components/business/node/voice-library/VoiceAvatar'
import { cn } from '@/lib/utils'

/**
 * 音色库页的一张卡：大头像（点它就是试听）· 名字 · 一行来源 · 绑了哪些角色。
 *
 * 一张卡只有一个主动作（听），其余两样各占一个角：公开库是右上角的星（收藏），
 * 我的音色是右上角的「…」（改名 / 换头像 / 绑到角色 / 删除）。
 */

export interface VoiceTileActions {
  onRename(): void
  /** null = 绑着角色，头像用的是角色的，这里不给换。 */
  onChangeCover: (() => void) | null
  onBind(): void
  onDelete(): void
}

export interface VoiceTileProps {
  readonly name: string
  readonly cover: string | null
  readonly meta: string
  /** 绑着这副嗓子的角色名。 */
  readonly characters?: readonly string[]
  readonly playing: boolean
  readonly loading: boolean
  readonly progress: number
  readonly canPreview: boolean
  onPreview(): void
  readonly pending?: boolean
  /** 公开库：收藏星。 */
  readonly favorite?: { on: boolean; onToggle(): void }
  /** 我的音色：「…」菜单。 */
  readonly actions?: VoiceTileActions
}

export function VoiceTile({
  name,
  cover,
  meta,
  characters = [],
  playing,
  loading,
  progress,
  canPreview,
  onPreview,
  pending = false,
  favorite,
  actions,
}: VoiceTileProps) {
  const t = useTranslations('VoicesPage')

  return (
    <div className="relative flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-4 text-center">
      {favorite ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={pending}
          aria-pressed={favorite.on}
          aria-label={favorite.on ? t('unfavorite') : t('favorite')}
          title={favorite.on ? t('unfavorite') : t('favorite')}
          onClick={favorite.onToggle}
          className="absolute top-2 right-2 size-9 rounded-full"
        >
          {pending ? (
            <Spinner size="sm" />
          ) : (
            <Star
              weight={favorite.on ? 'fill' : 'bold'}
              className={cn(
                'size-4',
                favorite.on ? 'text-foreground' : 'text-muted-foreground',
              )}
            />
          )}
        </Button>
      ) : null}

      {actions ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={pending}
              aria-label={t('actions', { name })}
              className="absolute top-2 right-2 size-9 rounded-full text-muted-foreground"
            >
              {pending ? (
                <Spinner size="sm" />
              ) : (
                <MoreHorizontal className="size-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <VoiceTileMenuItems actions={actions} />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <VoiceAvatarButton
        cover={cover}
        fallback="letter"
        name={name}
        size="tile"
        playing={playing}
        loading={loading}
        progress={progress}
        disabled={!canPreview}
        ariaLabel={playing ? t('stopPreview') : t('preview')}
        onToggle={onPreview}
      />

      <div className="flex w-full min-w-0 flex-col gap-1">
        <span className="truncate text-sm font-medium" title={name}>
          {name}
        </span>
        <span className="truncate text-xs text-muted-foreground" title={meta}>
          {meta}
        </span>
        {characters.length > 0 ? (
          <span
            className="truncate text-xs text-foreground"
            title={characters.join('、')}
          >
            {t('boundTo', { names: characters.join('、') })}
          </span>
        ) : null}
      </div>
    </div>
  )
}

/** 我的音色那几样：改名 · 换头像 · 绑到角色 · 删除（库骨架的「更多」菜单也用这一份）。 */
export function VoiceTileMenuItems({ actions }: { actions: VoiceTileActions }) {
  const t = useTranslations('VoicesPage')
  return (
    <>
      <DropdownMenuItem onSelect={actions.onRename}>
        <Pencil aria-hidden />
        {t('rename')}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!actions.onChangeCover}
        onSelect={() => actions.onChangeCover?.()}
      >
        <ImagePlus aria-hidden />
        {actions.onChangeCover ? t('changeCover') : t('coverFromCharacter')}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={actions.onBind}>
        <UserRound aria-hidden />
        {t('bind')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={actions.onDelete}>
        <Trash2 aria-hidden />
        {t('delete')}
      </DropdownMenuItem>
    </>
  )
}
