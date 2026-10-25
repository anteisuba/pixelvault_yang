'use client'

import { useState, type ReactNode } from 'react'
import Image from 'next/image'
import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { ASSISTANT_PERSONA_DEFAULTS } from '@/constants/assistant-persona'
import { ChevronLeft } from '@/components/icons'
import {
  AssistantAvatarGlyph,
  timelineInitials,
} from '@/components/business/studio/assistant-operator/AssistantAvatarGlyph'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAssistantPersona } from '@/hooks/use-assistant-persona'
import { useChatCharacters } from '@/hooks/use-chat-characters'
import {
  switchOperatorChatMode,
  useStudioOperatorState,
  type StudioOperatorChatRequest,
} from '@/hooks/use-studio-operator-store'
import { cn } from '@/lib/utils'

/** 收起 / 展开时飞来飞去的那一颗（对话头 ↔ 左栏最上面那格）。 */
export const STUDIO_ASSISTANT_AVATAR_LAYOUT_ID = 'studio-assistant-avatar'

const PICK_BUTTON_CLASS =
  'grid size-9 place-items-center overflow-hidden rounded-full transition-transform duration-fast ease-standard active:scale-96 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none'

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
 * `fly`：挂上飞行标记（对话头 ↔ 左栏那格同一颗，Motion `layoutId` 接力）。
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
  side: 'right' | 'bottom'
  /** 换了人 / 点了自己之后（左栏那格用它把对话拉回来）。 */
  onPicked?: () => void
  /** 开着台时对话头那颗：一排最下面多一颗「收起对话」。 */
  onCollapse?: () => void
}

/**
 * 换谁陪你（用户 10-25 定 ② B + 「点角色 = 和她聊」）：点头像弹出一排竖着的头像 ——
 * 第一颗是工作助手，下面是你的角色；点角色 = 这段对话切成和她聊，点助手 = 回到工作。
 * 现在是谁就套一圈。取代原来头部的「工作 / 聊天」切换与「和谁聊」列表。
 *
 * ⚠ 正在出字时换不了（`switchOperatorChatMode` 自己拦），这里不另判。
 */
export function StudioOperatorAvatarSwitcher({
  children,
  side,
  onPicked,
  onCollapse,
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side={side}
        align="start"
        sideOffset={8}
        className="w-auto rounded-full bg-transparent p-0 shadow-none"
      >
        <TooltipProvider>
          <nav
            aria-label={t('mode.pickCharacter')}
            data-testid="operator-avatar-switcher"
            className="flex max-h-(--radix-popover-content-available-height) flex-col gap-1 overflow-y-auto overscroll-contain rounded-full bg-raise p-1 shadow-soft scrollbar-none"
          >
            <PickItem
              label={assistantName}
              current={chatCharacter === null}
              onClick={() => pick(null)}
              testId="operator-avatar-switch-assistant"
            >
              <AvatarDisc
                url={persona.avatarUrl}
                name={assistantName}
                assistantPreset={persona.avatarPreset ?? null}
              />
            </PickItem>
            {characters.characters.map((chat) => (
              <PickItem
                key={chat.character.id}
                label={chat.character.name}
                current={chat.character.id === chatCharacter?.id}
                onClick={() => pick(chat)}
              >
                <AvatarDisc url={chat.avatarUrl} name={chat.character.name} />
              </PickItem>
            ))}
            {onCollapse ? (
              <PickItem
                label={t('collapse')}
                current={false}
                onClick={() => {
                  setOpen(false)
                  onCollapse()
                }}
                testId="operator-avatar-collapse"
              >
                <span className="grid size-full place-items-center rounded-full text-ink-2 hover:tint-hover [&>svg]:size-4.5">
                  <ChevronLeft />
                </span>
              </PickItem>
            ) : null}
          </nav>
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  )
}

function PickItem({
  label,
  current,
  onClick,
  testId,
  children,
}: {
  label: string
  current: boolean
  onClick: () => void
  testId?: string
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-current={current ? 'true' : undefined}
          data-testid={testId}
          onClick={onClick}
          className={cn(
            PICK_BUTTON_CLASS,
            current && 'ring-2 ring-foreground ring-offset-2 ring-offset-raise',
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}
