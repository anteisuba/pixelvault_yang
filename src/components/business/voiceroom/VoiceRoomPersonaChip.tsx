'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import type { CharacterCardRecord } from '@/types'
import type { VoiceRoomCastMember } from '@/types/voiceroom'
import { Check, ChevronDown } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { CharacterSettingModule } from '@/components/business/cards/CharacterDetail'
import {
  draftFromCard,
  updateFromDraft,
} from '@/hooks/cards/use-character-card-editor'
import { updateCharacterCardAPI } from '@/lib/api-client/cards'
import { voicePersonaCard } from '@/lib/voice-avatar'

/**
 * 顶栏「人设：X ▾」（用户 10-25 选 B）：一直看得到这间房里她用的是哪张角色卡。
 *
 * ⭐ 人设就是角色卡（⛔ 不另起一种数据）：「换一张角色卡」只记在这一间的班底上
 *   （`characterCardId`），⛔ 不换嗓子；「改设定」就地开角色页那一块设定，改的是角色卡本身。
 * ⭐ 群里跟着底部选中的那位走（宿主传进来的 `member`）。
 */

interface VoiceRoomPersonaChipProps {
  /** 底部选中的那位（班底快照，带 `characterCardId`）。 */
  member: VoiceRoomCastMember
  characters: readonly CharacterCardRecord[]
  onPick: (characterCardId: string) => void
  /** 设定改完：角色库重拉一次，顶栏与头像跟着换。 */
  onEdited: () => void
}

export function VoiceRoomPersonaChip({
  member,
  characters,
  onPick,
  onEdited,
}: VoiceRoomPersonaChipProps) {
  const t = useTranslations('VoiceRoom')
  const [editing, setEditing] = useState(false)
  const persona = voicePersonaCard(member, characters)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="vr-chip vr-chip-persona"
            data-testid="voiceroom-persona"
          >
            <span className="vr-chip-persona-name">
              {persona
                ? t('personaChip', { name: persona.name })
                : t('personaNone')}
            </span>
            <ChevronDown aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-52">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {t('personaMenuTitle')}
          </DropdownMenuLabel>
          {persona ? (
            <DropdownMenuItem disabled className="opacity-100">
              <Check aria-hidden />
              {persona.name}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {t('personaSwitch')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
              {characters.length === 0 ? (
                <DropdownMenuItem disabled>
                  {t('personaNoCharacters')}
                </DropdownMenuItem>
              ) : (
                characters.map((card) => (
                  <DropdownMenuItem
                    key={card.id}
                    onSelect={() => onPick(card.id)}
                    data-current={card.id === persona?.id || undefined}
                  >
                    <span className="truncate">{card.name}</span>
                    {card.id === persona?.id ? (
                      <Check className="ml-auto" aria-hidden />
                    ) : null}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!persona}
            onSelect={() => setEditing(true)}
          >
            {t('personaEdit')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {persona ? (
        <ResponsiveDialog open={editing} onOpenChange={setEditing}>
          <ResponsiveDialogContent
            className="sm:max-w-3xl"
            aria-describedby={undefined}
          >
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>
                {t('personaEditTitle', { name: persona.name })}
              </ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
            <div className="max-h-160 overflow-y-auto px-1">
              <CharacterSettingModule
                card={persona}
                save={async (patch) => {
                  const result = await updateCharacterCardAPI(
                    persona.id,
                    updateFromDraft(persona, {
                      ...draftFromCard(persona),
                      ...patch,
                    }),
                  )
                  if (result.success) onEdited()
                  return result.success
                }}
              />
            </div>
          </ResponsiveDialogContent>
        </ResponsiveDialog>
      ) : null}
    </>
  )
}
