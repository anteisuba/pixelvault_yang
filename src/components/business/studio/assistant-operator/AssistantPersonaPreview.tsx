'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'

import {
  ASSISTANT_PERSONA_PREVIEW_PARAGRAPHS,
  type AssistantAvatarPresetId,
  type AssistantPersonaTone,
  type AssistantPersonaVerbosity,
} from '@/constants/assistant-persona'
import { AssistantAvatarGlyph } from '@/components/business/studio/assistant-operator/AssistantAvatarGlyph'

/**
 * 实时示例（`docs/references/pages/assistant-shell-v2.md` §11.5）——设置弹层右侧
 * 那张「这样设定后它会这么说」的示例回复卡。
 *
 * ── ⛔ 不调 LLM，本地模板 ─────────────────────────────────────────
 * 设置弹层里用户会连点七八下，每一下调一次模型既慢又贵，而且**同一份设置两次
 * 会给出不同示例** —— 那让人以为设置没生效。模板给的是确定性的因果演示，
 * 正是这个控件要说的话。⛔ 这个文件里不许出现任何 fetch / api-client。
 *
 * ── 哪一项决定哪一块（§11.5 那张表逐行）──────────────────────────
 * · 开场句式 ← `tone`（四档各一句模板，含自定义那一档）
 * · 段落数   ← `verbosity`（`ASSISTANT_PERSONA_PREVIEW_PARAGRAPHS`：1 / 2 / 3，
 *              **第一段就是开场那句**，⛔ 不在它之外再多算一段）
 * · 末尾一行 ← `nextStepHint`
 * · 称呼     ← `addressUserAs`（空 = 不加前缀，⛔ 不摆一个「（你的名字）」占位）
 * · 头像与名字 ← 身份区（与左边那颗预览同一个 `AssistantAvatarGlyph`）
 */

interface AssistantPersonaPreviewProps {
  /** 已经回落过的显示名（空名时调用方填域内默认名，⛔ 这里不再 fallback 一次）。 */
  name: string
  avatarPreset: AssistantAvatarPresetId | null
  avatarUrl: string | null
  tone: AssistantPersonaTone
  verbosity: AssistantPersonaVerbosity
  nextStepHint: boolean
  addressUserAs: string | null
}

export function AssistantPersonaPreview({
  name,
  avatarPreset,
  avatarUrl,
  tone,
  verbosity,
  nextStepHint,
  addressUserAs,
}: AssistantPersonaPreviewProps) {
  const t = useTranslations('StudioOperator.persona')
  const paragraphCount = ASSISTANT_PERSONA_PREVIEW_PARAGRAPHS[verbosity]
  /**
   * 第 2 / 3 段的模板。⚠ 次序固定：详细档 = 正常档**再多一段**，⛔ 不是另一套
   * 文案 —— 用户拖长度那一档时该看到「话变多了」，而不是「换了个助手」。
   */
  const extraBodyKeys = ['preview.body.second', 'preview.body.third'] as const

  return (
    <aside
      data-testid="assistant-persona-preview"
      /* 画板 BSettings 右栏：示例区是**浅底的一格**，示例本身是浮在它上面的白卡
         —— 两层靠明度分（§12.1），⛔ 不靠阴影。 */
      className="flex flex-col gap-2.5 rounded-xl border border-border bg-muted/40 p-3"
    >
      <span className="text-2sm font-semibold uppercase tracking-nav text-muted-foreground">
        {t('previewTitle', { name })}
      </span>

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-assistant-card">
        <div className="flex items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-muted">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt=""
                width={48}
                height={48}
                unoptimized
                className="size-full object-cover"
              />
            ) : (
              <AssistantAvatarGlyph
                presetId={avatarPreset}
                name={name}
                className="size-full"
              />
            )}
          </span>
          <span className="truncate text-md text-muted-foreground">{name}</span>
        </div>

        {Array.from({ length: paragraphCount }, (_, index) => (
          <p
            key={index}
            data-testid="assistant-preview-paragraph"
            className="text-sm leading-relaxed text-foreground"
          >
            {index === 0 ? (
              <>
                {addressUserAs ? (
                  <span data-testid="assistant-preview-address">
                    {t('preview.address', { name: addressUserAs })}
                  </span>
                ) : null}
                {t(`preview.opener.${tone}`)}
              </>
            ) : (
              t(extraBodyKeys[index - 1])
            )}
          </p>
        ))}

        {/* 末尾那一行只在开关开着时长出来 —— 关掉还留着它，这张卡就不再是演示。 */}
        {nextStepHint ? (
          <p
            data-testid="assistant-preview-next-step"
            className="text-md text-muted-foreground"
          >
            {t('preview.nextStep')}
          </p>
        ) : null}
      </div>

      <p className="text-md text-muted-foreground">{t('previewHint')}</p>
    </aside>
  )
}
