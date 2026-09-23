'use client'

/**
 * `@` 提及的**唯一一条 chip 管线**（`pages/assistant-shell.md` §3.3 / §7）。
 *
 * 五个入口一条管线：
 *  ① 正文参考图引用由共享 `MentionInput` 处理；
 *  ② 结果行卡缩略图 hover →「问助手」；
 *  ③ 拖一张图进输入框 —— **库里的资产成 chip，其余原样交回上传通道**；
 *  ④ 助手歧义反问的单选卡（组件已就位，服务端接线是第 3 轮的事）；
 *  ⑤ 正文里直接写产物名 `@图_012`（切片 N1 —— `syncNameMentions`）。
 * 五条最后都落到 `addChip`，⛔ 没有第二套「引用」形状。
 *
 * ── 为什么 chip 就是 `StudioOperatorAttachment` ────────────────────
 * 发送时它们与 📎 挂上来的那些**合成同一个数组**送出去，服务端一个新字段都没有
 * （请求契约 `types/assistant-operator.ts` 一行未动）。另立一个 mention 形状的
 * 下场是下游处处要判「这张是 @ 来的还是 📎 来的」，而对助手来说它们本来就是
 * 同一件事：这条消息附带的图。
 *
 * ── chips 住在 store，不住在这颗 hook 的 state ─────────────────────
 * 面板会被收放法则（拍板 7）随时卸载，而 chip 属于「还没发出去的那条消息」——
 * 收一下面板就没了的话，用户挑好的四张图会凭空消失（P2 收尾修过的正是同一个病）。
 *
 * ── 看图上限：**不设硬上限**（owner 2026-09-06）────────────────────
 * 超过 `warnAboveCount` 只把计数转 warning 并加一句「可能不准」，⛔ 不拦截、
 * ⛔ 不软截断。悄悄少看几张比说不出话坏得多。
 */

import { useCallback, useState } from 'react'

import { ASSET_DND_MIME } from '@/constants/asset-dnd'
import { STUDIO_OPERATOR_MENTION } from '@/constants/studio-assistant-operator'
import {
  addOperatorMention,
  clearOperatorMentions,
  removeOperatorMention,
  useStudioOperatorState,
} from '@/hooks/use-studio-operator-store'
import { toOperatorAttachment } from '@/hooks/use-studio-operator-upload'
import { fetchGenerationByIdAPI } from '@/lib/api-client/gallery'
import { resolveGenerationMentions } from '@/lib/generation-name'
import type { StudioOperatorAttachment } from '@/types/studio-assistant-operator'

/** 光标前那个 `@token` 在草稿里的位置与内容。 */
export interface StudioOperatorMentionTrigger {
  /** `@` 自己的下标 —— 选中之后从这里剪到光标。 */
  start: number
  /** 光标位置（剪的右端）。 */
  caret: number
  /** `@` 与光标之间那段（不含 `@`）。 */
  query: string
}

/**
 * 读出光标前的 `@` 触发（**纯函数，用例钉在这里**）。
 *
 * 三条判据，每一条都有具体的失败面：
 *  ① `@` 前面必须是**行首或空白** —— 否则邮箱地址 `a@b.com` 会在打字过程中
 *    一路弹选择器（而用户只是在写一句话）。
 *  ② `@` 与光标之间**不许有空白** —— 打完 `@` 又空格继续写句子时选择器要关掉，
 *    ⛔ 不能把后面整句都当成搜索词。
 *  ③ 只看**光标之前**：在一句话中间回头改字时，触发的是就近那个 `@`，
 *    ⛔ 不是全文最后一个。
 */
export function readMentionTrigger(
  text: string,
  caret: number = text.length,
): StudioOperatorMentionTrigger | null {
  const end = Math.max(0, Math.min(caret, text.length))
  const start = text.lastIndexOf(STUDIO_OPERATOR_MENTION.trigger, end - 1)
  if (start < 0) return null
  const before = start > 0 ? text[start - 1] : ''
  if (before && !/\s/.test(before)) return null
  const query = text.slice(start + 1, end)
  if (/\s/.test(query)) return null
  return { start, caret: end, query }
}

/**
 * 把 `@token` 从草稿里剪掉。
 *
 * ⭐ chip 才是引用的载体，草稿里那几个字符已经没有意义了 —— 留着它，用户发出去
 * 的句子里会多一段 `@海报` 而助手那边收到的是一张图，两边说的不是一回事。
 */
export function cutMentionTrigger(
  text: string,
  trigger: StudioOperatorMentionTrigger,
): string {
  return `${text.slice(0, trigger.start)}${text.slice(trigger.caret)}`
}

/**
 * 拖进来的东西里那些**库内资产 id**（`ASSET_DND_MIME` 的既有约定，
 * `KreaAssetBrowser.tsx` 的瓦片就是这么写的：`JSON.stringify(ids)`）。
 *
 * ⚠ 解析失败一律当作「没有资产」而不是抛：拖拽来源五花八门，一个格式没对上就把
 * 输入框整个打红是不成比例的 —— 那种情况下它照旧回落到上传通道。
 */
export function parseDroppedAssetIds(raw: string): readonly string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

export interface UseStudioOperatorMentionResult {
  /** 这条消息要看的那些图（发送时与 📎 附件合成一个数组）。 */
  chips: readonly StudioOperatorAttachment[]
  /** 将看 N 张 —— 就是 `chips.length`，单独给出来是因为计数是 UI 的一等公民。 */
  count: number
  /** 超过提示线（>8）—— **只换颜色与文案，⛔ 不拦截**。 */
  overLimit: boolean
  addChip(attachment: StudioOperatorAttachment): void
  removeChip(id: string): void
  clearChips(): void
  /** 选择器开着时的那个触发；`null` = 不开。 */
  trigger: StudioOperatorMentionTrigger | null
  /** 输入框每次变化 / 光标移动时喂给它。 */
  syncDraft(text: string, caret?: number): void
  /**
   * Esc / 失焦 —— 关掉但不动草稿。
   *
   * ⚠ 关的是**这一个 `@`**：继续往后打字不会把它又弹出来（用户已经说了不要），
   * 而删掉这个 `@` 再打一个新的会重新弹 —— 那是一次新的意图。
   */
  closePicker(): void
  /** 选中一条：加 chip、剪掉 `@token`，返回新草稿供调用方写回。 */
  pick(draft: string, attachment: StudioOperatorAttachment): string
  /**
   * **正文里直接写名字**（切片 N1，第五个入口）。
   *
   * 用户不点选择器，直接打 `@图_012 换个背景` —— 命中就成 chip。三条判据：
   *  ① 只认**身份段**（`图_012`），摘要写不写、写错都不影响命中；
   *  ② 名字**不是凭证**：只在 `candidates`（最近生成 + 已有 chip 那一批）里找，
   *    找不到就什么都不做 —— ⛔ 不静默挂一张别的图；
   *  ③ 一条消息最多 `ASSISTANT_MENTION_LIMITS.maxPerMessage` 个（见常量头注：
   *    与「chip 不设硬上限」不冲突，限的是我们**替用户**做的那部分）。
   *
   * ⚠ 与选择器那条路不同，**正文里的那几个字保留**：`cutMentionTrigger` 剪掉是因为
   * 选完之后那段 `@海报` 已经没有意义（chip 才是载体），而这里那串名字本身就是
   * 用户写给助手看的指认词 —— 剪掉会让句子变成「 换个背景」。
   *
   * ⚠ 之后把名字从正文里删掉**不会**自动摘掉 chip：摘 chip 是一个用户按 × 的显式
   * 动作。反向自动摘除会在「改错字重打一遍」时把用户刚挂上的图弄没。
   *
   * 返回这一次新挂上的那几条（多半是空数组 —— 用户没写名字）。
   */
  syncNameMentions(
    text: string,
    candidates: readonly StudioOperatorAttachment[],
  ): readonly StudioOperatorAttachment[]
  /**
   * 拖进输入框的东西。
   *
   * ⭐ 返回值是「**该走上传通道**的那些文件」—— 库内资产已经在这里变成 chip 了，
   * 调用方把返回的文件原样交给 `useStudioOperatorUpload().uploadFiles`。
   * ⛔ 不在这里自己传文件：上传三通道只有一条出口（拍板 16），两处各传一遍就是
   * 两条会分叉的链。
   */
  acceptDrop(dataTransfer: DataTransfer | null): readonly File[]
}

export function useStudioOperatorMention(): UseStudioOperatorMentionResult {
  const { mentions } = useStudioOperatorState()
  const [trigger, setTrigger] = useState<StudioOperatorMentionTrigger | null>(
    null,
  )
  /**
   * 「用户按 Esc 关掉的是哪一个 `@`」—— 存那个 `@` 在草稿里的下标。
   *
   * ⚠ 不用布尔量：布尔量会在下一次按键（`syncDraft` 重新求值）时立刻又弹一次，
   * Esc 看起来像失灵。存下标之后，继续往这个 `@` 后面打字一直关着，而删掉它
   * 再打一个新的（下标不同）会重新弹 —— 那是一次新的意图。
   */
  const [closedStart, setClosedStart] = useState<number | null>(null)

  const syncDraft = useCallback((text: string, caret?: number) => {
    const next = readMentionTrigger(text, caret)
    setTrigger(next)
    setClosedStart((current) =>
      current !== null && next?.start === current ? current : null,
    )
  }, [])

  const closePicker = useCallback(() => {
    setClosedStart(trigger?.start ?? null)
    setTrigger(null)
  }, [trigger])

  const pick = useCallback(
    (draft: string, attachment: StudioOperatorAttachment): string => {
      addOperatorMention(attachment)
      const next = trigger ? cutMentionTrigger(draft, trigger) : draft
      setTrigger(null)
      setClosedStart(null)
      return next
    },
    [trigger],
  )

  const syncNameMentions = useCallback(
    (
      text: string,
      candidates: readonly StudioOperatorAttachment[],
    ): readonly StudioOperatorAttachment[] => {
      const hits = resolveGenerationMentions(text, candidates)
      const added: StudioOperatorAttachment[] = []
      for (const hit of hits) {
        const attachment = candidates.find((item) => item.id === hit.id)
        // 已经挂着的那条不算「新挂上」——`addOperatorMention` 自己按 id 去重，
        // 这里只是不把它再报一次给调用方（否则每敲一个键都像挂了一张新图）。
        if (!attachment || mentions.some((item) => item.id === attachment.id)) {
          continue
        }
        addOperatorMention(attachment)
        added.push(attachment)
      }
      return added
    },
    [mentions],
  )

  const acceptDrop = useCallback(
    (dataTransfer: DataTransfer | null): readonly File[] => {
      if (!dataTransfer) return []
      const ids = parseDroppedAssetIds(dataTransfer.getData(ASSET_DND_MIME))
      if (ids.length > 0) {
        /**
         * ⚠ 拖拽只递了 id，chip 上要缩略图与名字，所以现取一次详情。
         * ⭐ 走 `/api/generations/{id}` 的**详情**口（`fetchGenerationByIdAPI`，
         * 工作台 remix 用的就是它），⛔ 不是 `/api/generations` 那个列表口 ——
         * 后者会打断正在跑的生成（本仓踩过）。
         * ⚠ 取不到就静默跳过这一条：拖来的可能是别人的图或已经删掉的行，
         * 为此把输入框打红是不成比例的。
         */
        void Promise.all(ids.map((id) => fetchGenerationByIdAPI(id))).then(
          (results) => {
            for (const result of results) {
              if (!result.success || !result.data.url) continue
              addOperatorMention(toOperatorAttachment(result.data))
            }
          },
        )
        return []
      }
      return [...(dataTransfer.files ?? [])]
    },
    [],
  )

  return {
    chips: mentions,
    count: mentions.length,
    overLimit: mentions.length > STUDIO_OPERATOR_MENTION.warnAboveCount,
    addChip: addOperatorMention,
    removeChip: removeOperatorMention,
    clearChips: clearOperatorMentions,
    trigger: closedStart === null ? trigger : null,
    syncDraft,
    closePicker,
    pick,
    syncNameMentions,
    acceptDrop,
  }
}
