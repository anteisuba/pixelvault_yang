'use client'

/**
 * 时间线沟里那颗 32px 头像（方向 C · `pages/assistant-shell.md` §11.3）。
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
 */

import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { ASSISTANT_PERSONA_DEFAULTS } from '@/constants/assistant-persona'
import {
  AssistantAvatarGlyph,
  timelineInitials,
} from '@/components/business/studio/assistant-operator/AssistantAvatarGlyph'
import { useMyProfile } from '@/hooks/use-my-profile'
import { cn } from '@/lib/utils'
import type { AssistantPersona } from '@/types/assistant-persona'

interface TimelineAvatarProps {
  /** 谁在说话 —— 用户回合读账户头像，助手回合读 persona（§8.2）。 */
  speaker: 'user' | 'assistant'
  /**
   * 助手那一档的头像来源（§8.2 / §11.3）—— **由外壳拉一次往下传**。
   *
   * ⚠ ⛔ 这颗组件不自己调 `useAssistantPersona()`：它一轮里要渲染好几次，
   * 每一次都会开一个 `GET /api/assistant/persona`。⚠ 缺席（还没拉到）时画默认
   * 预设那一款 —— ⛔ 不出骨架屏，⛔ 不留空圈（§3.4「未加载完先画首字母」）。
   */
  persona?: AssistantPersona
  className?: string
}

export function TimelineAvatar({
  speaker,
  persona,
  className,
}: TimelineAvatarProps) {
  const t = useTranslations('StudioOperator.timeline')
  const { profile } = useMyProfile()

  const shell = cn(
    // ⚠ `ring-card` 而不是 `ring-background`：头像盖在贯穿竖线上，而那条线画在
    //   面板的 `bg-card` 上 —— 用 background 会在卡片底上留一圈更白的环。
    'grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-muted ring-2 ring-card',
    className,
  )

  if (speaker === 'assistant') {
    /**
     * 自传头像优先于预设（§8.2：`avatarPreset` 或 `avatarUrl` 二选一，传过就是
     * 传过）。⚠ `unoptimized`：R2 上那张图与侧栏头像同一条路（`AppSidebar` 的写法）。
     */
    const avatarUrl = persona?.avatarUrl ?? null
    /**
     * ⚠ `alt` / `aria-label` 不是空串（2026-09-06 真机：读屏走到助手回合只念得
     * 出一个「图片」）。有名字就念名字，没名字念默认 ID—— 这一行是读屏用户
     * 能分辨「谁在说这句话」的地方，与首行发言人名称一致。
     */
    const label = t('avatarAssistant', {
      name: persona?.name?.trim() || t('assistantFallback'),
    })
    return (
      <span
        data-testid="operator-timeline-avatar"
        data-speaker="assistant"
        className={shell}
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={label}
            width={64}
            height={64}
            unoptimized
            className="size-full object-cover"
          />
        ) : (
          // 预设款是纯图形（`aria-hidden` 的 SVG）—— 名字挂在外层 span 上。
          <span role="img" aria-label={label} className="size-full">
            <AssistantAvatarGlyph
              presetId={
                persona?.avatarPreset ?? ASSISTANT_PERSONA_DEFAULTS.avatarPreset
              }
              name={persona?.name?.trim() || t('assistantFallback')}
              className="size-full"
            />
          </span>
        )}
      </span>
    )
  }

  const name = profile?.displayName ?? profile?.username ?? ''
  const userLabel = t('avatarUser')

  return (
    <span
      data-testid="operator-timeline-avatar"
      data-speaker="user"
      className={shell}
    >
      {profile?.avatarUrl ? (
        <Image
          src={profile.avatarUrl}
          alt={userLabel}
          width={64}
          height={64}
          unoptimized
          className="size-full object-cover"
        />
      ) : (
        // ⚠ 首字母是**图形替代**不是文字：读屏念「FL」没有意义，念「你的头像」
        //    才是这颗圆标想说的话。
        <span
          role="img"
          aria-label={userLabel}
          className="grid size-full place-items-center font-mono text-md uppercase leading-none tracking-nav text-muted-foreground"
        >
          <span aria-hidden>{timelineInitials(name)}</span>
        </span>
      )}
    </span>
  )
}
