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

import { useSyncExternalStore, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { ModelPickerPopover } from '@/components/business/studio-shared/pickers/ModelPickerPopover'
import { routeToStudioOption } from '@/components/business/studio-shared/pickers/MainModelPicker'
import { useLLMRoutePicker } from '@/hooks/use-llm-route-picker'
import { useModelChannelGate } from '@/hooks/use-model-channel-gate'
import { cn } from '@/lib/utils'

import { useKeySettingsAction } from '../../../workbench-v4/shell/ShellKeySettings'
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
  readonly variant?: 'card' | 'document'
  /** 底行最左一格（透传 `NodePromptBar.lead`）：画布停靠栏的「对象」药丸。 */
  readonly lead?: ReactNode
  /**
   * 没发出去的那句话**由宿主持有**（与图片 / 视频卡的 `draft` 同一机制：卡组件自己的
   * state，⛔ 不落节点字段、⛔ 不落库）。这一栏是停靠条，取消选中就卸载 —— 草稿要是住
   * 在这里面，点空白再点回来就没了（2026-11-21 走查）。文字卡把同一份交给停靠条与文档纸。
   */
  readonly draft: string
  onDraftChange(next: string): void
}

function useWritingModel(): string | null {
  return useSyncExternalStore(
    subscribeCanvasWritingModel,
    getCanvasWritingModel,
    () => null,
  )
}

export function TextAssistantBar({
  nodeId,
  className,
  variant = 'card',
  lead,
  draft: value,
  onDraftChange: setValue,
}: TextAssistantBarProps) {
  const t = useTranslations('StudioNode.v4.text')
  const tPicker = useTranslations('ModelPicker')
  // 写作模型也可能有多条渠道 —— 没选就发不出去（D2 Q1）。这一栏只挂一个选择器，
  // 所以 gateId 用默认（= scope）。
  const channelGate = useModelChannelGate('llm_assist')
  const [action, setAction] = useState<TextAssistAction | null>(null)
  const modelOptionId = useWritingModel()
  const { allRoutes } = useLLMRoutePicker('assistant')
  // 外壳没挂（测试 / `dev/ui-states`）时是 `null` —— 那一行就不渲染，⛔ 不抛。
  const openKeySettings = useKeySettingsAction()
  const options = allRoutes.map(routeToStudioOption)
  const documentBar = variant === 'document'

  const actionChips = TEXT_ASSIST_ACTIONS.map((id) => (
    <button
      key={id}
      type="button"
      data-assist-action={id}
      data-active={action === id ? 'true' : undefined}
      aria-pressed={action === id}
      onClick={() => setAction((current) => (current === id ? null : id))}
      // 停靠栏与文档纸是同一套 32 高填充药丸（和「对象」药丸、模型 chip 一排齐高）。
      className={cn(
        'nodrag nopan inline-flex h-8 shrink-0 items-center rounded-full bg-surface-fill px-2.5 text-2sm text-foreground hover:tint-hover',
        'transition-colors duration-fast ease-standard motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:shadow-focus',
        action === id && 'bg-surface-fill-track',
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
      // 停靠栏与文档纸两档都和同排「对象」药丸、续写 / 改写、发送键同一套 32 高：盖掉画布密度给
      // 触发器的 28 高 · 12 号字（`ModelPickerPopover` 的 compact 档，图片 / 音频卡还在用，⛔ 改默认）。
      className="h-8 shrink-0 gap-1 bg-surface-fill px-2.5 text-2sm hover:tint-hover"
      {...(openKeySettings ? { onManageChannels: openKeySettings } : {})}
    />
  )

  return (
    <NodePromptBar
      {...(lead ? { lead } : {})}
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
      compact={documentBar}
      {...(channelGate.blocked
        ? {
            blockedLabel: tPicker('pickChannel'),
            onBlockedClick: channelGate.requestPick,
          }
        : {})}
      {...(className ? { className } : {})}
    />
  )
}
