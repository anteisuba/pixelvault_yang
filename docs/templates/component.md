# 模板 · 业务组件

> 约定蒸馏（`src/components/business/**` 通行模式）。层级判据：`ui/`=无业务原语 · `business/`=域组件 · `studio-shared/`=跨 Studio 复用（见 `references/frontend.md`）。

```tsx
'use client'

import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorAlert } from '@/components/ui/error-alert'
import { useThings } from '@/hooks/use-things' // 数据一律经 hook → api-client，组件里禁 fetch

interface ThingPanelProps {
  projectId: string | null
  onSelect?: (id: string) => void
}

export function ThingPanel({ projectId, onSelect }: ThingPanelProps) {
  const t = useTranslations('ThingPanel') // 新 namespace 三语齐（en/ja/zh）；优先并入既有页面域 ns
  const { things, isLoading, error } = useThings(projectId)

  if (error)
    return <ErrorAlert message={t('loadError')}>{/* 重试按钮 */}</ErrorAlert>

  if (!isLoading && things.length === 0) {
    // 空态只走原语；新落点登记进 src/test/empty-state.contract.test.ts 的 LANDING_POINTS
    return (
      <EmptyState
        title={t('emptyTitle')}
        description={t('emptyHint')}
        action={
          <Button type="button" className="rounded-full">
            {t('emptyAction')}
          </Button>
        }
      />
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {things.map((thing) => (
        <li key={thing.id}>
          <button
            type="button"
            onClick={() => onSelect?.(thing.id)}
            className="min-h-11 w-full rounded-md bg-card px-3 text-left transition-colors duration-fast hover:bg-accent"
          >
            {thing.name}
          </button>
        </li>
      ))}
    </ul>
  )
}
```

要点：语义 token 不用任意值/硬编码色 · 触达区 ≥44px（`min-h-11`）· 圆角按阶梯（控件 md · 卡片/弹层 lg）· 披露用 ResponsiveDialog/Popover（覆层矩阵）· 弹窗不 autofocus（触屏键盘策略）· 同目录补 `.test.tsx`（RTL 测交互）。
