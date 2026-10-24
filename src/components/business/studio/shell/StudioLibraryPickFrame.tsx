'use client'

import { useContext, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { StudioLibraryTargetContext } from '@/components/business/studio/shell/StudioLibraryOverlay'
import { Button } from '@/components/ui/button'

/**
 * 台传送进库那一格的挑选界面外面那一圈（第 9f 步 9f-2d）：顶上「选给 XX 台」+「完成」，
 * 下面是台自己的挑选。挑了就当场落到台上（台就在右边看得见），「完成」只是把库收起。
 * 自带头部的挑选（任务型素材挑选）不套这一圈。
 */
export function StudioLibraryPickFrame({
  benchLabel,
  children,
}: {
  benchLabel: string
  children: ReactNode
}) {
  const t = useTranslations('StudioShell')
  const close = useContext(StudioLibraryTargetContext)?.close
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <p className="min-w-0 truncate text-sm text-muted-foreground">
          {t('pickFor', { bench: benchLabel })}
        </p>
        <Button
          type="button"
          size="sm"
          className="ml-auto"
          onClick={() => close?.()}
        >
          {t('pickDone')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  )
}
