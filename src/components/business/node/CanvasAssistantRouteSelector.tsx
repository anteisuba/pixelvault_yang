'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'

import type { StudioModelOption } from '@/components/business/ModelSelector'
import { MainModelPicker } from '@/components/business/studio-shared/pickers'
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import { NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS } from '@/constants/node-studio'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getAssistantMediaCapabilityLabel } from '@/constants/assistant'

export interface NodeAssistantRouteSelection {
  optionId: string
  apiKeyId?: string
  adapterType: AI_ADAPTER_TYPES
  /**
   * LLM tier the user picked (e.g. gpt-5.6-terra). Absent on the legacy
   * "auto" selection — the server then falls back to the adapter's default
   * (first) entry in NODE_STUDIO_ASSISTANT_ROUTE_MODELS.
   */
  modelId?: string
}

interface CanvasAssistantRouteSelectorProps {
  value: NodeAssistantRouteSelection
  onChange(value: NodeAssistantRouteSelection): void
  /**
   * 没选具体 key 时触发器显示什么。**必须由调用方给，因为「默认路由」在两个域里
   * 不是同一条**：
   *  - 画布：不选 key 且无附件时走 gateway（`NODE_STUDIO_ASSISTANT.gatewayModelId`
   *    = openai/gpt-5.6-sol），所以写死 OpenAI 是诚实的。
   *  - studio：**没有 gateway 分支**，服务端按 `LLM_TEXT_ADAPTERS` 优先级兜底
   *    （Gemini 打头），所以显示 OpenAI 是在说谎。
   *
   * ⚠ 2026-08-19 生产事故就是这个：组件原本写死画布的标签，studio 复用后
   * 「界面显示 GPT、实际打 Gemini」，Gemini 空回复报错时 owner 完全无法归因。
   * **别再在这里写死任何一个具体型号。**
   */
  emptyRouteLabel: string
}

export function getAssistantRouteKeyOptionId(
  keyId: string,
  modelId?: string,
): string {
  const base = `${NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS.keyPrefix}:${keyId}`
  return modelId ? `${base}:${modelId}` : base
}

// ⚠ The `default` here means a missing case shows the WRONG provider's name
// on the setup button (it falls through to Gemini) — compile-clean and
// silently misleading. Add a case whenever an adapter joins the assistant
// route table.
function getSetupLabelKey(
  adapterType: AI_ADAPTER_TYPES,
):
  | 'setupChatGpt'
  | 'setupDeepSeek'
  | 'setupGemini'
  | 'setupClaude'
  | 'setupGrok' {
  switch (adapterType) {
    case AI_ADAPTER_TYPES.OPENAI:
      return 'setupChatGpt'
    case AI_ADAPTER_TYPES.DEEPSEEK:
      return 'setupDeepSeek'
    case AI_ADAPTER_TYPES.ANTHROPIC:
      return 'setupClaude'
    case AI_ADAPTER_TYPES.XAI:
      return 'setupGrok'
    default:
      return 'setupGemini'
  }
}

interface QuickSetupState {
  open: boolean
  modelId: string
  modelLabel: string
  adapterType: AI_ADAPTER_TYPES
  optionId: string
}

/**
 * Adapts the shared two-step MainModelPicker (厂商 → 模型 — the same picker the
 * canvas image/video/audio nodes use) to the NodeAssistantRouteSelection
 * contract. `modality="llm_assist"` + `llmCapability="assistant"` feeds the
 * assistant-scoped LLM text routes (NODE_STUDIO_ASSISTANT_ROUTE_MODELS) through
 * the picker, so the script selector matches the media pickers exactly — only
 * the model set differs.
 *
 * No "auto route" entry: selection is always an explicit 厂商 → 模型 pick
 * (parity with the image picker). Leaving the picker untouched keeps apiKeyId
 * undefined, which the assistant service still resolves via its own
 * gateway/platform fallback — so zero-config sending is unaffected.
 *
 * The wrapper:
 *   - maps NodeAssistantRouteSelection.apiKeyId →
 *     `llm-route:assistant:key:${keyId}` for the picker value
 *   - converts the picked StudioModelOption back into
 *     NodeAssistantRouteSelection via getAssistantRouteKeyOptionId
 *   - routes needs-key providers to the locally-owned QuickSetupDialog
 */
export function CanvasAssistantRouteSelector({
  value,
  onChange,
  emptyRouteLabel,
}: CanvasAssistantRouteSelectorProps) {
  const t = useTranslations('StudioNode.assistantRoute')
  const [quickSetup, setQuickSetup] = useState<QuickSetupState>({
    open: false,
    optionId: '',
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    modelId: '',
    modelLabel: '',
  })

  const handleSelect = useCallback(
    (option: StudioModelOption) => {
      if (!option.keyId) return
      onChange({
        optionId: getAssistantRouteKeyOptionId(option.keyId, option.modelId),
        apiKeyId: option.keyId,
        adapterType: option.adapterType,
        modelId: option.modelId,
      })
    },
    [onChange],
  )

  const handleRequestSetup = useCallback(
    (option: StudioModelOption) => {
      setQuickSetup({
        open: true,
        modelId: option.modelId,
        modelLabel: t(getSetupLabelKey(option.adapterType)),
        adapterType: option.adapterType,
        optionId: option.optionId,
      })
    },
    [t],
  )

  const handleQuickSetupOpenChange = useCallback((nextOpen: boolean) => {
    setQuickSetup((current) => ({ ...current, open: nextOpen }))
  }, [])

  const handleQuickSetupVerified = useCallback(
    (_modelId: string, keyId: string) => {
      onChange({
        optionId: getAssistantRouteKeyOptionId(keyId, quickSetup.modelId),
        apiKeyId: keyId,
        adapterType: quickSetup.adapterType,
        modelId: quickSetup.modelId,
      })
    },
    [onChange, quickSetup.adapterType, quickSetup.modelId],
  )

  const detailForOption = useCallback(
    (option: StudioModelOption) =>
      t(
        `mediaCapabilities.${getAssistantMediaCapabilityLabel(
          option.adapterType,
          option.modelId,
        )}`,
      ),
    [t],
  )

  return (
    <>
      <MainModelPicker
        modality="llm_assist"
        // 与图片/视频/音频同一套三栏（居中 modal，不受这个窄面板的宽度约束）。
        // LLM 路由没有 MODEL_FAMILIES，会退回按 adapterType 分组 —— 第一栏正好
        // 是厂商，第二栏是模型，语义仍然成立。
        layout="columns"
        llmCapability="assistant"
        value={
          // Saved-route optionIds carry the modelId since tiers multiplied —
          // a selection without one (legacy "auto") matches no option, which
          // renders the empty label; that is the honest display for it.
          value.apiKeyId && value.modelId
            ? `llm-route:assistant:key:${value.apiKeyId}:${value.modelId}`
            : null
        }
        onChange={handleSelect}
        onRequestSetup={handleRequestSetup}
        triggerEmptyLabel={emptyRouteLabel}
        size="compact"
        popoverSide="bottom"
        detailForOption={detailForOption}
      />

      <QuickSetupDialog
        open={quickSetup.open}
        onOpenChange={handleQuickSetupOpenChange}
        modelId={quickSetup.modelId}
        modelLabel={quickSetup.modelLabel}
        adapterType={quickSetup.adapterType}
        optionId={quickSetup.optionId}
        onVerified={handleQuickSetupVerified}
      />
    </>
  )
}
