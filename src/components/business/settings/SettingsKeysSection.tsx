'use client'

import { useCallback, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronRight, Plus, Trash2 } from '@/components/icons'

import { API_KEY_MASK } from '@/constants/api-keys'
import { formatUnitPriceAmount } from '@/constants/models/unit-prices'
import { DURATION, EASE_STANDARD, springTransition } from '@/constants/motion'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import { KEY_SETUP_QUERY } from '@/constants/routes'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import {
  useProviderKeyRows,
  type ProviderKeyRow,
  type ProviderKeyState,
} from '@/hooks/use-provider-key-rows'
import { useMonthlyUsage } from '@/hooks/use-monthly-usage'
import { usePathname, useRouter } from '@/i18n/navigation'
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
 *
 * 动效（owner 2026-10-08 设置页原型 v1）：展开 / 收起走高度弹簧；配好一把之后这一行
 * 按新的排序 FLIP 滑到它该在的组（`layout="position"`），健康点由灰变绿；删掉的那把
 * 收起高度再走。弹窗从按下的那颗键长出来（`QuickSetupDialog` 自带）。
 *
 * ⭐ `?setup=<adapterType>` 进来就直接把那一家的面 1 打开（选了没配 key 的模型从
 * 选择器跳到这里，owner 2026-10-06）；关掉弹窗时把这个参数从地址栏去掉，`from`
 * 留着给返回键。
 */
export function SettingsKeysSection() {
  const t = useTranslations('Settings')
  const { rows, healthMap, verifiedAtMap, isLoading } = useProviderKeyRows()
  const { providers } = useMonthlyUsage()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [expanded, setExpanded] = useState<string | null>(null)
  const reduceMotion = useReducedMotion()
  /** 地址栏要求直接配哪一家 —— 开关就由地址栏说了算，⛔ 不再拷一份进 state。 */
  const setupAdapter = searchParams.get(KEY_SETUP_QUERY)
  const urlSetupRow = setupAdapter
    ? rows.find((row) => row.adapterType === setupAdapter)
    : undefined
  const closeUrlSetup = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString())
    next.delete(KEY_SETUP_QUERY)
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }, [pathname, router, searchParams])
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
            <motion.li
              key={row.adapterType}
              layout="position"
              transition={springTransition('slot', reduceMotion)}
            >
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
            </motion.li>
          ))}
        </ul>
      )}

      {urlSetupRow ? (
        <QuickSetupDialog
          open
          onOpenChange={(open) => {
            if (!open) closeUrlSetup()
          }}
          modelId={urlSetupRow.sampleModelId}
          modelLabel={urlSetupRow.label}
          adapterType={urlSetupRow.adapterType}
          optionId={`settings:keys:${urlSetupRow.adapterType}`}
        />
      ) : null}

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
  const reduceMotion = useReducedMotion()
  const grow = springTransition('slot', reduceMotion)

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
          data-testid="provider-state-dot"
          data-state={row.state}
          className={cn(
            'size-2 shrink-0 rounded-full transition-colors duration-slow ease-standard',
            STATE_DOT[row.state],
          )}
          aria-hidden
        />
        <span className="min-w-28 font-medium">{row.label}</span>
        {row.modelCount > 0 ? (
          <span className="min-w-16 text-xs text-muted-foreground">
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
          <span className="text-xs text-muted-foreground">
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

      <AnimatePresence initial={false}>
        {isExpanded && row.keys.length > 0 ? (
          <motion.div
            key="keys"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: grow,
              opacity: {
                duration: reduceMotion ? 0 : DURATION.fast,
                ease: EASE_STANDARD,
              },
            }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 border-t border-dashed border-border bg-muted/50 py-3 pl-9 pr-3.5">
              <AnimatePresence initial={false}>
                {row.keys.map((key) => (
                  <motion.div
                    key={key.id}
                    exit={{ height: 0, opacity: 0, filter: 'blur(4px)' }}
                    transition={{
                      duration: reduceMotion ? 0 : DURATION.base,
                      ease: EASE_STANDARD,
                    }}
                    className="overflow-hidden"
                  >
                    <KeyLine
                      id={key.id}
                      label={key.label}
                      status={healthMap[key.id]}
                      verifiedAt={verifiedAtMap[key.id]}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
              <button
                type="button"
                onClick={onQuickSetup}
                className="inline-flex min-h-8 items-center gap-1.5 self-start text-xs text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="size-3.5" />
                {t('keys.addAnother')}
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
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
          'size-4 transition-transform duration-spring-slot ease-spring-slot motion-reduce:transition-none',
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
          'size-1.5 shrink-0 rounded-full transition-colors duration-slow ease-standard',
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
