'use client'

/**
 * 联网候选的**「保存」**（P3-B → 拍板 21 → P4 第 12 项，owner 2026-10-16）。
 *
 * ── 拍板 21：看与选是两件事 ──────────────────────────────────────
 * 🔬 owner 真机：点一下缩略图＝立刻下载一张进素材库。**浏览即采购**。
 * 现在：点图＝开灯箱（零网络零入库，那条链根本不经过这里），点圈＝只是选上（格子
 * 自己的状态），按「保存」＝才导入。
 *
 * ── P4：保存 = 只进素材库，⛔ 不再挂进输入框 ──────────────────────
 * owner 2026-10-16「直接保存吧，点击后放到素材库中。后面可以直接引用」。以前叫「附上」：
 * 导入之后顺手塞进附件、占一个参考位 —— 用户读不懂「附上」是什么意思，参考位上限还
 * 把「多存几张」也卡住了。现在存下来就是素材库里的一条，要用时 `@` 它（与库里别的
 * 素材同一条路），⛔ 没有参考位上限、⛔ 没有「取下」。
 *
 * ⚠ 存好的那张**不撤**：它已经是用户库里的东西（可能已经被 `@` 进了别处），
 *   撤销保存 = 去素材页删，⛔ 这里不另写一条删除。
 * ⚠ 服务端认出同一条来源已经在库里会直接复用（幂等闸），对这一格来说一样是「已存」。
 *
 * ── 状态为什么按 entryId 存 ───────────────────────────────────────
 * 一轮里可以有多条 `search_web_images` 日志（换个词再搜一次），每条各有自己的
 * 选中项。服务端每轮从 `step-1` 重新编号（见 `operatorStepEntryId` 头注），只有
 * 线程里的 `entryId` 是全局唯一的。
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useTranslations } from 'next-intl'

import { getApiErrorMessage } from '@/lib/api-error-message'
import { importWebImageAPI } from '@/lib/api-client/web-image-import'
import type { AssistantOperatorWebImage } from '@/types/assistant-operator'

/** 一张按过「保存」的候选。 */
export interface StudioOperatorWebImportPick {
  /** 候选的原图直链 —— 格子按它认自己这一张存没存。 */
  imageUrl: string
  status: 'saving' | 'saved' | 'error'
  /** 素材库里那条记录的 id（`saved` 时才有）。 */
  generationId?: string
  /** 失败原因，⛔ 大声显示不静默。 */
  error?: string
}

export interface StudioOperatorWebImportState {
  picks: readonly StudioOperatorWebImportPick[]
  /**
   * 这一行上有人要存一张**来源不可作输入**的候选（切片 3b）——压根没试，
   * ⛔ 也不做静默 return（「我点了但什么都没发生」）。
   */
  refusalError?: string
}

export interface UseStudioOperatorWebImportResult {
  /** 按线程条目 id 取保存态。没存过的条目没有键。 */
  states: Readonly<Record<string, StudioOperatorWebImportState>>
  /** 「保存」：把选上的几张导进素材库。已存 / 在存的跳过，上次失败的再试一次。 */
  saveCandidates(
    entryId: string,
    images: readonly AssistantOperatorWebImage[],
  ): void
}

interface UseStudioOperatorWebImportOptions {
  scopeKey: string | null
}

/** 在飞请求的身份 —— 一行里可以同时飞好几张，所以按「行 + 图」计。 */
function inflightKey(entryId: string, imageUrl: string): string {
  return `${entryId}\u0000${imageUrl}`
}

export function useStudioOperatorWebImport({
  scopeKey,
}: UseStudioOperatorWebImportOptions): UseStudioOperatorWebImportResult {
  const t = useTranslations('StudioOperator')
  const tErrors = useTranslations('Errors')
  const [states, setStates] = useState<
    Record<string, StudioOperatorWebImportState>
  >({})
  const [statesScope, setStatesScope] = useState(scopeKey)
  if (statesScope !== scopeKey) {
    setStatesScope(scopeKey)
    setStates({})
  }
  const scopeEpoch = useRef(0)

  /** ⚠ 一次转存要几秒，跨很多次 render —— 文案走 latest-ref（写在 effect 里）。 */
  const latest = useRef({ t, tErrors })
  useEffect(() => {
    latest.current = { t, tErrors }
  }, [t, tErrors])

  /** ⭐ 同一帧内的连点闸：`inflightRef` 是**同步**写的，认得出「这一格已经在路上了」。 */
  const inflightRef = useRef<Set<string>>(new Set())
  const statesRef = useRef(states)
  useEffect(() => {
    statesRef.current = states
  }, [states])
  useLayoutEffect(() => {
    const inflight = inflightRef.current
    scopeEpoch.current += 1
    inflight.clear()
    statesRef.current = {}
    return () => {
      scopeEpoch.current += 1
      inflight.clear()
    }
  }, [scopeKey])

  const patch = useCallback(
    (
      entryId: string,
      update: (
        current: StudioOperatorWebImportState,
      ) => StudioOperatorWebImportState,
    ) => {
      setStates((current) => ({
        ...current,
        [entryId]: update(current[entryId] ?? { picks: [] }),
      }))
    },
    [],
  )

  const setPick = useCallback(
    (entryId: string, pick: StudioOperatorWebImportPick) =>
      patch(entryId, (current) => ({
        ...current,
        picks: [
          ...current.picks.filter((item) => item.imageUrl !== pick.imageUrl),
          pick,
        ],
      })),
    [patch],
  )

  const saveOne = useCallback(
    (entryId: string, image: AssistantOperatorWebImage) => {
      const epoch = scopeEpoch.current
      const key = inflightKey(entryId, image.imageUrl)
      inflightRef.current.add(key)
      setPick(entryId, { imageUrl: image.imageUrl, status: 'saving' })

      void importWebImageAPI({
        imageUrl: image.imageUrl,
        ...(image.pageUrl ? { pageUrl: image.pageUrl } : {}),
        ...(image.domain ? { domain: image.domain } : {}),
        ...(image.title ? { title: image.title } : {}),
      }).then((response) => {
        if (scopeEpoch.current !== epoch) return
        inflightRef.current.delete(key)
        if (!response.success) {
          setPick(entryId, {
            imageUrl: image.imageUrl,
            status: 'error',
            error: getApiErrorMessage(
              latest.current.tErrors,
              response,
              latest.current.t('web.importFailed'),
            ),
          })
          return
        }
        setPick(entryId, {
          imageUrl: image.imageUrl,
          status: 'saved',
          generationId: response.data.generation.id,
        })
      })
    },
    [setPick],
  )

  const saveCandidates = useCallback(
    (entryId: string, images: readonly AssistantOperatorWebImage[]) => {
      if (!scopeKey) return
      const picks = statesRef.current[entryId]?.picks ?? []
      let refused = false
      for (const image of images) {
        /**
         * ⭐ 来源闸（切片 3b）：格子上不给不可用的那张画圈，这里再挡一道 ——
         * 键盘、脚本、以及下一个人把那道条件改掉的那天。服务端还有第三道。
         */
        if (!image.usableAsInput) {
          refused = true
          continue
        }
        if (inflightRef.current.has(inflightKey(entryId, image.imageUrl)))
          continue
        const status = picks.find(
          (pick) => pick.imageUrl === image.imageUrl,
        )?.status
        if (status === 'saved' || status === 'saving') continue
        saveOne(entryId, image)
      }
      // 拒绝理由只说这一次：这次全都能存，上一次那句就该消失。
      patch(entryId, (current) => ({
        ...current,
        refusalError: refused ? latest.current.t('web.notUsable') : undefined,
      }))
    },
    [patch, saveOne, scopeKey],
  )

  return { states, saveCandidates }
}
