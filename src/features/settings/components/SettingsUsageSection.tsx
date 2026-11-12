'use client'

import { useFormatter, useTranslations } from 'next-intl'

import { formatUnitPriceAmount } from '@/constants/models/unit-prices'
import { useMonthlyUsage } from '@/features/settings/hooks/use-monthly-usage'
import { CountUp } from '@/components/ui/count-up'
import { Spinner } from '@/components/ui/spinner'

/**
 * `/settings/usage`（D3 ④ usage 画板）——**只显数字**：provider · 本月次数 ·
 * 估算花费，最后一行合计。⛔ 不画环、⛔ 不设预算。
 *
 * 花费是「次数 × 该模型单价」累加出来的估算，所以表头就把口径写死在脸上；
 * 一家里**没有任何模型有可信单价**时那一格留空，只显次数。
 *
 * 进来时每个数字从 0 弹簧滚到本月值（owner 2026-10-08 设置页原型 v1，`CountUp`）；
 * ⛔ 不画图、不画环。
 */
export function SettingsUsageSection() {
  const t = useTranslations('Settings')
  const format = useFormatter()
  const { providers, totalRequests, totalEstimatedCostUsd, runner, isLoading } =
    useMonthlyUsage()

  const showRunner = runner?.enabled === true
  const resetDate = startOfNextMonthUTC()

  return (
    <section>
      {/* 手机顶栏已写着分区名（`SettingsShell`）：这里只留给读屏，⛔ 叠两个同名标题。 */}
      <h2 className="text-xl font-semibold max-lg:sr-only">
        {t('sections.usage')}
      </h2>

      {isLoading ? (
        <div className="mt-3 flex items-center gap-2 border-t border-border py-6 text-sm text-muted-foreground">
          <Spinner size="md" />
          {t('usage.loading')}
        </div>
      ) : providers.length === 0 && !showRunner ? (
        <p className="mt-3 border-t border-border py-6 text-sm text-muted-foreground">
          {t('usage.empty')}
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm lg:min-w-96">
            <thead>
              <tr className="text-2xs text-muted-foreground">
                <th
                  scope="col"
                  className="px-2 py-2 lg:px-3.5 text-left font-normal"
                >
                  {t('usage.columnProvider')}
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 lg:px-3.5 text-right font-normal"
                >
                  {t('usage.columnRequests')}
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 lg:px-3.5 text-right font-normal"
                >
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
                  <td className="px-2 py-2.5 lg:px-3.5">{provider.label}</td>
                  <td className="px-2 py-2.5 lg:px-3.5 text-right font-mono text-xs">
                    <CountUp value={provider.requests} format={formatCount} />
                  </td>
                  <td className="px-2 py-2.5 lg:px-3.5 text-right font-mono text-xs">
                    {provider.estimatedCostUsd === null ? null : (
                      <CountUp
                        value={provider.estimatedCostUsd}
                        format={formatUnitPriceAmount}
                      />
                    )}
                  </td>
                </tr>
              ))}
              {showRunner ? (
                <tr className="border-t border-border">
                  <td className="px-2 py-2.5 lg:px-3.5">
                    {t('usage.runnerLabel')}
                  </td>
                  <td className="px-2 py-2.5 lg:px-3.5 text-right font-mono text-xs">
                    {runner.exempt
                      ? runner.used
                      : t('usage.runnerQuota', {
                          used: runner.used,
                          limit: runner.limit,
                        })}
                  </td>
                  <td className="px-2 py-2.5 lg:px-3.5 text-right font-mono text-xs">
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
                <td className="px-2 py-2.5 lg:px-3.5">{t('usage.total')}</td>
                <td className="px-2 py-2.5 lg:px-3.5 text-right font-mono text-xs">
                  <CountUp
                    value={totalRequests + (showRunner ? runner.used : 0)}
                    format={formatCount}
                  />
                </td>
                <td className="px-2 py-2.5 lg:px-3.5 text-right font-mono text-xs">
                  {totalEstimatedCostUsd === null ? null : (
                    <CountUp
                      value={totalEstimatedCostUsd}
                      format={formatUnitPriceAmount}
                    />
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** 次数滚动途中也只显整数。 */
function formatCount(value: number): string {
  return String(Math.round(value))
}

/** Runner 额度按 UTC 自然月重置，与 `getRunnerUsage` 的月界同源。 */
function startOfNextMonthUTC(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
}
