'use client'

import { useState } from 'react'

import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import { WorkflowModelPicker } from '@/components/business/node/WorkflowModelPicker'
import type { NodeWorkflowMediaKind } from '@/constants/node-types'
import type {
  NodeWorkflowModelOption,
  NodeWorkflowModelSelection,
} from '@/types/node-workflow'

interface DetailModelPickerProps {
  value: NodeWorkflowModelSelection | undefined
  options: NodeWorkflowModelOption[]
  onChange(model: NodeWorkflowModelSelection): void
  kind: NodeWorkflowMediaKind
}

/**
 * 详情面板的模型选择器 —— `WorkflowModelPicker` + 缺 key 时的内联配置出口。
 *
 * ⚠ 这是 **Hard Rule 8** 在详情面板里的落点：「缺 API key 时不禁用 UI，路由到
 * `QuickSetupDialog` 内联配置」。`WorkflowModelPicker` 会把需要 key 的模型分到
 * 「需要 key」那一组并回调 `onClickLocked`，**但不接这个回调就等于点了没反应** ——
 * 用户看得见那个模型、点得下去、什么都不发生，比直接禁用还糟。
 * 十族里此前只有 `GenerateComposer` 接了它，detail 线一处都没有。
 *
 * ⚠ 账本 X3 原本写的是「options 为空时 `NodeModelSelector` 静默塌段，违反
 * Hard Rule 8」。核完事实后**改了修法**：`options` 只有在模型目录里该模态一个
 * 可用模型都没有时才为空（`useWorkflowModelOptions` 把需要 key 的模型也列出来，
 * 交给 `onClickLocked` 处理）。那是**组级不可用**，按契约 R3 整栏不渲染才是对的；
 * 真正的 Hard Rule 8 缺口是这里 —— 没人接 `onClickLocked`。
 */
export function DetailModelPicker({
  value,
  options,
  onChange,
  kind,
}: DetailModelPickerProps) {
  const [lockedOption, setLockedOption] =
    useState<NodeWorkflowModelOption | null>(null)

  // 组级不可用 → 整栏不渲染（R3）。阻塞信息由动作坞那一行承担（R4：只有真正
  // 阻塞主动作的那一个发声），不在这里再放一句解释。
  if (options.length === 0) return null

  return (
    <>
      <WorkflowModelPicker
        value={value}
        options={options}
        onChange={onChange}
        onClickLocked={setLockedOption}
        kind={kind}
      />
      {lockedOption ? (
        <QuickSetupDialog
          open
          onOpenChange={(open) => {
            if (!open) setLockedOption(null)
          }}
          modelId={lockedOption.modelId}
          modelLabel={lockedOption.modelId}
          adapterType={lockedOption.adapterType}
          optionId={lockedOption.optionId}
          onVerified={(optionId) => {
            const verified = options.find(
              (option) => option.optionId === optionId,
            )
            if (verified) {
              onChange({
                optionId: verified.optionId,
                modelId: verified.modelId,
                adapterType: verified.adapterType,
                providerConfig: verified.providerConfig,
                apiKeyId: verified.apiKeyId,
              })
            }
            setLockedOption(null)
          }}
        />
      ) : null}
    </>
  )
}
