'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { LORA_TOAST_DURATION_MS } from '@/constants/lora'
import { fetchCivitaiLoraDownloadPolicyAPI } from '@/lib/api-client'

/**
 * 挂载前的 Civitai 下载闸。
 *
 * 2026-08-29 owner 真机：挂了一把作者在 Civitai 关掉下载的 LoRA（Creator
 * Controls 的 `usageControl` 是 `Generation` 而不是 `Download`），Runner 线
 * （我们自己下进 R2）和云端 API 线（provider 自己去下）都在几十秒后拿到 401，
 * 而 401 一路被翻成「你的 API Key 无效或已过期」——一句把人送去查一把没坏的
 * key 的假话。真相是任何 token 都取不到权重，唯一的出路是换一把 LoRA。
 *
 * ⚠ 这不是权威闸。**权威闸在服务端**（`submitImageGeneration` 派发前按同一份
 * `usageControl` 判据拦，覆盖每一个入口和每一条线）。这里只是把同一句话提前到
 * 「点使用」那一刻，省掉一轮等待。所以它抽在一个 hook 里给两个浏览面共用，
 * 而不是在每个面各写一遍——两份实现迟早会说两句不一样的话。
 *
 * ⚠ 判不了时（上游超时 / 字段缺失 / 端点报错）一律放行：这道闸是"提前说清楚"，
 * 不能变成一条能把好 LoRA 挡在门外的单点故障。
 */
export function useCivitaiDownloadGate(): {
  /** 正在问的那把的 versionId —— 卡片据此显示 busy，避免看着像点空了。 */
  checkingVersionId: number | null
  /** `true` = 可以挂。`false` = 已经用 toast 说明了原因，调用方直接 return。 */
  ensureMountable: (item: {
    modelVersionId: number
    name: string
  }) => Promise<boolean>
} {
  const t = useTranslations('LoraWorkbench')
  const [checkingVersionId, setCheckingVersionId] = useState<number | null>(
    null,
  )

  const ensureMountable = useCallback(
    async (item: { modelVersionId: number; name: string }) => {
      // 闸在飞时连点直接吞掉——否则一次点击挂两把。
      if (checkingVersionId !== null) return false

      setCheckingVersionId(item.modelVersionId)
      let downloadDisabled = false
      try {
        const policy = await fetchCivitaiLoraDownloadPolicyAPI(
          item.modelVersionId,
        )
        downloadDisabled = policy.data?.downloadDisabled === true
      } finally {
        setCheckingVersionId(null)
      }

      if (downloadDisabled) {
        toast.error(
          t('library.mountBlockedDownloadDisabled', { name: item.name }),
          { duration: LORA_TOAST_DURATION_MS },
        )
        return false
      }
      return true
    },
    [checkingVersionId, t],
  )

  return { checkingVersionId, ensureMountable }
}
