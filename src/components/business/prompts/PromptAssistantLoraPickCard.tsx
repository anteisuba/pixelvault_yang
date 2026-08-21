'use client'

import { useState } from 'react'
import {
  ArrowUpRight,
  Check,
  Download,
  Layers,
  TriangleAlert,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  LORA_CANDIDATE_SOURCE_IDS,
  type LoraCandidateConfirmStep,
} from '@/constants/lora-candidate'
import { ROUTES } from '@/constants/routes'
import { Link } from '@/i18n/navigation'
import type {
  LoraCandidateConfirmAdapter,
  LoraCandidateConfirmOutcome,
} from '@/hooks/use-lora-candidate-confirm'
import { cn } from '@/lib/utils'
import type { AssistantLoraPick } from '@/types/assistant-protocol'
import type { LoraCandidate } from '@/types/lora-candidate'

/**
 * LoRA 推荐卡（任务包 §5「一次确认链」的界面那一半）。
 *
 * ⭐ **卡上的每一个事实都来自 `candidate`，模型只贡献一句 `reason`。**
 * 名字、作者、许可、大小、样图、下载量全是服务端检索回来的候选对象上的值 ——
 * 让模型复述这些只有两种结局：与真实数据不一致，或者干脆是编的。
 *
 * ── 三条「宁可说不知道也不留白」的规矩 ─────────────────────────────
 * 1. `license.known === false` 是显示「许可未知」的**唯一判据**。留白会被读成
 *    「没有限制」，而这批候选里 HF 那一侧常常真的取不到许可。
 * 2. `author` / `fileSizeBytes` 为 null 时写「作者未知」「大小未知」，不写空字符串。
 * 3. `metadataCompleteness` 是**如实分级不是评分** —— 它只回答「这条我们知道多少」，
 *    不参与排序，也不该被读成质量。
 *
 * ── 确认按钮的闸 ───────────────────────────────────────────────────
 * `importable && importPayload !== null`。两个条件都要看：前者是服务端的导入门槛
 * （定得出底模 + 有权重文件），后者防的是**下发降级**（候选头装不下时会掉到没有
 * 导入载荷的最低档，见 `lib/lora-candidate-receipt`）。少看一个的表现是「按钮能点，
 * 点了报导入失败」。
 */

/** 许可的三个权限位。null = 该源没有这套声明（Civitai 有、HF 没有）。 */
function LicensePermissions({ candidate }: { candidate: LoraCandidate }) {
  const t = useTranslations('PromptAssistant')
  const { license } = candidate

  if (!license.known) {
    return (
      <span className="text-2xs text-muted-foreground">
        {t('loraCandidate.licenseUnknown')}
      </span>
    )
  }

  const bits: { key: string; labelKey: string; allowed: boolean | null }[] = [
    {
      key: 'commercial',
      labelKey: 'loraCandidate.licenseCommercial',
      // Civitai 的商用是一组场景（Image / Rent / Sell）；空数组 = 作者一个都没勾。
      allowed: license.commercialUse ? license.commercialUse.length > 0 : null,
    },
    {
      key: 'derivatives',
      labelKey: 'loraCandidate.licenseDerivatives',
      allowed: license.allowDerivatives,
    },
    {
      key: 'noCredit',
      labelKey: 'loraCandidate.licenseNoCredit',
      allowed: license.allowNoCredit,
    },
  ]

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {license.label ? (
        <span className="rounded-sm bg-secondary px-1 py-0.5 text-2xs font-medium text-foreground">
          {license.label}
        </span>
      ) : null}
      {bits.map((bit) => (
        <span
          key={bit.key}
          className="inline-flex items-center gap-1 text-2xs text-foreground"
        >
          <span
            aria-hidden
            className={cn(
              'inline-block size-1.5 shrink-0 rounded-full',
              bit.allowed === true && 'bg-status-applied',
              bit.allowed === false && 'bg-status-risk',
              bit.allowed === null && 'bg-muted-foreground/50',
            )}
          />
          {t(bit.labelKey)}
          <span className="text-muted-foreground">
            {bit.allowed === null
              ? t('loraCandidate.permissionUnknown')
              : t(
                  bit.allowed
                    ? 'loraCandidate.permissionAllowed'
                    : 'loraCandidate.permissionDenied',
                )}
          </span>
        </span>
      ))}
    </div>
  )
}

export interface PromptAssistantLoraPickCardProps {
  pick: AssistantLoraPick
  candidate: LoraCandidate
  /**
   * 确认链适配器。**缺席 = 这个宿主接不了这条链**，那时卡退化成只读的事实卡
   * （仍然有价值：用户可以自己点开来源页）—— ⛔ 不留一个点了没反应的按钮。
   */
  confirm?: LoraCandidateConfirmAdapter
  disabled?: boolean
}

export function PromptAssistantLoraPickCard({
  pick,
  candidate,
  confirm,
  disabled = false,
}: PromptAssistantLoraPickCardProps) {
  const t = useTranslations('PromptAssistant')
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<LoraCandidateConfirmOutcome | null>(
    null,
  )

  const canImport = candidate.importable && candidate.importPayload !== null
  const done = outcome?.status === 'ok'
  const failedStep: LoraCandidateConfirmStep | undefined =
    outcome?.status === 'failed' ? outcome.failedStep : undefined

  const handleConfirm = async () => {
    if (!confirm || pending) return
    setPending(true)
    setOutcome(null)
    const result = await confirm.confirm({
      candidate,
      ...(pick.suggestedWeight !== undefined
        ? { suggestedWeight: pick.suggestedWeight }
        : {}),
    })
    setOutcome(result)
    setPending(false)
  }

  const sizeLabel =
    candidate.fileSizeBytes === null
      ? t('loraCandidate.sizeUnknown')
      : `${(candidate.fileSizeBytes / 1024 / 1024).toFixed(1)} MB`

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-2.5">
      <div className="flex items-start gap-2.5">
        {candidate.sampleImageUrls.length > 0 ? (
          <div className="flex shrink-0 gap-1">
            {/* ≤2 张：卡是对话流里的一条，图区再大就把理由挤到屏幕外了。 */}
            {candidate.sampleImageUrls.slice(0, 2).map((url) => (
              // eslint-disable-next-line @next/next/no-img-element -- remote upstream sample, unoptimized by project config
              <img
                key={url}
                src={url}
                alt={candidate.name}
                loading="lazy"
                className="size-14 rounded-lg border border-border/60 object-cover"
              />
            ))}
          </div>
        ) : null}

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
              {candidate.name}
            </span>
            {candidate.alreadyMounted ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-status-applied-surface px-1.5 py-0.5 text-2xs font-medium text-status-applied">
                <Layers className="size-2.5" />
                {t('loraCandidate.alreadyMounted')}
              </span>
            ) : null}
            {/* 已收藏 ≠ 已挂载：库里有它但工作台上没有，仍然可以一键挂上去。 */}
            {candidate.alreadyImported && !candidate.alreadyMounted ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-2xs font-medium text-foreground">
                <Check className="size-2.5" />
                {t('loraCandidate.alreadyImported')}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-2xs text-muted-foreground">
            <span className="rounded-sm bg-secondary px-1 py-0.5 font-medium text-foreground">
              {t(
                candidate.source === LORA_CANDIDATE_SOURCE_IDS.civitai
                  ? 'loraCandidate.sourceCivitai'
                  : 'loraCandidate.sourceHuggingFace',
              )}
            </span>
            <span className="truncate text-foreground">
              {candidate.author ?? t('loraCandidate.authorUnknown')}
            </span>
            <span aria-hidden>·</span>
            <span>
              {candidate.baseModelFamily ?? t('loraCandidate.baseModelUnknown')}
            </span>
            <span aria-hidden>·</span>
            <span>{t(`loraCandidate.type.${candidate.type}`)}</span>
          </div>

          {candidate.triggerWords.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {candidate.triggerWords.map((word) => (
                <span
                  key={word}
                  className="inline-flex h-5 max-w-40 items-center truncate rounded-full border border-border/60 px-1.5 font-mono text-2xs text-foreground"
                >
                  {word}
                </span>
              ))}
            </div>
          ) : null}

          <LicensePermissions candidate={candidate} />

          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-2xs text-muted-foreground">
            <span>{sizeLabel}</span>
            {candidate.downloads !== null ? (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">
                  {t('loraCandidate.downloads', {
                    count: candidate.downloads,
                  })}
                </span>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <span className="rounded-sm border border-border px-1 text-foreground">
              {t(
                `loraCandidate.metadataCompleteness.${candidate.metadataCompleteness}`,
              )}
            </span>
          </div>
        </div>
      </div>

      {/* 模型唯一贡献的那句话 —— 数据给不了「为什么是这一把」。 */}
      <p className="text-2xs leading-4 text-foreground">{pick.reason}</p>

      <div className="flex flex-wrap items-center gap-1.5">
        {candidate.alreadyMounted ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            className="h-7 gap-1.5 rounded-full px-3 text-xs"
          >
            <Check className="size-3" />
            {t('loraCandidate.alreadyInStack')}
          </Button>
        ) : done ? (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-status-applied-surface px-3 text-xs font-medium text-status-applied">
            <Check className="size-3" />
            {t(
              outcome?.mounted
                ? 'loraCandidate.confirmedMounted'
                : 'loraCandidate.confirmedImported',
            )}
          </span>
        ) : confirm ? (
          <Button
            type="button"
            size="sm"
            disabled={!canImport || disabled || pending}
            onClick={() => void handleConfirm()}
            className="h-7 gap-1.5 rounded-full px-3 text-xs"
          >
            {pending ? <Spinner size="sm" /> : <Download className="size-3" />}
            {t(
              confirm.canMount
                ? 'loraCandidate.confirm'
                : 'loraCandidate.confirmImportOnly',
            )}
          </Button>
        ) : null}

        {candidate.pageUrl ? (
          <a
            href={candidate.pageUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-2xs text-muted-foreground underline underline-offset-[3px] hover:text-foreground"
          >
            {t('loraCandidate.openSource')}
            <ArrowUpRight className="size-3" />
          </a>
        ) : null}
      </div>

      {/* 不可导入**照样展示这条候选**（策略 C：不阻断，如实说明原因）。 */}
      {!canImport && !candidate.alreadyMounted ? (
        <p className="flex items-start gap-1.5 text-2xs leading-4 text-muted-foreground">
          <TriangleAlert className="mt-px size-3 shrink-0 text-status-risk" />
          {candidate.notImportableReason
            ? t(`loraCandidate.notImportable.${candidate.notImportableReason}`)
            : t('loraCandidate.detailsTrimmed')}
        </p>
      ) : null}

      {/* 宿主没有挂载栈：说清「导进去了，但挂载得去那边」，并给一条能走的路。 */}
      {done && !outcome?.mounted && confirm && !confirm.canMount ? (
        <p className="text-2xs leading-4 text-muted-foreground">
          {t('loraCandidate.mountElsewhere')}{' '}
          <Link
            href={ROUTES.STUDIO_LORA}
            className="text-foreground underline underline-offset-[3px]"
          >
            {t('loraCandidate.goToLoraWorkbench')}
          </Link>
        </p>
      ) : null}

      {/* ⚠ 失败必须报到步：换一把 / 去工作台挂 / 自己粘一遍，三条路完全不同。 */}
      {failedStep ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-2xs leading-4 text-status-risk"
        >
          <TriangleAlert className="mt-px size-3 shrink-0" />
          <span>
            {t(`loraCandidate.failed.${failedStep}`)}
            {outcome?.error ? (
              <span className="text-muted-foreground"> {outcome.error}</span>
            ) : null}
          </span>
        </p>
      ) : null}
    </div>
  )
}
