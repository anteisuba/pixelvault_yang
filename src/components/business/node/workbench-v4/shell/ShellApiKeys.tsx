'use client'

/**
 * 画布外壳里那个**「配置渠道与 key」**的命令式入口（S7 §7）。
 *
 * 现成的 `ApiKeyDrawerTrigger` 是**触发器式**的（要一颗自己的按钮当 children），
 * 而画布上需要它的地方全是别人的浮层里的一行 —— `ModelPickerPopover` 的
 * `onManageChannels` 页脚、⌘K 的动作组。所以这里把同一个抽屉翻成
 * 「一个函数 + 一个宿主」：抽屉本体只在外壳挂一份，谁要就 `useOpenApiKeys()()`。
 *
 * ⚠ 抽屉内容仍是 `ApiKeyManager`（与 Studio 那侧同一个），⛔ 不为画布另写一套
 * key 管理界面；Hard Rule 8 的「缺 key 不禁用 UI，路由到内联配置」由
 * `QuickSetupDialog` 在各自的模型行上负责，本入口是**通盘管理**那条，两者不重叠。
 */

import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { X } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { ApiKeyManager } from '@/components/business/ApiKeyManager'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'

/**
 * `null` = 外壳没挂（`NodeWorkbenchV4` 之外渲染的卡，比如测试与 `dev/ui-states`）。
 * 消费方据此决定要不要给出那一行，⛔ 不抛 —— 少一个入口比白屏好。
 */
const OpenApiKeysContext = createContext<(() => void) | null>(null)

/** 谁要「配置渠道与 key」就调这个；外壳没挂时返回 `null`。 */
export function useOpenApiKeys(): (() => void) | null {
  return useContext(OpenApiKeysContext)
}

export function ShellApiKeysProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('StudioApiKeys')
  const [open, setOpen] = useState(false)
  const openApiKeys = useMemo(() => () => setOpen(true), [])

  return (
    <OpenApiKeysContext.Provider value={openApiKeys}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          className="inset-y-2 right-2 h-auto w-[calc(100%-1rem)] gap-0 overflow-hidden rounded-2xl border bg-background/95 p-0 shadow-xl sm:max-w-3xl"
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">{t('sheetTitle')}</SheetTitle>
          <SheetDescription className="sr-only">
            {t('sheetDescription')}
          </SheetDescription>
          <SheetClose
            aria-label={t('closeLabel')}
            className="absolute right-2 top-2 z-10 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <X className="size-5" />
          </SheetClose>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-12 sm:px-6">
            <ApiKeyManager />
          </div>
        </SheetContent>
      </Sheet>
    </OpenApiKeysContext.Provider>
  )
}
