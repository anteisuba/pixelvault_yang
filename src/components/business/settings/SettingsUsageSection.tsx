'use client'

import { useFormatter, useTranslations } from 'next-intl'

import { formatUnitPriceAmount } from '@/constants/models/unit-prices'
import { useMonthlyUsage } from '@/hooks/use-monthly-usage'
import { Spinner } from '@/components/ui/spinner'

/**
 * `/settings/usage`（D3 ④ usage 画板）——**只显数字**：provider · 本月次数 ·
 * 估算花费，最后一行合计。⛔ 不画环、⛔ 不设预算。
 *
 * 花费是「次数 × 该模型单价」累加出来的估算，所以表头就把口径写死在脸上；
 * 一家里**没有任何模型有可信单价**时那一格留空，只显次数。
 */
export function SettingsUsageSection() {
  const t = useTranslations('Settings')
  const format = useFormatter()
  const {
    month,
    providers,
    totalRequests,
    totalEstimatedCostUsd,
    runner,
    isLoading,
  } = useMonthlyUsage()

  const showRunner = runner?.enabled === true
  const resetDate = startOfNextMonthUTC()

  return (
    <section>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">{t('sections.usage')}</h2>
        <p className="text-xs text-muted-foreground">
          {month ? `${month} · ` : ''}
          {t('usage.estimateNote')}
        </p>
      </header>

      {isLoading ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border px-4 py-6 text-sm text-muted-foreground">
          <Spinner size="md" />
          {t('usage.loading')}
        </div>
      ) : providers.length === 0 && !showRunner ? (
        <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          {t('usage.empty')}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-96 border-collapse overflow-hidden rounded-lg border border-border text-sm">
            <thead>
              <tr className="bg-muted text-2xs text-muted-foreground">
                <th scope="col" className="px-3.5 py-2 text-left font-normal">
                  {t('usage.columnProvider')}
                </th>
                <th scope="col" className="px-3.5 py-2 text-right font-normal">
                  {t('usage.columnRequests')}
                </th>
                <th scope="col" className="px-3.5 py-2 text-right font-normal">
                  {t('usage.columnCost')}
                </th>
              </tr>
            </thead>
            <tbody>
              {providers.map((provider) => (
                <tr
                  key={provider.adapterType}
                  className="border-t border-border"
                >
                  <td className="px-3.5 py-2.5">{provider.label}</td>
                  <td className="px-3.5 py-2.5 text-right font-mono text-xs">
                    {provider.requests}
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono text-xs">
                    {provider.estimatedCostUsd === null
                      ? ''
                      : formatUnitPriceAmount(provider.estimatedCostUsd)}
                  </td>
                </tr>
              ))}
              {showRunner ? (
                <tr className="border-t border-border">
                  <td className="px-3.5 py-2.5">{t('usage.runnerLabel')}</td>
                  <td className="px-3.5 py-2.5 text-right font-mono text-xs">
                    {t('usage.runnerQuota', {
                      used: runner.used,
                      limit: runner.limit,
                    })}
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono text-xs">
                    {t('usage.runnerCost', {
                      date: format.dateTime(resetDate, {
                        month: '2-digit',
                        day: '2-digit',
                      }),
                    })}
                  </td>
                </tr>
              ) : null}
              <tr className="border-t border-border font-medium">
                <td className="px-3.5 py-2.5">{t('usage.total')}</td>
                <td className="px-3.5 py-2.5 text-right font-mono text-xs">
                  {totalRequests + (showRunner ? runner.used : 0)}
                </td>
                <td className="px-3.5 py-2.5 text-right font-mono text-xs">
                  {totalEstimatedCostUsd === null
                    ? ''
                    : formatUnitPriceAmount(totalEstimatedCostUsd)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
        {t('usage.footnote')}
      </p>
    </section>
  )
}

/** Runner 额度按 UTC 自然月重置，与 `getRunnerUsage` 的月界同源。 */
function startOfNextMonthUTC(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
}
