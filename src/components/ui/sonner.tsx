'use client'

import type { CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { Toaster as Sonner } from 'sonner'

import { Check } from '@/components/icons'
import { Spinner } from '@/components/ui/spinner'

/** 红点 = 失败（owner 2026-10-08：失败类黑条用红点代替对勾，⛔ 整条变红）。 */
function FailureDot() {
  return <span aria-hidden className="toast-bar-dot bg-destructive" />
}

function WarningDot() {
  return <span aria-hidden className="toast-bar-dot bg-status-warning" />
}

/** 黑条最宽多少：比 sonner 默认的 356 宽一点，中日文一句话不折行。 */
const TOAST_BAR_MAX_WIDTH_PX = 440

/**
 * 全站 toast = **底部正中的黑色小条**（owner 2026-10-08「提示与弹窗」第 1 题 C）。
 *
 * · 只给**后台跑完**的事（出图完成 / 失败、上传完成、删完可撤销）；点按钮得到的结果
 *   在键上说（`FeedbackButton`），⛔ 不弹条。
 * · 最多叠 3 条：新的在最前，旧的往上推、缩小、变淡（sonner 的折叠堆叠 + globals.css
 *   `.toast-bar` 那段补的透明度）。每条最多带一个动作（查看 / 撤销 / 重试）。
 * · 失败 = 红点，成功 = 对勾，进行中 = 转圈。
 * · 浮在底部输入框之上：位置读 `--toast-offset-bottom`，工作台 / 画布的底部输入框用
 *   `useToastLift` 把它抬高。
 *
 * ⚠ `unstyled`：sonner 自带的皮肤是写在页面里的不分层 CSS，Tailwind 工具类（分层）
 *   压不过它。所以整条的长相写在 globals.css `.toast-bar`（也不分层）。
 * ⚠ 业务代码照旧 `toast.success / toast.error(...)`，⛔ 不为换皮改调用方。
 */
export function Toaster() {
  const t = useTranslations('Feedback')
  return (
    <Sonner
      position="bottom-center"
      visibleToasts={3}
      gap={8}
      offset={{ bottom: 'var(--toast-offset-bottom)' }}
      mobileOffset={{
        bottom: 'var(--toast-offset-bottom)',
        left: '1rem',
        right: '1rem',
      }}
      style={{ '--width': `${TOAST_BAR_MAX_WIDTH_PX}px` } as CSSProperties}
      containerAriaLabel={t('notifications')}
      icons={{
        success: <Check className="size-3.5" aria-hidden />,
        error: <FailureDot />,
        warning: <WarningDot />,
        info: null,
        loading: <Spinner size="sm" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: 'toast-bar',
          content: 'toast-bar-content',
          title: 'toast-bar-title',
          description: 'toast-bar-description',
          icon: 'toast-bar-icon',
          actionButton: 'toast-bar-action',
          cancelButton: 'toast-bar-cancel',
          closeButton: 'toast-bar-close',
        },
      }}
    />
  )
}
