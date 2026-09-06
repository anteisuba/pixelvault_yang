'use client'

/**
 * **花钱硬确认卡**（§6 第三档 / §11.4「花钱确认」/ §3.1 ⑮–⑰）。
 *
 * ⭐ 这是整条链上唯一一处**用户按下去就会花钱**的地方（拍板 2 的新形态：扳机从
 * 工作台挪到卡上，但按的人没变）。所以卡上四件事一件都不能少：哪个模型、几张、
 * 什么规格、大概多少 credits。
 *
 * ⚠ 「本会话此类不再问」的作用域是**三要素**（拍板 24）：同会话 + 同模型 +
 * 单次不超本次金额。前两条与第三条分别由客户端与服务端各守一半 —— 这颗组件只负责
 * 把那个勾选交出去，⛔ 不自己记任何东西（服务端更是一点记忆都不存）。
 * 🔬 contrast-check（2026-09-06）：标题 `text-status-warning` 对卡底 **浅 5.81 /
 * 深 9.58**（AA 正常文本 4.5 ✓）；`dl` 里的值 `text-foreground` 浅 19.80 / 深 17.18；
 * 注脚 `text-muted-foreground` 对 `bg-muted/45` 叠在卡底上 浅 5.31 / 深 6.45；
 * 主按钮 `text-primary-foreground` 对 `bg-primary` 21.00 / 21.00。
 * ⚠ 唯一不到 3:1 的是那圈 `border-status-warning/40`（浅 1.85 / 深 2.84）——
 * 它是**装饰性强化**，不是这张卡的警示信号本身；警示由标题文字承担（上面那两个数）。
 * §11.4 把这条描边写死在配方里，所以这里不改值，只把它的用途降级写明。
 *
 * 🔬 contrast-check（2026-09-06，切片 3a 新增的 `.resolved` 一档）：标题转
 * `text-muted-foreground` 对卡底 浅 **5.49** / 深 **6.94**（AA 正常文本 4.5 ✓）。
 *
 * ⚠ 算不出金额时**不画那一行，也不给勾选**：「不再问」的判据里就有金额，没有金额
 * 就没有可比的上限，那颗勾选点了也不会命中（服务端那侧 `credits === undefined`
 * 一律不放行）。摆一颗永远无效的勾选，比没有它坏。
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'
import type { AssistantOperatorGenerationRequest } from '@/types/assistant-operator'

interface StudioOperatorSpendConfirmCardProps {
  request: AssistantOperatorGenerationRequest
  /**
   * 已经点过「生成」了（§4.2 确认卡的 `.resolved` 那一档，切片 3a 接线时加）。
   *
   * ⚠ 住在 store 不住在卡里：收放法则（拍板 7）随时卸载面板，卡自己记的下场是
   * 收一下再展开，那颗**会花钱**的按钮又变回可点的 —— 而这一枪已经发出去了。
   */
  resolved?: boolean
  /** 「生成」—— `rememberForSession` 为真时宿主在重发里带上 `autoApprove`。 */
  onConfirm(input: { rememberForSession: boolean }): void
  onCancel(): void
}

export function StudioOperatorSpendConfirmCard({
  request,
  resolved = false,
  onConfirm,
  onCancel,
}: StudioOperatorSpendConfirmCardProps) {
  const t = useTranslations('StudioOperator')
  const [remember, setRemember] = useState(false)

  const credits = request.estimate.credits
  const specs = [
    request.specs.aspectRatio,
    request.specs.resolution,
    request.specs.durationSeconds === null
      ? null
      : t('spend.seconds', { seconds: request.specs.durationSeconds }),
  ].filter((value): value is string => Boolean(value))

  return (
    <div
      data-testid="operator-spend-card"
      data-resolved={resolved}
      className={cn(
        'overflow-hidden rounded-xl border border-status-warning/40 bg-card',
        resolved && 'opacity-[.92]',
      )}
    >
      <div className="border-b border-border px-3 py-2">
        <span
          className={cn(
            'text-xs font-semibold',
            resolved ? 'text-muted-foreground' : 'text-status-warning',
          )}
        >
          {resolved ? t('spend.resolved') : t('spend.title')}
        </span>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 p-3 text-2xs">
        <dt className="text-muted-foreground">{t('spend.model')}</dt>
        <dd data-testid="operator-spend-model" className="text-foreground">
          {request.model.label}
        </dd>
        <dt className="text-muted-foreground">{t('spend.count')}</dt>
        <dd data-testid="operator-spend-count" className="text-foreground">
          {request.count}
        </dd>
        {specs.length > 0 ? (
          <>
            <dt className="text-muted-foreground">{t('spend.specs')}</dt>
            <dd data-testid="operator-spend-specs" className="text-foreground">
              {specs.join(' · ')}
            </dd>
          </>
        ) : null}
        {credits === undefined ? null : (
          <>
            <dt className="text-muted-foreground">{t('spend.estimate')}</dt>
            <dd
              data-testid="operator-spend-credits"
              className="font-mono text-sm font-semibold text-foreground"
            >
              {t('spend.credits', { credits })}
            </dd>
          </>
        )}
      </dl>

      {credits === undefined || resolved ? null : (
        <label className="flex items-center gap-2 px-3 pb-3 text-2xs text-muted-foreground">
          <input
            type="checkbox"
            data-testid="operator-spend-remember"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="size-3.5 accent-primary"
          />
          {t('spend.remember')}
        </label>
      )}

      {/* ⛔ 处理过之后**两颗按钮整个不画**：那颗「生成」是真的会花钱，留一颗
          停用的在那儿只会引来第二次点击（disabled 按钮在触摸屏上尤其难判）。 */}
      {resolved ? null : (
        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/45 px-3 py-2">
          <button
            type="button"
            data-testid="operator-spend-cancel"
            onClick={onCancel}
            className="rounded-md px-1.5 py-0.5 text-2xs text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('spend.cancel')}
          </button>
          <button
            type="button"
            data-testid="operator-spend-confirm"
            onClick={() => onConfirm({ rememberForSession: remember })}
            className="rounded-md bg-primary px-2 py-1 text-2xs text-primary-foreground transition-opacity duration-(--duration-fast) ease-standard hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('spend.confirm')}
          </button>
        </div>
      )}
    </div>
  )
}
