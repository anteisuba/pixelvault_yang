'use client'

import { useCallback, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { ChevronRight, Plus, Trash2 } from '@/components/icons'

import { API_KEY_MASK } from '@/constants/api-keys'
import { formatUnitPriceAmount } from '@/constants/models/unit-prices'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import {
  useProviderKeyRows,
  type ProviderKeyRow,
  type ProviderKeyState,
} from '@/hooks/use-provider-key-rows'
import { useMonthlyUsage } from '@/hooks/use-monthly-usage'
import type { ApiKeyHealthStatus } from '@/types'
import { cn } from '@/lib/utils'

import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Spinner } from '@/components/ui/spinner'

/**
 * `/settings/keys`（D3 ④ key 行画板）——**按 provider 一行**。
 *
 * 行 = 健康点 · provider 名 · 解锁 N 模型 · 状态一句 · 本月花费 · 动作。
 * 排序：失效 → 已配 → 未配置（`useProviderKeyRows`）。未配置行「配置」与失效行
 * 「换一把」打开的都是**面 1**（`QuickSetupDialog`）—— ⛔ 这一页不自带第二个
 * 录入表单。
 */
export function SettingsKeysSection() {
  const t = useTranslations('Settings')
  const { rows, healthMap, verifiedAtMap, isLoading } = useProviderKeyRows()
  const { providers } = useMonthlyUsage()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [quickSetup, setQuickSetup] = useState<{
    open: boolean
    adapterType: AI_ADAPTER_TYPES
    modelId: string
    modelLabel: string
  } | null>(null)

  const openQuickSetup = useCallback((row: ProviderKeyRow) => {
    setQuickSetup({
      open: true,
      adapterType: row.adapterType,
      modelId: row.sampleModelId,
      modelLabel: row.label,
    })
  }, [])

  return (
    <section>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">{t('sections.keys')}</h2>
        <p className="text-xs text-muted-foreground">{t('keys.caption')}</p>
      </header>

      {isLoading && rows.every((row) => row.keys.length === 0) ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border px-4 py-6 text-sm text-muted-foreground">
          <Spinner size="md" />
          {t('keys.loading')}
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.adapterType}>
              <ProviderRow
                row={row}
                healthMap={healthMap}
                verifiedAtMap={verifiedAtMap}
                spendUsd={
                  providers.find(
                    (provider) => provider.adapterType === row.adapterType,
                  )?.estimatedCostUsd ?? null
                }
                isExpanded={expanded === row.adapterType}
                onToggleExpanded={() =>
                  setExpanded((current) =>
                    current === row.adapterType ? null : row.adapterType,
                  )
                }
                onQuickSetup={() => openQuickSetup(row)}
              />
            </li>
          ))}
        </ul>
      )}

      {quickSetup ? (
        <QuickSetupDialog
          open={quickSetup.open}
          onOpenChange={(open) =>
            setQuickSetup((prev) => (prev ? { ...prev, open } : prev))
          }
          modelId={quickSetup.modelId}
          modelLabel={quickSetup.modelLabel}
          adapterType={quickSetup.adapterType}
          optionId={`settings:keys:${quickSetup.adapterType}`}
        />
      ) : null}
    </section>
  )
}

const STATE_DOT: Record<ProviderKeyState, string> = {
  healthy: 'bg-status-applied',
  invalid: 'bg-destructive',
  unverified: 'bg-muted-foreground/40',
  unconfigured: 'bg-muted-foreground/25',
}

interface ProviderRowProps {
  row: ProviderKeyRow
  healthMap: Record<string, ApiKeyHealthStatus>
  verifiedAtMap: Record<string, number>
  spendUsd: number | null
  isExpanded: boolean
  onToggleExpanded: () => void
  onQuickSetup: () => void
}

function ProviderRow({
  row,
  healthMap,
  verifiedAtMap,
  spendUsd,
  isExpanded,
  onToggleExpanded,
  onQuickSetup,
}: ProviderRowProps) {
  const t = useTranslations('Settings')
  const tCommon = useTranslations('Common')
  const format = useFormatter()

  const lastVerifiedAt = row.keys
    .map((key) => verifiedAtMap[key.id])
    .filter((stamp): stamp is number => typeof stamp === 'number')
    .sort((left, right) => right - left)[0]

  const stamp =
    lastVerifiedAt === undefined
      ? null
      : format.relativeTime(new Date(lastVerifiedAt), new Date())

  const statusText =
    row.state === 'unconfigured'
      ? t('keys.status.unconfigured')
      : row.state === 'unverified'
        ? t('keys.status.unverified')
        : stamp
          ? t(`keys.status.${row.state}WithStamp`, { stamp })
          : t(`keys.status.${row.state}`)

  return (
    <div className="rounded-lg border border-border bg-card transition-colors duration-fast hover:border-muted-foreground/40">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-3 text-sm">
        <span
          className={cn('size-2 shrink-0 rounded-full', STATE_DOT[row.state])}
          aria-hidden
        />
        <span className="min-w-28 font-medium">{row.label}</span>
        {row.modelCount > 0 ? (
          <span className="min-w-16 font-mono text-xs text-muted-foreground">
            {tCommon('modelCount', { count: row.modelCount })}
          </span>
        ) : null}
        <span
          className={cn(
            'flex-1 text-xs',
            row.state === 'invalid'
              ? 'text-destructive'
              : 'text-muted-foreground',
          )}
        >
          {statusText}
        </span>
        {spendUsd !== null ? (
          <span className="font-mono text-xs text-muted-foreground">
            {t('keys.monthlySpend', {
              amount: formatUnitPriceAmount(spendUsd),
            })}
          </span>
        ) : null}
        <RowAction
          state={row.state}
          isExpanded={isExpanded}
          providerLabel={row.label}
          onToggleExpanded={onToggleExpanded}
          onQuickSetup={onQuickSetup}
        />
      </div>

      {isExpanded && row.keys.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-dashed border-border bg-muted/50 py-3 pl-9 pr-3.5">
          {row.keys.map((key) => (
            <KeyLine
              key={key.id}
              id={key.id}
              label={key.label}
              status={healthMap[key.id]}
              verifiedAt={verifiedAtMap[key.id]}
            />
          ))}
          <button
            type="button"
            onClick={onQuickSetup}
            className="inline-flex min-h-8 items-center gap-1.5 self-start text-xs text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-3.5" />
            {t('keys.addAnother')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function RowAction({
  state,
  isExpanded,
  providerLabel,
  onToggleExpanded,
  onQuickSetup,
}: {
  state: ProviderKeyState
  isExpanded: boolean
  providerLabel: string
  onToggleExpanded: () => void
  onQuickSetup: () => void
}) {
  const t = useTranslations('Settings')

  if (state === 'unconfigured' || state === 'invalid') {
    return (
      <button
        type="button"
        onClick={onQuickSetup}
        className="inline-flex h-8 items-center rounded-full border border-border px-3 text-xs font-medium transition-colors duration-fast hover:bg-accent active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {state === 'invalid' ? t('keys.replaceKey') : t('keys.configure')}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onToggleExpanded}
      aria-expanded={isExpanded}
      aria-label={t('keys.toggleKeys', { provider: providerLabel })}
      className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronRight
        className={cn(
          'size-4 transition-transform duration-fast motion-reduce:transition-none',
          isExpanded && 'rotate-90',
        )}
      />
    </button>
  )
}

function KeyLine({
  id,
  label,
  status,
  verifiedAt,
}: {
  id: string
  label: string
  status: ApiKeyHealthStatus | undefined
  verifiedAt: number | undefined
}) {
  const t = useTranslations('Settings')
  const format = useFormatter()
  const { remove, verify } = useApiKeysContext()
  const [isBusy, setIsBusy] = useState(false)

  const handleVerify = useCallback(async () => {
    setIsBusy(true)
    await verify(id)
    setIsBusy(false)
  }, [id, verify])

  const handleDelete = useCallback(async () => {
    setIsBusy(true)
    await remove(id)
    setIsBusy(false)
  }, [id, remove])

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          status === 'available'
            ? 'bg-status-applied'
            : status === 'failed'
              ? 'bg-destructive'
              : 'bg-muted-foreground/40',
        )}
        aria-hidden
      />
      <span className="min-w-16 font-medium">{label}</span>
      <span className="font-mono text-muted-foreground">{API_KEY_MASK}</span>
      <span className="flex-1 text-muted-foreground">
        {verifiedAt === undefined
          ? t('keys.neverVerified')
          : t('keys.lastVerified', {
              stamp: format.relativeTime(new Date(verifiedAt), new Date()),
            })}
      </span>
      <button
        type="button"
        onClick={() => void handleVerify()}
        disabled={isBusy}
        className="inline-flex min-h-8 items-center font-mono text-muted-foreground transition-colors duration-fast hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {isBusy ? <Spinner size="sm" /> : t('keys.reverify')}
      </button>
      <ConfirmDialog
        trigger={
          <button
            type="button"
            disabled={isBusy}
            aria-label={t('keys.deleteKey', { label })}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast hover:text-destructive disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="size-3.5" />
          </button>
        }
        title={t('keys.deleteDialog.title')}
        description={t('keys.deleteDialog.description', { label })}
        cancelLabel={t('keys.deleteDialog.cancel')}
        confirmLabel={t('keys.deleteDialog.confirm')}
        onConfirm={handleDelete}
      />
    </div>
  )
}
