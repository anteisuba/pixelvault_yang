'use client'

/**
 * 绑在**一个节点**上的模型 chip（spec §1.6 方案 A）。
 *
 * 弹层本体是共用的 `ModelPickerPopover`；这一层只做三件一模一样的事：读这一档
 * 的模型清单、`set_model`、缺 key 时把「配置渠道」接到外壳的抽屉上（Hard Rule 8）。
 * 图片 / 音频卡与 S12 的手机底部抽屉共用**这一份**，⛔ 不在每个形态里再抄一遍
 * 那段 `onChange`。
 *
 * ⚠ 清单为空 = 整颗 chip 不渲染（Hard Rule 8 的组级不可用：不做禁用占位）。
 */

import type { NodeWorkflowMediaKind } from '@/constants/node-types'

import {
  ModelPickerPopover,
  type ModelPickerGroupBy,
} from '@/components/business/studio-shared/pickers/ModelPickerPopover'
import { useOpenApiKeys } from '../../../workbench-v4/shell/ShellApiKeys'
import { useNodeV4Canvas } from '../NodeV4Context'
import { toStudioModelOption } from '../image/image-node-model'

export interface NodeModelChipProps {
  readonly nodeId: string
  readonly kind: NodeWorkflowMediaKind
  /** 节点上落着的 `model.optionId`（没选过就是 `null`）。 */
  readonly value: string | null
  /** 音频栏换分组维度（语音 / 配乐 / 音效），其余用默认的厂商系列。 */
  readonly groupBy?: ModelPickerGroupBy
  readonly disabled?: boolean
  readonly triggerEmptyLabel?: string
}

export function NodeModelChip({
  nodeId,
  kind,
  value,
  groupBy,
  disabled = false,
  triggerEmptyLabel,
}: NodeModelChipProps) {
  const canvas = useNodeV4Canvas()
  const openApiKeys = useOpenApiKeys()
  const modelOptions = canvas.modelOptionsByKind[kind] ?? []
  if (modelOptions.length === 0) return null

  return (
    <ModelPickerPopover
      options={modelOptions.map(toStudioModelOption)}
      value={value}
      memoryScope={kind}
      {...(groupBy ? { groupBy } : {})}
      {...(openApiKeys ? { onManageChannels: openApiKeys } : {})}
      {...(triggerEmptyLabel ? { triggerEmptyLabel } : {})}
      disabled={disabled}
      onChange={(option) => {
        const picked = modelOptions.find(
          (item) => item.optionId === option.optionId,
        )
        if (!picked) return
        canvas.onSetModel(nodeId, {
          optionId: picked.optionId,
          modelId: picked.modelId,
          adapterType: picked.adapterType,
          providerConfig: picked.providerConfig,
          ...(picked.apiKeyId ? { apiKeyId: picked.apiKeyId } : {}),
        })
      }}
    />
  )
}
