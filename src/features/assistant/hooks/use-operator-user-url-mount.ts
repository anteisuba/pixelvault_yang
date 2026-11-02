'use client'

/**
 * 「用户亲手递来的一条地址 → 取图入库 → 挂成参考图」的**客户端那一跳**
 * （P3-D，拍板 22；P4-C 抽成两个宿主共用）。
 *
 * ── 为什么抽出来 ───────────────────────────────────────────────────
 * P4-C 之后操作员有两个宿主（工作台 / LoRA 装配台），而这一跳在两边**做的是同一件
 * 事**：参考图卡两边都是同一个 `useImageUpload`，导入路由也只有一条。抄两份的下场
 * 是其中一份哪天漏掉了「失败往线程里插一行」，而那种不一致没有人会去查。
 *
 * ⚠ 服务端在这一步**一个字节都没碰**（钱闸 / R2 结构闸不松）：工具环只吐一个带着
 * 源地址的 op，取图 / 落 R2 / 落库全部发生在这里。
 */

import { flushSync } from 'react-dom'
import { useCallback, useMemo, useRef, useEffect } from 'react'

import {
  appendOperatorEntry,
  nextOperatorEntryId,
} from '@/hooks/use-studio-operator-store'
import { importWebImageAPI } from '@/lib/api-client/web-image-import'

/**
 * ⚠ **模块级，不是 hook 里的 ref**：应用与撤销发生在两个不同的 hook 实例上
 * （面板的事件循环 / 参数栏的 ✦）。存进 ref 的表现是「点撤销没反应」—— 那边的表
 * 那时是空的。
 * ⚠ 它是一张**会话内**的对照表：刷新页面就没了，而刷新之后线程本来也没了。
 */
const userUrlMounts = new Map<string, string>()

/**
 * **正在路上的那些源地址**（2026-09-07）。
 *
 * 🔬 根因：一条 `import_user_url` 的取图要几秒，而这几秒里同一条地址可以再来一次
 * —— 打断后带 `priorSteps` 续跑、模型换个措辞把同一张再挂一遍、或者用户自己在候选
 * 行上按了「选用」。`userUrlMounts` 只在**成功之后**才有这条键，所以它挡不住在飞的
 * 那一次；这张表是同步写的，它才挡得住。
 * ⚠ 模块级，理由同 `userUrlMounts`：应用与撤销发生在两个不同的 hook 实例上。
 * ⛔ 它只是第一道 —— 跨路（助手 vs. 候选行「选用」）的那道在服务端（同一条来源
 * 已在库里就复用，见 `web-image-import.service`）。
 */
const inflightUserUrls = new Set<string>()

export interface OperatorReferenceSurface {
  referenceEntries: readonly { url: string }[]
  addReferenceImage(url: string): void
  /** ⚠ 契约是**按索引**摘，所以按 URL 摘要先找位。 */
  removeReferenceImage(index: number): void
}

export interface OperatorUserUrlMount {
  mountUserUrl(sourceUrl: string, domain?: string): void
  unmountUserUrl(sourceUrl: string): void
}

export function useOperatorUserUrlMount(
  imageUpload: OperatorReferenceSurface,
): OperatorUserUrlMount {
  const latest = useRef(imageUpload)
  // ⚠ 同步写在 effect 里（本仓 latest-ref 的既有写法）：render 阶段改 ref 会被
  //   `react-hooks/refs` 拦下来。这两只手永远在事件处理器里被调。
  useEffect(() => {
    latest.current = imageUpload
  }, [imageUpload])

  /**
   * ⚠ 走的是 P3-B 那条**既有**导入路由，⛔ 不新开一条：它已经带着字节上限、
   * `sharp` 魔数判型、缩略图、来源快照与 `isPublic:false`。
   * ⛔ 失败不静默：往线程里插一行，⛔ 也不弹 toast —— 助手做的事就该在助手的
   * 线程里交代。
   */
  const mountUserUrl = useCallback((sourceUrl: string, domain?: string) => {
    // 已经挂上的 / 正在路上的都**不再来一次**：那只会在库里多出一条一模一样的。
    if (userUrlMounts.has(sourceUrl) || inflightUserUrls.has(sourceUrl)) return
    inflightUserUrls.add(sourceUrl)
    void importWebImageAPI({
      imageUrl: sourceUrl,
      ...(domain ? { domain } : {}),
    })
      .then((response) => {
        inflightUserUrls.delete(sourceUrl)
        if (!response.success) {
          appendOperatorEntry({
            kind: 'system',
            id: nextOperatorEntryId('sys'),
            code: 'urlImportFailed',
            subject: domain || sourceUrl,
          })
          return
        }
        userUrlMounts.set(sourceUrl, response.data.generation.url)
        flushSync(() =>
          latest.current.addReferenceImage(response.data.generation.url),
        )
      })
      .catch(() => {
        inflightUserUrls.delete(sourceUrl)
        appendOperatorEntry({
          kind: 'system',
          id: nextOperatorEntryId('sys'),
          code: 'urlImportFailed',
          subject: domain || sourceUrl,
        })
      })
  }, [])

  const unmountUserUrl = useCallback((sourceUrl: string) => {
    const mounted = userUrlMounts.get(sourceUrl)
    // 还在路上就撤销 = 表里还没有它。⚠ 把源地址记成「别挂了」是另一套状态机；
    // 这里选简单的一侧：撤销一条几秒内的挂载是罕见动作，而多一套取消语义会让
    // 「挂上了没有」变成两个真相。
    if (!mounted) return
    const index = latest.current.referenceEntries.findIndex(
      (entry) => entry.url === mounted,
    )
    if (index >= 0) latest.current.removeReferenceImage(index)
    userUrlMounts.delete(sourceUrl)
  }, [])

  return useMemo(
    () => ({ mountUserUrl, unmountUserUrl }),
    [mountUserUrl, unmountUserUrl],
  )
}
