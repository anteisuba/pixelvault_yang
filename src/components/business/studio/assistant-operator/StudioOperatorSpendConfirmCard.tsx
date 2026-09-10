'use client'

/**
 * **生成确认卡**（v2 §3.3 第二种来源 / §5）。
 *
 * ⭐ 这是整条链上唯一一处**用户按下去就会花钱**的地方（拍板 2 的新形态：扳机从
 * 工作台挪到卡上，但按的人没变）。卡上三件事：哪个模型、几张、什么规格。
 *
 * ⚠ **没有花费读数、也没有「本会话此类不再问」**（决策 8）：花费确认整条删掉，
 * 那颗勾选是它的配件，一起走。⛔ 别把它们找回来 —— 面板上不再有花费这条线。
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
 */

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
  /** 「确认生成」—— ⚠ 扳机在宿主那颗生成键上，⛔ 不重发一轮（§5）。 */
  onConfirm(): void
  onCancel(): void
}

export function StudioOperatorSpendConfirmCard({
  request,
  resolved = false,
  onConfirm,
  onCancel,
}: StudioOperatorSpendConfirmCardProps) {
  const t = useTranslations('StudioOperator')
  const tAdvanced = useTranslations('AdvancedSettings')
  const specs = [
    request.specs.aspectRatio,
    request.specs.resolution,
    request.specs.quality
      ? tAdvanced(`qualityOption.${request.specs.quality}`)
      : null,
    request.specs.background
      ? tAdvanced(`backgroundOption.${request.specs.background}`)
      : null,
    request.specs.preview ? tAdvanced('preview') : null,
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
            'text-md font-semibold',
            resolved ? 'text-muted-foreground' : 'text-status-warning',
          )}
        >
          {resolved ? t('spend.resolved') : t('spend.title')}
        </span>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 p-3 text-2sm">
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
      </dl>

      {/* ⛔ 处理过之后**两颗按钮整个不画**：那颗「生成」是真的会花钱，留一颗
          停用的在那儿只会引来第二次点击（disabled 按钮在触摸屏上尤其难判）。 */}
      {resolved ? null : (
        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/45 px-3 py-2">
          <button
            type="button"
            data-testid="operator-spend-cancel"
            onClick={onCancel}
            className="rounded-md px-1.5 py-0.5 text-2sm text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('spend.cancel')}
          </button>
          <button
            type="button"
            data-testid="operator-spend-confirm"
            onClick={() => onConfirm()}
            className="rounded-md bg-primary px-2 py-1 text-2sm text-primary-foreground transition-opacity duration-(--duration-fast) ease-standard hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('spend.confirm')}
          </button>
        </div>
      )}
    </div>
  )
}
