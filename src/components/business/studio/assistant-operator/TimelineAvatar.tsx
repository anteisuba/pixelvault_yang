'use client'

/**
 * 时间线沟里那颗 20px 头像（方向 C · `pages/assistant-shell.md` §11.3）。
 *
 * ⭐ **只有会说话的两方用头像**：用户回合 = 账户头像，助手回合 = AI 头像。
 * 工具步 / 系统行 / 卡片仍是形状节点 —— 20 行下来全是同款小圆点，用户回合与
 * 助手回合就只能靠缩进猜（§2.22）。
 *
 * ⚠ **用户头像源是 `useMyProfile()` 的 `avatarUrl`**，⛔ 面板内不另调 Clerk 的
 * `useUser()`：Clerk 的 `imageUrl` 只在首次入库时同步进 `User.avatarUrl`
 * （`services/user.service.ts`），之后可被自传头像覆盖 —— 两个真相源在用户换过
 * 头像之后会各说各话。
 *
 * ⚠ 没头像就是**首字母圆标**这一档，⛔ 不出破图也不出骨架屏（§3.4）。
 * ⚠ 20px 不在 `components/ui/avatar.tsx` 的三档（24/32/40）里，本轮**不为它改
 * 共享原语**（§11.3 明写）—— 这几行自己写。
 */

import Image from 'next/image'

import { useMyProfile } from '@/hooks/use-my-profile'
import { cn } from '@/lib/utils'

/**
 * 助手的默认头像 —— 黑底白星。
 *
 * ⚠ 内联 SVG 而不是图片文件：它跟着 `--primary` / `--primary-foreground` 走，
 * 换主题不用换资源；persona 自定义头像是后续切片的事（§8），这一颗是那之前的
 * 唯一一档，⛔ 不留「暂时用个 emoji」的过渡形态。
 */
function AssistantGlyph() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-full bg-primary text-primary-foreground"
      aria-hidden
    >
      <path
        d="M10 3.4l1.5 3.6 3.6 1.5-3.6 1.5L10 13.6 8.5 10 4.9 8.5l3.6-1.5L10 3.4z"
        fill="currentColor"
      />
    </svg>
  )
}

/**
 * 首字母圆标的文字。
 *
 * ⚠ 取两位（`FL` 式），中日文取一个字 —— 同
 * `components/business/ProfileHeader.tsx` 的取法，本轮扩到两位（§11.3）。
 * ⚠ `Array.from` 而不是 `slice(0,2)`：`slice` 按 UTF-16 码元切，emoji 或某些
 * CJK 扩展字会被劈成半个字符然后渲染成豆腐块。
 */
export function timelineInitials(name: string): string {
  const chars = Array.from(name.trim())
  if (chars.length === 0) return '?'
  // CJK 一个字已经够认人了，两个字反而挤不下 20px。
  const isCjk = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(chars[0] ?? '')
  return chars
    .slice(0, isCjk ? 1 : 2)
    .join('')
    .toUpperCase()
}

interface TimelineAvatarProps {
  /** 谁在说话 —— 用户回合读账户头像，助手回合画默认 AI 头像。 */
  speaker: 'user' | 'assistant'
  className?: string
}

export function TimelineAvatar({ speaker, className }: TimelineAvatarProps) {
  const { profile } = useMyProfile()

  const shell = cn(
    // ⚠ `ring-card` 而不是 `ring-background`：头像盖在贯穿竖线上，而那条线画在
    //   面板的 `bg-card` 上 —— 用 background 会在卡片底上留一圈更白的环。
    'grid size-5 shrink-0 place-items-center overflow-hidden rounded-full bg-muted ring-2 ring-card',
    className,
  )

  if (speaker === 'assistant') {
    return (
      <span
        data-testid="operator-timeline-avatar"
        data-speaker="assistant"
        className={shell}
      >
        <AssistantGlyph />
      </span>
    )
  }

  const name = profile?.displayName ?? profile?.username ?? ''

  return (
    <span
      data-testid="operator-timeline-avatar"
      data-speaker="user"
      className={shell}
    >
      {profile?.avatarUrl ? (
        <Image
          src={profile.avatarUrl}
          alt=""
          width={40}
          height={40}
          unoptimized
          className="size-full object-cover"
        />
      ) : (
        <span className="grid size-full place-items-center font-mono text-3xs uppercase leading-none tracking-nav text-muted-foreground">
          {timelineInitials(name)}
        </span>
      )}
    </span>
  )
}
