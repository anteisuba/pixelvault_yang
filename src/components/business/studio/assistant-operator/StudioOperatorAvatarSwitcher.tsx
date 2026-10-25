'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { ASSISTANT_PERSONA_DEFAULTS } from '@/constants/assistant-persona'
import {
  AssistantAvatarGlyph,
  timelineInitials,
} from '@/components/business/studio/assistant-operator/AssistantAvatarGlyph'
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { VoicePickerDialog } from '@/components/business/voices/VoicePickerDialog'
import { ROUTES, voiceRoomPath } from '@/constants/routes'
import { useAssistantPersona } from '@/hooks/use-assistant-persona'
import { useChatCharacters } from '@/hooks/use-chat-characters'
import { useOpenCharacterRoom } from '@/hooks/use-open-character-room'
import { useShellVoiceRooms } from '@/hooks/use-shell-voice-rooms'
import { useStudioOperatorActions } from '@/hooks/use-studio-operator-actions'
import { useStudioOperatorState } from '@/hooks/use-studio-operator-store'
import { usePathname, useRouter } from '@/i18n/navigation'
import { voiceRoomCastKey } from '@/lib/voiceroom-cast'
import { cn } from '@/lib/utils'
import type { VoiceRoomRecord } from '@/types/voiceroom'

/** 收起 / 展开时飞来飞去的那一颗（对话头 ↔ 台左上角）。 */
export const STUDIO_ASSISTANT_AVATAR_LAYOUT_ID = 'studio-assistant-avatar'

/** 角色超过这么多才在列表顶上出搜索。 */
const SEARCH_THRESHOLD = 8

/** 平圆灰底（ui-spec ㉗）：有图铺图，没图写首字；助手没传图用默认那一款。 */
function AvatarDisc({
  url,
  name,
  assistantPreset,
}: {
  url: string | null | undefined
  name: string
  /** 给了 = 这是助手那一颗（没图时画助手的图标而不是首字）。 */
  assistantPreset?: string | null
}) {
  return (
    <span className="grid size-full place-items-center overflow-hidden rounded-full bg-muted text-xs font-medium text-foreground">
      {url ? (
        <Image
          src={url}
          alt=""
          width={64}
          height={64}
          unoptimized
          loading="eager"
          decoding="sync"
          className="size-full object-cover"
        />
      ) : assistantPreset !== undefined ? (
        <AssistantAvatarGlyph
          presetId={assistantPreset ?? ASSISTANT_PERSONA_DEFAULTS.avatarPreset}
        />
      ) : (
        timelineInitials(name)
      )}
    </span>
  )
}

/** 配音间开着的那一间（不在配音间 = null）：最上面那格此刻画的就是这一组人。 */
function useActiveVoiceRoom(): VoiceRoomRecord | null {
  const { rooms, activeRoomId } = useShellVoiceRooms()
  return activeRoomId
    ? (rooms.find((room) => room.id === activeRoomId) ?? null)
    : null
}

/** 几个人的那一组（群）：头像叠两颗。 */
function GroupDisc({ room }: { room: VoiceRoomRecord }) {
  const [first, second] = room.cast
  return (
    <span className="relative block size-full">
      <span className="absolute top-0 left-0 size-2/3">
        <AvatarDisc url={first?.coverImage} name={first?.name ?? '?'} />
      </span>
      <span className="absolute right-0 bottom-0 size-2/3 rounded-full ring-2 ring-popover">
        <AvatarDisc url={second?.coverImage} name={second?.name ?? '?'} />
      </span>
    </span>
  )
}

/**
 * 此刻陪你的那一位的头像：工作时 = 助手，在配音间 = 那一间的人（几个人 = 叠两颗）。
 * `fly`：挂上飞行标记（对话头 ↔ 台左上角同一颗，Motion `layoutId` 接力）。
 */
export function StudioOperatorCurrentAvatar({ fly }: { fly: boolean }) {
  const { chatCharacter } = useStudioOperatorState()
  const { persona } = useAssistantPersona()
  const characters = useChatCharacters(chatCharacter !== null)
  const activeRoom = useActiveVoiceRoom()
  const assistantName = persona.name ?? ''
  const chat = chatCharacter
    ? characters.characters.find(
        (item) => item.character.id === chatCharacter.id,
      )
    : undefined
  const roomVoices =
    activeRoom?.cast.filter((member) => member.kind === 'voice') ?? []
  const disc = activeRoom ? (
    roomVoices.length > 1 ? (
      <GroupDisc room={{ ...activeRoom, cast: roomVoices }} />
    ) : (
      <AvatarDisc
        url={roomVoices[0]?.coverImage}
        name={roomVoices[0]?.name ?? activeRoom.name ?? '?'}
      />
    )
  ) : chatCharacter ? (
    <AvatarDisc url={chat?.avatarUrl} name={chatCharacter.name} />
  ) : (
    <AvatarDisc
      url={persona.avatarUrl}
      name={assistantName}
      assistantPreset={persona.avatarPreset ?? null}
    />
  )
  if (!fly) return <span className="block size-full">{disc}</span>
  return (
    <motion.span
      layoutId={STUDIO_ASSISTANT_AVATAR_LAYOUT_ID}
      className="block size-full"
    >
      {disc}
    </motion.span>
  )
}

interface StudioOperatorAvatarSwitcherProps {
  /** 头像本身（触发键）：由宿主给，位置、尺寸各处不同。 */
  children: ReactNode
  side: 'right'
  /** 换了人 / 点了自己之后（左栏那格用它把对话拉回来）。 */
  onPicked?: () => void
}

/**
 * 换谁陪你（用户 10-25 定 ② B；同日改定排法 C 菜单列表）：点头像弹一个菜单 —— 第一行工作助手，
 * 下面一行一个角色（头像 + 名字，角色多了顶上出搜索），再下面是几个人的群（开过的多人配音间）。
 *
 * 用户 10-25 去掉聊天模式：点角色 = 进她的配音间（`useOpenCharacterRoom`，没绑音色先挑一副）；
 * 点群 = 进那一组最近那一段；点助手 = 回到工作（在配音间就回首页）。⛔ 没有对话列表 ——
 * 先在这里选人，再在对话顶上标题 ▾ 选和这个人的哪一段。现在是谁，头像套一圈。
 */
export function StudioOperatorAvatarSwitcher({
  children,
  side,
  onPicked,
}: StudioOperatorAvatarSwitcherProps) {
  const t = useTranslations('StudioOperator')
  const [open, setOpen] = useState(false)
  const { persona } = useAssistantPersona()
  const characters = useChatCharacters(open)
  const { rooms } = useShellVoiceRooms()
  const { chatCharacter } = useStudioOperatorState()
  const operatorActions = useStudioOperatorActions()
  const activeRoom = useActiveVoiceRoom()
  const characterRoom = useOpenCharacterRoom()
  const router = useRouter()
  const pathname = usePathname()
  const assistantName = persona.name?.trim() || t('timeline.assistantFallback')
  const activeKey = activeRoom ? voiceRoomCastKey(activeRoom.cast) : null

  /** 群 = 开过的多人配音间，一组人一行（最近那一段）。 */
  const groups = useMemo(() => {
    const latest = new Map<string, VoiceRoomRecord>()
    for (const room of [...rooms].sort((x, y) =>
      y.updatedAt.localeCompare(x.updatedAt),
    )) {
      const voices = room.cast.filter((member) => member.kind === 'voice')
      const key = voiceRoomCastKey(room.cast)
      if (voices.length > 1 && !latest.has(key))
        latest.set(key, { ...room, cast: voices })
    }
    return [...latest.entries()]
  }, [rooms])

  const close = () => {
    setOpen(false)
    onPicked?.()
  }

  const pickAssistant = () => {
    // 正看着以前的聊天（只读）→ 开一段新的工作对话。
    if (chatCharacter) operatorActions?.newThread()
    if (pathname.startsWith(ROUTES.STUDIO_AUDIO)) router.push(ROUTES.STUDIO)
    close()
  }

  // 角色多了（10-25 截图 13 个）才出搜索；少的时候一眼就看完。
  const searchable = characters.characters.length > SEARCH_THRESHOLD

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent
          side={side}
          align="start"
          sideOffset={8}
          className="w-60 p-0"
        >
          <Command
            aria-label={t('mode.pickCharacter')}
            data-testid="operator-avatar-switcher"
            className="max-h-(--radix-popover-content-available-height)"
          >
            <CommandList className="max-h-none flex-1 p-1.5">
              <PickItem
                value="__assistant"
                label={assistantName}
                current={activeRoom === null}
                onSelect={pickAssistant}
                testId="operator-avatar-switch-assistant"
              >
                <AvatarDisc
                  url={persona.avatarUrl}
                  name={assistantName}
                  assistantPreset={persona.avatarPreset ?? null}
                />
              </PickItem>
              {characters.characters.length > 0 || groups.length > 0 ? (
                <CommandSeparator className="mx-0 my-1.5" />
              ) : null}
              {searchable ? (
                <CommandInput placeholder={t('mode.searchCharacter')} />
              ) : null}
              {characters.characters.map((chat) => (
                <PickItem
                  key={chat.character.id}
                  value={`${chat.character.name} ${chat.character.id}`}
                  label={chat.character.name}
                  current={
                    chat.voiceCardId !== null && activeKey === chat.voiceCardId
                  }
                  onSelect={() => {
                    void characterRoom.open(chat)
                    close()
                  }}
                >
                  <AvatarDisc url={chat.avatarUrl} name={chat.character.name} />
                </PickItem>
              ))}
              {groups.map(([key, room]) => {
                const label = room.cast.map((member) => member.name).join(' · ')
                return (
                  <PickItem
                    key={key}
                    value={`${label} ${key}`}
                    label={label}
                    current={activeKey === key}
                    onSelect={() => {
                      router.push(voiceRoomPath(room.id))
                      close()
                    }}
                    testId="operator-avatar-switch-group"
                  >
                    <GroupDisc room={room} />
                  </PickItem>
                )
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <VoicePickerDialog
        open={characterRoom.needsVoice !== null}
        onOpenChange={(next) => {
          if (!next) characterRoom.cancelVoice()
        }}
        onPick={(card) => void characterRoom.bindVoiceAndOpen(card.id)}
      />
    </>
  )
}

/** 菜单一行（ui-spec §9 菜单）：头像 32 + 名字；现在是谁，头像套一圈（㉗）。 */
function PickItem({
  value,
  label,
  current,
  onSelect,
  testId,
  children,
}: {
  value: string
  label: string
  current: boolean
  onSelect: () => void
  testId?: string
  children: ReactNode
}) {
  return (
    <CommandItem
      value={value}
      keywords={[label]}
      aria-current={current ? 'true' : undefined}
      data-testid={testId}
      onSelect={onSelect}
      className="h-10 px-1.5"
    >
      <span
        className={cn(
          'size-8 shrink-0 rounded-full',
          current && 'ring-2 ring-foreground ring-offset-2 ring-offset-popover',
        )}
      >
        {children}
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </CommandItem>
  )
}
