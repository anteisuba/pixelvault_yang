'use client'

/**
 * 文本节点的**助手栏**（spec §2，画板 `Main.dc.html` 卡下那条 + `TextBarModel.dc.html`）。
 *
 * 一条 44px 玻璃胶囊：「让助手写一段…」+ 三颗 chip（续写 · 改写 · 写作模型）+ 发送。
 * 收起态与画中框最底那条是**同一个组件**（画板两页逐字一样），⛔ 不写两份。
 *
 * ⛔ 这里不调模型：发送 = 投一张便条给助手 dock（`text-assist-request.ts`），
 * 结果由助手以 `set_text` 落回正文，撤销走同一条栈（⌘Z）。
 */

import { useSyncExternalStore, useState } from 'react'
import { useTranslations } from 'next-intl'

import { ModelPickerPopover } from '@/components/business/studio-shared/pickers/ModelPickerPopover'
import { routeToStudioOption } from '@/components/business/studio-shared/pickers/MainModelPicker'
import { useLLMRoutePicker } from '@/hooks/use-llm-route-picker'
import { cn } from '@/lib/utils'

import { useOpenApiKeys } from '../../../workbench-v4/shell/ShellApiKeys'
import { NodePromptBar, renderPromptMentions } from '../chrome'
import {
  TEXT_ASSIST_ACTIONS,
  getCanvasWritingModel,
  requestCanvasTextAssist,
  setCanvasWritingModel,
  subscribeCanvasWritingModel,
  type TextAssistAction,
} from './text-assist-request'

export interface TextAssistantBarProps {
  readonly nodeId: string
  readonly className?: string
}

function useWritingModel(): string | null {
  return useSyncExternalStore(
    subscribeCanvasWritingModel,
    getCanvasWritingModel,
    () => null,
  )
}

export function TextAssistantBar({ nodeId, className }: TextAssistantBarProps) {
  const t = useTranslations('StudioNode.v4.text')
  const [value, setValue] = useState('')
  const [action, setAction] = useState<TextAssistAction | null>(null)
  const modelOptionId = useWritingModel()
  const { allRoutes } = useLLMRoutePicker('assistant')
  // 外壳没挂（测试 / `dev/ui-states`）时是 `null` —— 那一行就不渲染，⛔ 不抛。
  const openApiKeys = useOpenApiKeys()
  const options = allRoutes.map(routeToStudioOption)

  const actionChips = TEXT_ASSIST_ACTIONS.map((id) => (
    <button
      key={id}
      type="button"
      data-assist-action={id}
      data-active={action === id ? 'true' : undefined}
      aria-pressed={action === id}
      onClick={() => setAction((current) => (current === id ? null : id))}
      className={cn(
        'nodrag nopan inline-flex min-h-6 shrink-0 items-center rounded-md border px-2 py-0.5 text-2xs',
        'transition-colors duration-fast ease-standard motion-reduce:transition-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        action === id
          ? 'border-foreground text-foreground'
          : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground',
      )}
    >
      {t(`assist.${id}`)}
    </button>
  ))

  const modelChip = (
    <ModelPickerPopover
      key="model"
      options={options}
      value={modelOptionId}
      onChange={(option) => setCanvasWritingModel(option.optionId)}
      memoryScope="llm_assist"
      side="top"
      triggerEmptyLabel={t('assist.model')}
      className="shrink-0"
      {...(openApiKeys ? { onManageChannels: openApiKeys } : {})}
    />
  )

  return (
    <NodePromptBar
      value={value}
      onValueChange={setValue}
      onSubmit={() => {
        const prompt = value.trim()
        if (prompt.length === 0) return
        requestCanvasTextAssist({
          nodeId,
          prompt,
          ...(action ? { action } : {}),
          ...(modelOptionId ? { modelOptionId } : {}),
        })
        setValue('')
      }}
      placeholder={t('assist.placeholder')}
      ariaLabel={t('assist.ariaLabel')}
      // `@` 引用画在**输入框内部**（S0-fix2 的 `renderValue`）。这一栏拿不到画布
      // 的名字表（它挂在助手坞里，不在 `NodeV4Provider` 之内），走宽松档
      // ——⛔ 宁可少切一个 chip，也不要把半句话吞成名字（`parse-mentions` 头注）。
      renderValue={(text) => renderPromptMentions(text)}
      chips={[...actionChips, modelChip]}
      {...(className ? { className } : {})}
    />
  )
}
