/**
 * 节点卡的缺 key 闸（Hard Rule 8）—— 图 / 视频 / 声音三张卡**同一份**。
 *
 * 名单回来、而这张卡的型号确定跑不起来：发送键左边写「先配 key」，点发送就地开
 * `QuickSetupDialog`，验证过才发（⛔ 跳 `/settings/keys`）。
 * - 卡上那家没 key、同型号另一家配好了 → `channelFallback`：发送键旁写「X 没 key，
 *   改走 Y」，点一下才切（owner 2026-10-15：⛔ 偷偷换厂商）。
 * - 多厂商一家都没配 → 弹窗顶上让他挑配哪家，默认单价最低的那家。
 *
 * 用法：`useNodeKeyGate` 给状态，宿主在 JSX 里挂 `<NodeKeySetupDialog gate={…}
 * onVerified={…} />`（发送函数在 hook 之后才声明，回调走 prop 交进来）。
 */

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import { useApiKeysContextOptional } from '@/contexts/api-keys-context'
import { isMissingKeyModelOption } from '@/hooks/use-split-model-options'
import {
  findModelChannelSiblings,
  findRunnableSiblingChannel,
  pickCheapestChannel,
} from '@/lib/model-channel-fallback'
import { getTranslatedModelLabel } from '@/lib/model-options'
import type {
  NodeWorkflowModelOption,
  NodeWorkflowModelSelection,
} from '@/types/node-workflow'
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'

import {
  toNodeModelSelection,
  toStudioModelOption,
} from './image/image-node-model'

export interface NodeKeyGateOptions {
  readonly modelOptions: readonly NodeWorkflowModelOption[]
  readonly effectiveModel: NodeWorkflowModelSelection | undefined
}

type ChannelChoices = NonNullable<
  ReturnType<typeof findModelChannelSiblings>
>['channels']

export interface NodeKeyGate {
  readonly missingKey: boolean
  readonly channelFallback: ReturnType<typeof findRunnableSiblingChannel>
  /** 回落那一家的选择（宿主用 `set_model` 落到卡上）。 */
  readonly fallbackModel: NodeWorkflowModelSelection | undefined
  openKeySetup(): void
  /** 弹窗要配的那一家；`null` = 弹窗没开。 */
  readonly setupOption: NodeWorkflowModelOption | null
  readonly selectedOptionId: string | undefined
  readonly choices: ChannelChoices | null
  setChannelId(channelId: string): void
  close(): void
}

export function useNodeKeyGate({
  modelOptions,
  effectiveModel,
}: NodeKeyGateOptions): NodeKeyGate {
  const apiKeys = useApiKeysContextOptional()
  const selectedOption = effectiveModel
    ? modelOptions.find((option) => option.optionId === effectiveModel.optionId)
    : undefined
  const missingKey = selectedOption
    ? isMissingKeyModelOption(
        toStudioModelOption(selectedOption),
        apiKeys?.hasLoaded ?? false,
      )
    : false
  const studioModelOptions = useMemo(
    () => modelOptions.map(toStudioModelOption),
    [modelOptions],
  )
  const channelFallback =
    missingKey && selectedOption
      ? findRunnableSiblingChannel(studioModelOptions, selectedOption.optionId)
      : null
  const fallbackOption = channelFallback
    ? modelOptions.find(
        (option) => option.optionId === channelFallback.fallback.channelId,
      )
    : undefined
  const choices = useMemo(() => {
    if (!missingKey || !selectedOption || channelFallback) return null
    const siblings = findModelChannelSiblings(
      studioModelOptions,
      selectedOption.optionId,
    )
    return siblings && siblings.channels.length > 1 ? siblings.channels : null
  }, [missingKey, selectedOption, channelFallback, studioModelOptions])
  const [open, setOpen] = useState(false)
  /** 弹窗里挑的那一家；null = 卡上那一家（多家时默认最便宜那家）。 */
  const [channelId, setChannelId] = useState<string | null>(null)
  const setupOption = (() => {
    if (!open || !selectedOption) return null
    const picked =
      channelId ??
      (choices ? pickCheapestChannel(choices)?.channelId : undefined)
    return (
      modelOptions.find((option) => option.optionId === picked) ??
      selectedOption
    )
  })()

  return {
    missingKey,
    channelFallback,
    fallbackModel: fallbackOption
      ? toNodeModelSelection(fallbackOption)
      : undefined,
    openKeySetup: () => {
      setChannelId(null)
      setOpen(true)
    },
    setupOption,
    selectedOptionId: selectedOption?.optionId,
    choices,
    setChannelId,
    close: () => setOpen(false),
  }
}

export function NodeKeySetupDialog({
  gate,
  onVerified,
  priceOf,
}: {
  readonly gate: NodeKeyGate
  /**
   * 验证过 key：把用户点的那一枪发出去。`model` = 弹窗里换了一家 → 这一枪走那一家。
   */
  readonly onVerified: (model: NodeWorkflowModelSelection | undefined) => void
  /** 多厂商挑选行上的单价（`null` = 不知道）；不传就不写价。 */
  readonly priceOf?: (modelId: string) => string | null
}) {
  const tModels = useTranslations('Models')
  const option = gate.setupOption
  if (!option) return null
  return (
    <QuickSetupDialog
      open
      onOpenChange={(next) => {
        if (!next) gate.close()
      }}
      modelId={option.modelId}
      modelLabel={getTranslatedModelLabel(tModels, option.modelId)}
      adapterType={option.adapterType}
      optionId={option.optionId}
      selectStudioModel={false}
      {...(gate.choices
        ? {
            channelChoices: gate.choices.map((channel) => ({
              id: channel.channelId,
              label: channel.label,
              price: priceOf ? priceOf(channel.option.modelId) : null,
            })),
            channelId: option.optionId,
            onChannelChange: gate.setChannelId,
          }
        : {})}
      // 验证过就把这一枪发出去 —— 用户点的是「发送」，配 key 只是半路的一步。
      onVerified={() => {
        gate.close()
        onVerified(
          option.optionId !== gate.selectedOptionId
            ? toNodeModelSelection(option)
            : undefined,
        )
      }}
    />
  )
}
