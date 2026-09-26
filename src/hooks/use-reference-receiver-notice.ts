'use client'

import { useTranslations } from 'next-intl'

import { getMaxReferenceImages } from '@/constants/provider-capabilities'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getTranslatedModelLabel } from '@/lib/model-options'

interface ReferenceReceiverModel {
  readonly adapterType: AI_ADAPTER_TYPES
  readonly modelId: string
}

/**
 * 「挂着的图这一轮发给谁」—— 多选里混进**不收参考图**的模型时的那一句
 * （D10 ④：PixAI 不收参考图，这几张只给 NAI）。没有要说的就是 `undefined`。
 *
 * ⚠ 判据是能力表里的 `maxReferenceImages`，⛔ 不是厂商名；也不按方言分支 ——
 * 自然语言台同样成立（Seedream 4.5 与 GPT 一起选就是这个局面）。
 * 舞台参考轨与底部输入框的附件行（owner 2026-09-26）共用这一份。
 */
export function useReferenceReceiverNotice(
  runModels: readonly ReferenceReceiverModel[],
  referenceCount: number,
): string | undefined {
  const tImageChip = useTranslations('ImageChip')
  const tModels = useTranslations('Models')
  if (referenceCount === 0 || runModels.length < 2) return undefined
  const receivers = runModels.filter(
    (model) => getMaxReferenceImages(model.adapterType, model.modelId) > 0,
  )
  if (receivers.length === 0) return tImageChip('referenceNoReceiver')
  if (receivers.length < runModels.length) {
    return tImageChip('referenceOnlyFor', {
      models: receivers
        .map((model) => getTranslatedModelLabel(tModels, model.modelId))
        .join(' · '),
    })
  }
  return undefined
}
