'use client'

import { useTranslations } from 'next-intl'
import { ChevronRight, Plus } from '@/components/icons'

import { ROUTES } from '@/constants/routes'
import { useChatCharacters } from '@/hooks/use-chat-characters'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * 「她」那一页（10-26「更像真人」C 第 3 步）。2026-10-28 角色页改版 B 起，日记与「她改了什么」
 * 搬到角色页右栏「最近」（撤回只在那一处）；这里每个角色只留一行「在她的页里看 ›」。
 */
export function AssistantHerPane() {
  const t = useTranslations('AssistantSettings')
  const { characters, isLoading } = useChatCharacters(true)

  if (isLoading) return null
  if (characters.length === 0)
    return (
      <EmptyState
        icon={<Plus aria-hidden />}
        title={t('her.noCharacters')}
        description={t('her.noCharactersHint')}
        action={
          <Button asChild size="sm" className="rounded-full">
            <Link href={ROUTES.CARDS}>{t('her.createCharacter')}</Link>
          </Button>
        }
      />
    )

  return (
    <ul className="flex flex-col">
      {characters.map(({ character, avatarUrl }) => (
        <li key={character.id}>
          <Link
            href={`${ROUTES.CARDS}?character=${encodeURIComponent(character.id)}`}
            data-testid="assistant-her-row"
            className="flex h-12 items-center gap-3 rounded-10 px-2 transition-colors duration-fast hover:tint-hover focus-visible:shadow-focus focus-visible:outline-none"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="size-8 rounded-full object-cover"
              />
            ) : (
              <span className="size-8 rounded-full bg-muted" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate text-md font-medium">
              {character.name}
            </span>
            <span className="flex items-center gap-0.5 text-2sm text-muted-foreground">
              {t('her.openOnPage')}
              <ChevronRight className="size-3.5" aria-hidden />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
