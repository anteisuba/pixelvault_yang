'use client'

/**
 * 拉片纸上「顺便读每一镜」那一格（H4b，owner 2026-11-07，mock ①②）。
 *
 * - 勾上 = 落表之后接着读：每 `SHOT_READ.batchShots` 镜一批交给 Gemini（用户自己的 key、
 *   不扣点），读回来只填空格、仍是草稿。读本身由工作台的 `useShotReading` 跑（纸关了照读）。
 * - 三样分开勾：景别 · 运镜 / 画面说明 / 单镜风格（默认不勾：空着就用全片风格）。最后一样
 *   勾着的不能取消 —— 一样都不读就是不勾读镜。
 * - **没 Gemini key**：照列不禁用（Hard Rule 8），勾的那一下就地弹 `QuickSetupDialog`
 *   （固定 Gemini 一家），验过才勾上；关掉 = 不勾，照样能只切镜落表。
 * - 有 key 时默认勾上；用户自己取消过就听用户的。
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { Check } from '@/components/icons'
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import { NODE_STUDIO_ASSISTANT_ROUTE_MODELS } from '@/constants/node-studio'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  SHOT_READ,
  SHOT_READ_DEFAULT_FIELDS,
  SHOT_READ_FIELDS,
  type ShotReadField,
} from '@/constants/shot-reading'
import { useApiKeysContextOptional } from '@/contexts/api-keys-context'
import { cn } from '@/lib/utils'

/** 落表时交给宿主的读镜选择：没勾 = `null`。 */
export interface ShotPullReadChoice {
  readonly apiKeyId: string
  readonly fields: readonly ShotReadField[]
}

/** 纸上读镜那一格的草稿（纸一关就扔）。 */
export interface ShotPullReadDraft {
  /** `null` = 用户还没碰过：有 key 就勾着。 */
  readonly wanted: boolean | null
  readonly fields: readonly ShotReadField[]
  /** 刚在弹窗里配好的那把（优先于名单里的第一把）。 */
  readonly keyId: string | null
}

export const SHOT_PULL_READ_DRAFT: ShotPullReadDraft = {
  wanted: null,
  fields: SHOT_READ_DEFAULT_FIELDS,
  keyId: null,
}

/** 读镜用哪把 key：刚配好的那把，否则名单里第一把能用的 Gemini。 */
export function useShotPullReadKey(draft: ShotPullReadDraft): string | null {
  const apiKeys = useApiKeysContextOptional()
  if (draft.keyId) return draft.keyId
  return (
    apiKeys?.keys.find(
      (key) => key.adapterType === AI_ADAPTER_TYPES.GEMINI && key.isActive,
    )?.id ?? null
  )
}

export function resolveShotPullRead(
  draft: ShotPullReadDraft,
  keyId: string | null,
): ShotPullReadChoice | null {
  if (!keyId) return null
  const on = draft.wanted ?? true
  return on ? { apiKeyId: keyId, fields: draft.fields } : null
}

/**
 * 弹窗配的是 Gemini 看视频那一档（与助手模型 chip 同一张路由表）。表头下那条「换一把 key」
 * 配的也是它。
 */
export const SHOT_READ_GEMINI_SETUP = NODE_STUDIO_ASSISTANT_ROUTE_MODELS.find(
  (model) => model.adapterType === AI_ADAPTER_TYPES.GEMINI,
)

export function ShotPullReadOption({
  shotCount,
  draft,
  keyId,
  onChange,
}: {
  readonly shotCount: number
  readonly draft: ShotPullReadDraft
  readonly keyId: string | null
  onChange(next: ShotPullReadDraft): void
}) {
  const t = useTranslations('StudioNode.shotTable.pull.read')
  const [setupOpen, setSetupOpen] = useState(false)
  const choice = resolveShotPullRead(draft, keyId)
  const on = choice !== null
  const batches = Math.max(1, Math.ceil(shotCount / SHOT_READ.batchShots))

  const toggle = (next: boolean) => {
    if (next && !keyId) {
      if (SHOT_READ_GEMINI_SETUP) setSetupOpen(true)
      return
    }
    onChange({ ...draft, wanted: next })
  }

  const toggleField = (field: ShotReadField) => {
    const has = draft.fields.includes(field)
    if (has && draft.fields.length === 1) return
    onChange({
      ...draft,
      fields: SHOT_READ_FIELDS.filter((id) =>
        id === field ? !has : draft.fields.includes(id),
      ),
    })
  }

  return (
    <div
      data-testid="shot-pull-read"
      data-on={on || undefined}
      className="flex flex-col gap-2 rounded-xl border border-border px-3.5 py-3"
    >
      <label className="flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          data-testid="shot-pull-read-toggle"
          checked={on}
          onChange={(event) => toggle(event.target.checked)}
          className="size-3.5 shrink-0 accent-primary"
        />
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-2sm">
          <span className="">{t('title')}</span>
          <span className="rounded-full bg-surface-fill px-2 py-0.5 text-2sm text-muted-foreground">
            {t('needs')}
          </span>
        </span>
      </label>
      {on ? (
        <div className="flex flex-col gap-2 pl-6">
          <div className="flex flex-wrap gap-1.5">
            {SHOT_READ_FIELDS.map((field) => {
              const ticked = draft.fields.includes(field)
              return (
                <button
                  key={field}
                  type="button"
                  data-testid={`shot-pull-read-field-${field}`}
                  aria-pressed={ticked}
                  onClick={() => toggleField(field)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-2sm transition-colors duration-fast',
                    ticked
                      ? 'border-foreground/20 bg-surface-fill text-foreground'
                      : 'border-border text-muted-foreground hover:tint-hover',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'inline-flex size-3.5 items-center justify-center rounded-sm border',
                      ticked
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border',
                    )}
                  >
                    {ticked ? <Check className="size-2.5" /> : null}
                  </span>
                  {t(`fields.${field}`)}
                </button>
              )
            })}
          </div>
          <p className="text-2xs text-muted-foreground">
            {t('note', { size: SHOT_READ.batchShots, batches })}
          </p>
        </div>
      ) : !keyId ? (
        <p
          data-testid="shot-pull-read-no-key"
          className="pl-6 text-2xs text-muted-foreground"
        >
          {t('noKey')}
        </p>
      ) : null}
      {setupOpen && SHOT_READ_GEMINI_SETUP ? (
        <QuickSetupDialog
          open
          onOpenChange={(next) => {
            if (!next) setSetupOpen(false)
          }}
          modelId={SHOT_READ_GEMINI_SETUP.modelId}
          modelLabel={SHOT_READ_GEMINI_SETUP.label}
          adapterType={SHOT_READ_GEMINI_SETUP.adapterType}
          optionId={`shot-read:setup:${SHOT_READ_GEMINI_SETUP.modelId}`}
          selectStudioModel={false}
          onVerified={(_modelId, verifiedKeyId) =>
            onChange({ ...draft, wanted: true, keyId: verifiedKeyId })
          }
        />
      ) : null}
    </div>
  )
}
