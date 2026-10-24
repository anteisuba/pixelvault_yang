'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'

import { getModelMessageKey, isBuiltInModel } from '@/constants/models'
import { getPromptDialect } from '@/constants/prompt-dialects'
import { ROUTES } from '@/constants/routes'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import type { StudioOperatorHost } from '@/contexts/studio-operator-host'
import type { StudioOperatorGenerationDraft } from '@/types/studio-assistant-operator'
import {
  pickDefaultImageModelOptionId,
  readStoredImageModelOptionId,
  toDefaultImageModelCandidates,
  writeStoredImageModelOptionId,
} from '@/hooks/use-default-image-model'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { buildStudioDraft, writeStudioDraft } from '@/hooks/use-studio-draft'
import { useStudioOperatorState } from '@/hooks/use-studio-operator-store'
import { useStudioWorkbenchOperatorHost } from '@/hooks/use-studio-workbench-operator-host'
import { useRouter } from '@/i18n/navigation'
import { studioBenchHref } from '@/lib/studio-shell-route'

/**
 * 首页那份小配方的宿主（第 9g 步，owner 10-24）：没开台时，对话里直接出简单的图。
 *
 * ⭐ 它就是图片台那一套（`useStudioWorkbenchOperatorHost({ home: true })`）：同一份表单、同一套改法、
 *   同一颗出图键（`REQUEST_GENERATE` 的执行端由 `HomeDraftBench` 挂一份），⛔ 没有第二条出图路。
 *   挂在 `HomeDraftBench` 自己那一份 `StudioProvider` 里，台上那份表单一个字都不碰。
 * ⚠ 多出来的只有这几样：
 *   - 型号：两种方言都列，表单方言跟着选中的型号走（NAI 也能在首页出，owner 10-24）；
 *     起手按图片台上次用的那个（`pickDefaultImageModelOptionId`），都没有 key 就先摆第一个，
 *     按出图时就地配 key（`keySetup`，Hard Rule 8）。
 *   - 卡上直接改提示词与参考图（台看不见），「去图片台接着改」把整份配方记成那一台的草稿再开台。
 *   - 换一段对话就清空：上一段的提示词与参考图不跟到新的一段里。
 */
export function useHomeDraftOperatorHost(): StudioOperatorHost {
  const host = useStudioWorkbenchOperatorHost({ home: true })
  const { state, dispatch } = useStudioForm()
  const { imageUpload } = useStudioData()
  const { modelOptions, selectedModel } = useImageModelOptions()
  const { userId } = useAuth()
  const router = useRouter()
  const { sessionId, localThreadId } = useStudioOperatorState()
  const tModels = useTranslations('Models')

  // 起手的型号：图片台上次用的那个（两台各记一份，先认自然语言台）→ 有 key 里最便宜的 → 第一个。
  useEffect(() => {
    if (state.selectedOptionId !== null || state.modelSelectionTouched) return
    const first = modelOptions[0]
    if (!first) return
    const candidates = toDefaultImageModelCandidates(modelOptions)
    const stored =
      [
        readStoredImageModelOptionId('natural'),
        readStoredImageModelOptionId('tags'),
      ].find((optionId) =>
        candidates.some((candidate) => candidate.optionId === optionId),
      ) ?? null
    dispatch({
      type: 'AUTO_SELECT_OPTION_ID',
      payload:
        pickDefaultImageModelOptionId(candidates, stored) ?? first.optionId,
      expectedSelection: {
        optionId: null,
        dialect: state.promptDialect,
        touched: false,
      },
    })
  }, [
    dispatch,
    modelOptions,
    state.modelSelectionTouched,
    state.promptDialect,
    state.selectedOptionId,
  ])

  // 表单方言跟着选中的型号走：出图那一枪按方言翻译提示词、按方言认型号。
  useEffect(() => {
    if (!selectedModel) return
    const dialect = getPromptDialect(selectedModel.adapterType)
    if (dialect !== state.promptDialect)
      dispatch({ type: 'SET_PROMPT_DIALECT', payload: dialect })
  }, [dispatch, selectedModel, state.promptDialect])

  // 换一段对话：清掉上一段的提示词与参考图。
  const thread = useRef(localThreadId)
  useEffect(() => {
    if (thread.current === localThreadId) return
    thread.current = localThreadId
    dispatch({ type: 'SET_PROMPT', payload: '' })
    imageUpload.clearAllImages()
  }, [dispatch, imageUpload, localThreadId])

  const openBench = useCallback(() => {
    const dialect = selectedModel
      ? getPromptDialect(selectedModel.adapterType)
      : state.promptDialect
    if (state.selectedOptionId)
      writeStoredImageModelOptionId(state.selectedOptionId, dialect)
    if (userId)
      writeStudioDraft(
        dialect === 'tags' ? 'image-tags' : 'image-natural',
        userId,
        buildStudioDraft(
          { ...state, modelSelectionTouched: true },
          imageUpload.referenceEntries
            .map((entry) => entry.url)
            .filter((url) => /^https?:\/\//.test(url)),
        ),
      )
    router.push(
      studioBenchHref(
        dialect === 'tags' ? ROUTES.STUDIO_IMAGE_TAGS : ROUTES.STUDIO_IMAGE,
        sessionId,
      ),
    )
  }, [
    imageUpload.referenceEntries,
    router,
    selectedModel,
    sessionId,
    state,
    userId,
  ])

  const keyless =
    selectedModel && !selectedModel.keyId && !selectedModel.providerKeyId
      ? selectedModel
      : null
  const generationDraft = useMemo(
    (): StudioOperatorGenerationDraft => ({
      prompt: state.prompt,
      setPrompt: (prompt) => dispatch({ type: 'SET_PROMPT', payload: prompt }),
      references: imageUpload.referenceEntries,
      removeReference: (url) => {
        const index = imageUpload.referenceEntries.findIndex(
          (entry) => entry.url === url,
        )
        if (index >= 0) imageUpload.removeReferenceImage(index)
      },
      openBench,
      keySetup: keyless
        ? {
            modelId: keyless.modelId,
            optionId: keyless.optionId,
            modelLabel: isBuiltInModel(keyless.modelId)
              ? tModels(`${getModelMessageKey(keyless.modelId)}.label`)
              : (keyless.displayLabel ?? keyless.modelId),
            adapterType: keyless.adapterType,
            // 配好的那把 key 自己就是一条渠道：选上它再出（与模型选择器里配完同一个落点）。
            onVerified: (keyId) =>
              dispatch({ type: 'SET_OPTION_ID', payload: `key:${keyId}` }),
          }
        : null,
    }),
    [dispatch, imageUpload, keyless, openBench, state.prompt, tModels],
  )

  return useMemo(() => ({ ...host, generationDraft }), [generationDraft, host])
}
