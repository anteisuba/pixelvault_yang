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
import { useAssistantPersona } from '@/hooks/use-assistant-persona'
import { useChatCharacters } from '@/hooks/use-chat-characters'
import {
  switchOperatorChatMode,
  useStudioOperatorState,
  type StudioOperatorChatRequest,
} from '@/hooks/use-studio-operator-store'
import { cn } from '@/lib/utils'

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

/**
 * 此刻陪你的那一位的头像：工作时 = 助手，在和角色聊 = 她。
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
  /** 头像本身（触发键）：由宿主给，位置、尺寸各处不同。 */
  children: ReactNode
  side: 'right'
  /** 换了人 / 点了自己之后（左栏那格用它把对话拉回来）。 */
  onPicked?: () => void
}

/**
 * 换谁陪你（用户 10-25 定 ② B + 「点角色 = 和她聊」；同日改定排法 C 菜单列表）：
 * 点头像弹一个菜单 —— 第一行工作助手，下面一行一个角色（头像 + 名字，角色多了顶上出搜索），
 * 点角色 = 这段对话切成和她聊，点助手 = 回到工作；现在是谁，头像套一圈。
 *
 * ⚠ 正在出字时换不了（`switchOperatorChatMode` 自己拦），这里不另判。
 */
export function StudioOperatorAvatarSwitcher({
  children,
  side,
  onPicked,
}: StudioOperatorAvatarSwitcherProps) {
  const t = useTranslations('StudioOperator')
  const [open, setOpen] = useState(false)
  const { chatCharacter } = useStudioOperatorState()
  const { persona } = useAssistantPersona()
  const characters = useChatCharacters(open)
  const assistantName = persona.name?.trim() || t('timeline.assistantFallback')

  const pick = (chat: StudioOperatorChatRequest | null) => {
    switchOperatorChatMode(chat ? chat.character : null)
    setOpen(false)
    onPicked?.()
  }

  // 角色多了（10-25 截图 13 个）才出搜索；少的时候一眼就看完。
  const searchable = characters.characters.length > SEARCH_THRESHOLD

  return (
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
              current={chatCharacter === null}
              onSelect={() => pick(null)}
              testId="operator-avatar-switch-assistant"
            >
              <AvatarDisc
                url={persona.avatarUrl}
                name={assistantName}
                assistantPreset={persona.avatarPreset ?? null}
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
                current={chat.character.id === chatCharacter?.id}
                onSelect={() => pick(chat)}
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
