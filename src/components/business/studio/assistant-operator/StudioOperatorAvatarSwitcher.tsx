'use client'

import { useState, type ReactNode } from 'react'
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
import { ROUTES } from '@/constants/routes'
import { useAssistantPersona } from '@/hooks/use-assistant-persona'
import { useChatCharacters } from '@/hooks/use-chat-characters'
import { useOpenPersonaChat } from '@/hooks/use-chat-persona'
import { useStudioOperatorActions } from '@/hooks/use-studio-operator-actions'
import { useStudioOperatorState } from '@/hooks/use-studio-operator-store'
import { usePathname } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/** 收起 / 展开时飞来飞去的那一颗（对话头 ↔ 台左上角）。 */
export const STUDIO_ASSISTANT_AVATAR_LAYOUT_ID = 'studio-assistant-avatar'

/** 角色超过这么多才在列表顶上出搜索。 */
const SEARCH_THRESHOLD = 8

/** 平圆灰底（ui-spec ㉗）：有图铺图，没图写首字；助手没传图用默认那一款。 */
export function AvatarDisc({
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

/** 几个人的那一组（群）：头像叠两颗（左栏「聊天」里群那一行用它）。 */
export function GroupDisc({
  members,
}: {
  members: readonly { name: string; coverImage?: string | null }[]
}) {
  const [first, second] = members
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
 * 此刻陪你的那一位的头像 = 全局助手（用户 10-25：头像菜单点谁，助手就是谁；「聊天」也跟着它）。
 * 正看着以前的聊天（只读）时画那个角色。
 * `fly`：挂上飞行标记（对话头 ↔ 台左上角同一颗，Motion `layoutId` 接力）。
 */
export function StudioOperatorCurrentAvatar({ fly }: { fly: boolean }) {
  const { chatCharacter } = useStudioOperatorState()
  const { persona } = useAssistantPersona()
  const characters = useChatCharacters(chatCharacter !== null)
  const assistantName = persona.name ?? ''
  const chat = chatCharacter
    ? characters.characters.find(
        (item) => item.character.id === chatCharacter.id,
      )
    : undefined
  const disc = chatCharacter ? (
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
  /** 头像 + 名字 ▾（触发键）：对话头那一颗。 */
  children: ReactNode
}

/**
 * 换助手人设（用户 10-25 定 A）：点头像弹一个菜单 —— 第一行默认助手，下面一行一个角色（头像 + 名字，
 * 角色多了顶上出搜索）。点谁 = 全局助手换成谁（头像 + 名字 + 口吻，`withAssistantCharacter`，角色页
 * 「设为助手人设」同一份），对话不断、工具照旧；正在「聊天」里就换到和她的聊天。现在是谁，头像套一圈。
 *
 * ⛔ 不再进配音间、不列群：聊天记录在对话头「聊天」那颗里（只列现在这一位的）。
 */
export function StudioOperatorAvatarSwitcher({
  children,
}: StudioOperatorAvatarSwitcherProps) {
  const t = useTranslations('StudioOperator')
  const [open, setOpen] = useState(false)
  const { persona } = useAssistantPersona()
  const characters = useChatCharacters(open)
  const { chatCharacter } = useStudioOperatorState()
  const operatorActions = useStudioOperatorActions()
  const personaChat = useOpenPersonaChat()
  const pathname = usePathname()
  const currentId = persona.character?.id ?? null
  const inChat = pathname.startsWith(ROUTES.STUDIO_AUDIO)

  const pick = (characterCardId: string | null, voiceCardId: string | null) => {
    // 正看着以前的聊天（只读）→ 开一段新的工作对话。
    if (chatCharacter && !inChat) operatorActions?.newThread()
    setOpen(false)
    if (characterCardId === currentId) return
    void personaChat.switchTo(characterCardId, {
      voiceCardId,
      openChat: inChat,
    })
  }

  // 角色多了（10-25 截图 13 个）才出搜索；少的时候一眼就看完。
  const searchable = characters.characters.length > SEARCH_THRESHOLD

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="bottom"
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
              label={t('mode.defaultAssistant')}
              current={currentId === null}
              onSelect={() => pick(null, null)}
              testId="operator-avatar-switch-assistant"
            >
              <AvatarDisc
                url={currentId === null ? persona.avatarUrl : null}
                name={t('mode.defaultAssistant')}
                assistantPreset={
                  currentId === null ? (persona.avatarPreset ?? null) : null
                }
              />
            </PickItem>
            {characters.characters.length > 0 ? (
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
                current={currentId === chat.character.id}
                onSelect={() => pick(chat.character.id, chat.voiceCardId)}
              >
                <AvatarDisc url={chat.avatarUrl} name={chat.character.name} />
              </PickItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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
