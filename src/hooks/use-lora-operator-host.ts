'use client'

/**
 * 操作员面板在 **LoRA 装配台**（`/studio/lora`）这个宿主上的实现（P4-C）。
 *
 * ── 它与工作台那份的关系 ───────────────────────────────────────────
 * 同一个契约（`contexts/studio-operator-host.tsx`）的第二份实现。工作台那份读写
 * `studio-context` 的 reducer；这一份读写 `GenerateBranch` 的**局部 state** ——
 * `/studio/lora` 故意不挂 `<StudioProvider>`（那条路由的 layout 顶部写着），
 * 所以宿主抽象存在的全部理由就在这里。
 *
 * ── 三条硬规矩 ─────────────────────────────────────────────────────
 * ① **不设挂载数量上限**：本仓三个后端全不限，服务端不读 maxLoras 是故意的。
 *    这份宿主里因此没有任何一处数 `items.length` 然后拒绝。
 * ② **导入走既有那条一次确认链**（`useLoraCandidateConfirm.confirmPayload`），
 *    ⛔ 不新造第二条：那条链的第一步是把权重文件收进用户的库，两份实现迟早
 *    说两句不一样的话。
 * ③ **失败往线程里插一行，⛔ 不静默、⛔ 不只弹 toast**：助手做的事就该在助手的
 *    线程里交代（与 `urlImportFailed` 同一条）。
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'

import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import { ASSISTANT_LORA_PICK_LIMITS } from '@/constants/assistant-protocol'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import type { StudioOperatorHost } from '@/contexts/studio-operator-host'
import { useCivitaiDownloadGate } from '@/hooks/use-civitai-download-gate'
import { useLoraCandidateConfirm } from '@/hooks/use-lora-candidate-confirm'
import { useOperatorUserUrlMount } from '@/hooks/use-operator-user-url-mount'
import {
  appendOperatorEntry,
  nextOperatorEntryId,
  setOperatorPrimed,
} from '@/hooks/use-studio-operator-store'
import { isLoraBaseModelMountCompatible } from '@/lib/lora-model-compatibility'
import type { StudioOperatorApplyContext } from '@/lib/studio-operator-apply'
import { buildLoraOperatorSnapshot } from '@/lib/studio-operator-snapshot'
import type { AssistantOperatorSnapshot } from '@/types/assistant-operator'
import type { LoraAssetRecord } from '@/types'

/**
 * 装配台上一条挂载的**最小形状** —— ⚠ 有意不写成 `StoredEntry`：这个 hook 只用到
 * 四样东西，把整个挂载栈条目拖进签名只会让它看起来依赖更多（同
 * `removeReferenceByUrl` 那条论据）。
 */
export interface LoraOperatorHostMount {
  asset: LoraAssetRecord
  scale?: number
  enabled?: boolean
}

export interface UseLoraOperatorHostInput {
  prompt: string
  setPrompt(value: string): void
  /** 触发词落提示词 —— **装配台既有的那条追加路径**（会去重、规范逗号）。 */
  appendPrompt(text: string): void
  negativePrompt: string
  setNegativePrompt(value: string): void
  /** 当前底模。`null` = 还没定出来（装配台上那颗选择器仍然在）。 */
  base: { id: string; label: string; family: string | null } | null
  /** 能切到哪些底模 —— 就是 `LoraBaseModelModal` 里列的那些。 */
  availableBases: readonly { id: string; label: string }[]
  selectBase(id: string): void
  /** 挂载栈。⚠ `null` = 缺 `LoraStackProvider`（不该发生，但不该因此整页崩）。 */
  stack: {
    items: readonly LoraOperatorHostMount[]
    push(asset: LoraAssetRecord, scale?: number): void
    setScale(assetId: string, scale: number): void
    remove(assetId: string): void
  } | null
  /** 参考图卡那一路（逐底模按能力开关；`maxImages` 为 0 = 这个底模不吃参考图）。 */
  imageUpload: {
    referenceEntries: readonly { url: string }[]
    maxImages: number
    addReferenceImage(url: string): void
    removeReferenceImage(index: number): void
  }
  open: boolean
  setOpen(open: boolean): void
}

/**
 * ⚠ 摘除按**索引**（`removeReferenceImage` 的契约），所以要先按 URL 找位。
 * 与工作台那份宿主里的同名函数逐字同源 —— 两个宿主的参考图 API 本来就是同一个
 * （`useImageUpload`），只是拿到它的路不同。
 */
function removeReferenceByUrl(
  imageUpload: UseLoraOperatorHostInput['imageUpload'],
  url: string,
): void {
  const index = imageUpload.referenceEntries.findIndex(
    (entry) => entry.url === url,
  )
  if (index >= 0) imageUpload.removeReferenceImage(index)
}

export function useLoraOperatorHost(
  input: UseLoraOperatorHostInput,
): StudioOperatorHost {
  /**
   * ⚠ 与工作台那份同一条：事件循环是异步的、跨很多次 render，所以每一样东西都从
   * ref 里读。直接闭包捕获的话，应用第 5 步用的还是发消息那一刻的装配台。
   * ⚠ 同步写在 effect 里（本仓 latest-ref 的既有写法）。
   */
  const latest = useRef(input)
  useEffect(() => {
    latest.current = input
  }, [input])

  /**
   * 挂上去之后**它在库里是谁** —— `candidateId → LoraAssetRecord`。
   *
   * ⭐ 这张表是 `mount_lora` 的 `inverse` 能成立的全部本钱：撤销时服务端只给得出
   * candidateId（库记录 id 是客户端导入那一跳才产生的），要摘哪一把只能在这里查。
   * 形态与工作台那份的 `userUrlMounts`（源地址 → 落地地址）逐字同构。
   * ⚠ 摘除时也往这里存：撤销「摘掉」= 把那条记录挂回去，而服务端同样没有它。
   */
  const mountedByCandidate = useRef(new Map<string, LoraAssetRecord>())
  const detachedById = useRef(new Map<string, LoraAssetRecord>())

  const appendPrompt = useCallback((text: string) => {
    latest.current.appendPrompt(text)
  }, [])
  const pushMount = useCallback((asset: LoraAssetRecord, scale?: number) => {
    latest.current.stack?.push(asset, scale)
  }, [])

  /**
   * ⭐ **既有的一次确认链**（导入 → 进挂载栈 → 触发词落提示词）。⛔ 不新造第二条。
   * `mount` 缺席时那条链自己会退化成「只导入不挂载」并如实回报 —— 与图片/视频
   * 工作台上那张推荐卡的行为一致。
   */
  const confirmChain = useLoraCandidateConfirm({
    mount: pushMount,
    applyTriggerWords: appendPrompt,
  })
  /**
   * ⭐ Civitai 下载闸（既有件）：作者在 Creator Controls 里关掉下载的版本，任何
   * token 都取不到权重，而 401 会被一路翻成「你的 API Key 无效」—— 一句把人送去
   * 查一把没坏的 key 的假话。助手挂之前先问一句，省掉那一轮。
   * ⚠ 它**判不了时放行**（那是它自己的契约），权威闸在服务端派发前。
   */
  const downloadGate = useCivitaiDownloadGate()
  /** 拍板 22 的落地那一跳 —— 两个宿主共用的那一份。 */
  const userUrl = useOperatorUserUrlMount(input.imageUpload)

  const buildSnapshot = useCallback((): AssistantOperatorSnapshot => {
    const current = latest.current
    const baseFamily = current.base?.family ?? null
    return buildLoraOperatorSnapshot({
      prompt: current.prompt,
      negativePrompt: current.negativePrompt,
      base: current.base
        ? { id: current.base.id, label: current.base.label }
        : null,
      availableBases: current.availableBases,
      baseFamily,
      loras: (current.stack?.items ?? []).map((item) => {
        const family = item.asset.baseModelFamily ?? null
        return {
          id: item.asset.id,
          name: item.asset.name,
          // 条目没写 scale = 沿用资产默认值 —— 与 `handleGenerate` 的取值口径
          // 逐字一致。两处不一致的话助手说的权重与真正发出去的对不上。
          weight: item.scale ?? item.asset.defaultScale,
          // 缺省视为启用（见 `use-active-lora-stack` 的 `StoredEntry.enabled`）。
          enabled: item.enabled !== false,
          family,
          // ⭐ 与界面上那条橙色警示行**同一个谓词**，⛔ 不另算一份。
          compatible: baseFamily
            ? isLoraBaseModelMountCompatible(family ?? '', baseFamily)
            : true,
        }
      }),
      references: {
        items: current.imageUpload.referenceEntries,
        limit: Number.isFinite(current.imageUpload.maxImages)
          ? current.imageUpload.maxImages
          : ASSISTANT_OPERATOR_LIMITS.maxSnapshotReferences,
      },
      minWeight: ASSISTANT_LORA_PICK_LIMITS.minWeight,
      maxWeight: ASSISTANT_LORA_PICK_LIMITS.maxWeight,
    })
  }, [])

  const apply = useMemo<StudioOperatorApplyContext>(() => {
    /** ⛔ 不静默：装配台上助手做砸的事，也在助手的线程里交代。 */
    const reportFailure = (subject: string) => {
      appendOperatorEntry({
        kind: 'system',
        id: nextOperatorEntryId('sys'),
        code: 'loraMountFailed',
        subject,
      })
    }

    return {
      /**
       * ⚠ 只有这两格：`applyOperatorStep` 在 LoRA 域用得到的就是提示词与负面框的
       * 当前值（append 模式要接在旧值后面）。装配台没有 `advancedParams` 那套，
       * 负面提示词是自己的一格 state —— 这里做的是形状对齐，不是伪造一份表单。
       */
      getState: () => ({
        prompt: latest.current.prompt,
        advancedParams: { negativePrompt: latest.current.negativePrompt },
      }),
      /**
       * ⚠ 装配台没有 studio reducer，所以这只手把 op 翻成局部 setState。
       * ⛔ **穷举而不是 default no-op**：漏一支的表现是「日志说改了、界面没动」。
       * 到得了这里的动作只有 LoRA 域工具表允许的那些（域闸 + 服务端硬闸两道）。
       */
      dispatch: (action) => {
        switch (action.type) {
          case 'SET_PROMPT':
            latest.current.setPrompt(action.payload)
            return
          case 'SET_ADVANCED_PARAMS':
            latest.current.setNegativePrompt(
              action.payload.negativePrompt ?? '',
            )
            return
          case 'SET_OPTION_ID':
            if (action.payload) latest.current.selectBase(action.payload)
            return
          default:
            /**
             * ⚠ 这里是**真的到不了**，不是兜底：比例 / 清晰度 / 张数 / 视频那几条
             * 的工具都不在 LoRA 域的工具表里（`ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN`），
             * 服务端还会按 `noSuchControl` 再拒一道。留一句注释而不是抛，是因为
             * 抛会把「协议多了一条我们没接的动作」变成用户面前的一次崩溃。
             */
            return
        }
      },
      /** 装配台的「模型」就是底模，id 直接就是底模 id —— 不需要 optionId 那层。 */
      resolveOptionId: (modelId) =>
        latest.current.availableBases.some((base) => base.id === modelId)
          ? modelId
          : null,
      addReference: (url) => latest.current.imageUpload.addReferenceImage(url),
      removeReference: (url) =>
        removeReferenceByUrl(latest.current.imageUpload, url),
      /**
       * ⛔ 装配台**没有音频参考槽、没有出声开关**（那是视频域的东西）。
       * 到不了这里，理由同 `dispatch` 的 default 那一支。
       */
      addAudioReference: () => {},
      removeAudioReference: () => {},
      setSound: () => {},
      /**
       * 拍板 22 的落地那一跳 —— **与工作台共用同一份实现**：装配台的参考图卡走的
       * 也是 `useImageUpload`，导入路由也只有一条，所以两边做的是同一件事。
       */
      mountUserUrl: userUrl.mountUserUrl,
      unmountUserUrl: userUrl.unmountUserUrl,
      setPrimed: setOperatorPrimed,
      lora: {
        /**
         * 挂一把：**先过下载闸，再走既有的一次确认链**。
         * ⚠ 「交出去就不管」而不是 Promise —— `applyOperatorStep` 是同步纯函数。
         */
        mount: ({ candidateId, name, weight, triggerWords, importPayload }) => {
          void (async () => {
            const versionId = importPayload.modelVersionId
            if (versionId !== undefined) {
              const ok = await downloadGate.ensureMountable({
                modelVersionId: versionId,
                name,
              })
              if (!ok) {
                reportFailure(name)
                return
              }
            }
            const outcome = await confirmChain.confirmPayload({
              importPayload,
              triggerWords,
              suggestedWeight: weight,
            })
            if (outcome.status !== 'ok' || !outcome.asset) {
              reportFailure(name)
              return
            }
            mountedByCandidate.current.set(candidateId, outcome.asset)
          })()
        },
        unmountByCandidateId: (candidateId) => {
          const asset = mountedByCandidate.current.get(candidateId)
          // 还在路上（导入没回来）就撤销 = 表里还没有它。多一套取消语义会让
          // 「挂上了没有」变成两个真相 —— 与 `unmountUserUrl` 选的是同一侧。
          if (!asset) return
          latest.current.stack?.remove(asset.id)
          mountedByCandidate.current.delete(candidateId)
        },
        unmount: (loraId) => {
          const item = latest.current.stack?.items.find(
            (entry) => entry.asset.id === loraId,
          )
          if (!item) return
          // ⭐ 扣下那条库记录 —— 撤销「摘掉」要靠它把 LoRA 挂回去，而服务端没有它。
          detachedById.current.set(loraId, item.asset)
          latest.current.stack?.remove(loraId)
        },
        remount: (loraId, weight) => {
          const asset = detachedById.current.get(loraId)
          if (!asset) return
          latest.current.stack?.push(asset, weight)
          detachedById.current.delete(loraId)
        },
        setWeight: (loraId, weight) => {
          latest.current.stack?.setScale(loraId, weight)
        },
      },
    }
  }, [confirmChain, downloadGate, userUrl])

  const referenceLimit = Number.isFinite(input.imageUpload.maxImages)
    ? input.imageUpload.maxImages
    : ASSISTANT_OPERATOR_LIMITS.maxSnapshotReferences

  return useMemo(
    () => ({
      domain: ASSISTANT_PROTOCOL_DOMAIN_IDS.lora,
      buildSnapshot,
      apply,
      referenceLimit,
      open: input.open,
      setOpen: input.setOpen,
    }),
    [apply, buildSnapshot, input.open, input.setOpen, referenceLimit],
  )
}
