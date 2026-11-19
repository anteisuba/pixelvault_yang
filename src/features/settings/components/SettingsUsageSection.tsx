'use client'

import { useFormatter, useTranslations } from 'next-intl'

import { formatUnitPriceAmount } from '@/constants/models/unit-prices'
import { useMonthlyUsage } from '@/features/settings/hooks/use-monthly-usage'
import type { RunnerUsageResult } from '@/types'
import { CountUp } from '@/components/ui/count-up'
import { Spinner } from '@/components/ui/spinner'

/** 没有单价数据的花费格。 */
const NO_PRICE = '—'

/**
 * `/settings/usage`（D3 ④ usage 画板）——**只显数字**：provider · 本月次数 ·
 * 估算花费，最后一行合计。⛔ 不画环、⛔ 不设预算。
 *
 * 花费是「次数 × 该模型单价」累加出来的估算，表上方一句话把口径说清；一家里**没有
 * 任何模型有可信单价**时那一格写「—」（⛔ 留空白：空白读起来像没加载完）。
 *
 * Runner 额度**单独一块**、在表下面（2026-11-19 真机走查：塞在表里的「Runner · 自托管
 * 49 / 100」和表里那行「ANTEI Runner 144」看不出是什么关系）。两个数口径不同：
 * 额度按出图任务数，表按每次请求（含失败与重试）——这一块那句人话就是说这个。
 * 合计只加表里的行：Runner 的请求已经在表里，⛔ 再把额度读数加一遍。
 *
 * 进来时每个数字从 0 弹簧滚到本月值（owner 2026-10-08 设置页原型 v1，`CountUp`）。
 */
export function SettingsUsageSection() {
  const t = useTranslations('Settings')
  const { providers, totalRequests, totalEstimatedCostUsd, runner, isLoading } =
    useMonthlyUsage()

  const showRunner = runner?.enabled === true

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
      ) : (
        <>
          {providers.length === 0 ? (
            <p className="mt-3 border-t border-border py-6 text-sm text-muted-foreground">
              {t('usage.empty')}
            </p>
          ) : (
            <div className="mt-3">
              <p
                id="settings-usage-cost-note"
                className="text-xs text-muted-foreground"
              >
                {t('usage.costNote')}
              </p>
              <div className="mt-2 overflow-x-auto">
                <table
                  aria-describedby="settings-usage-cost-note"
                  className="w-full border-collapse text-sm lg:min-w-96"
                >
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
                        <td className="px-2 py-2.5 lg:px-3.5">
                          {provider.label}
                        </td>
                        <td className="px-2 py-2.5 lg:px-3.5 text-right font-mono text-xs">
                          <CountUp
                            value={provider.requests}
                            format={formatCount}
                          />
                        </td>
                        <td className="px-2 py-2.5 lg:px-3.5 text-right font-mono text-xs">
                          <CostCell amount={provider.estimatedCostUsd} />
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-border font-medium">
                      <td className="px-2 py-2.5 lg:px-3.5">
                        {t('usage.total')}
                      </td>
                      <td className="px-2 py-2.5 lg:px-3.5 text-right font-mono text-xs">
                        <CountUp value={totalRequests} format={formatCount} />
                      </td>
                      <td className="px-2 py-2.5 lg:px-3.5 text-right font-mono text-xs">
                        <CostCell amount={totalEstimatedCostUsd} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showRunner ? <RunnerQuota runner={runner} /> : null}
        </>
      )}
    </section>
  )
}

function CostCell({ amount }: { amount: number | null }) {
  const t = useTranslations('Settings')
  if (amount === null) {
    return (
      <>
        <span aria-hidden>{NO_PRICE}</span>
        <span className="sr-only">{t('usage.noPrice')}</span>
      </>
    )
  }
  return <CountUp value={amount} format={formatUnitPriceAmount} />
}

/** Runner 免费额度：单独一块，一个读数 + 一句「这是什么、何时重置、为什么和表里的数不一样」。 */
function RunnerQuota({ runner }: { runner: RunnerUsageResult }) {
  const t = useTranslations('Settings')
  const format = useFormatter()
  const date = format.dateTime(startOfNextMonthUTC(), {
    month: '2-digit',
    day: '2-digit',
  })

  return (
    <div
      data-testid="settings-runner-quota"
      className="mt-8 border-t border-border pt-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">{t('usage.runnerTitle')}</h3>
        <span className="font-mono text-sm">
          {runner.exempt
            ? runner.used
            : t('usage.runnerQuota', {
                used: runner.used,
                limit: runner.limit,
              })}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {runner.exempt
          ? t('usage.runnerExplainExempt', { date })
          : t('usage.runnerExplain', { limit: runner.limit, date })}
      </p>
    </div>
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
