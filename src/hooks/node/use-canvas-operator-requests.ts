'use client'

/**
 * 画布上那三张**便条**的消费端（进度表 22）。
 *
 * ── 这个 hook 为什么存在 ───────────────────────────────────────────
 * 画布上有三个入口不在助手面板里：节点右键的「重跑下游」、文本卡助手栏的
 * 续写 / 重写、剪辑台排片栏的一句话排片。三者都用同一种办法把意图递过来 ——
 * 一张模块级便条（`lib/canvas-rerun-request.ts` 那份头注写清了为什么不是回调）。
 * 便条的消费方一直是画布自己那只 dock；那只 dock 2026-09-19 退场了，于是这三条
 * 通道**没有去处**。⛔ 让它们静默失效是这一轮最容易犯、也最难发现的错：
 * 三处入口照样点得动、照样有动画，就是什么都不发生。
 *
 * ── 它做的事只有一件：把便条译成一句话发出去 ────────────────────────
 * ⛔ 它不算拓扑、不调模型、不碰画布：下游名单归 `canvas_plan_rerun`（服务端那一
 * 步之后由宿主沿边算），写字归 `canvas_apply` 的 `set_text`，两者都各自可撤销、
 * 各自进登记簿。这里多算一遍等于第二份真相。
 *
 * ⚠ **只在画布域生效**：同一颗 dock 也挂在图片 / 视频 / LoRA 三台工作台上，那里
 * 收到画布便条只会发出一句谁都看不懂的话。
 */

import { useEffect } from 'react'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import type { AssistantOperatorDomain } from '@/constants/assistant-operator'
import {
  subscribeCanvasRerunDownstream,
  takeCanvasRerunDownstream,
} from '@/lib/canvas-rerun-request'
import {
  subscribeTimelinePlanRequest,
  takeTimelinePlanRequest,
} from '@/lib/timeline-plan-request'
import {
  subscribeCanvasTextAssist,
  takeCanvasTextAssist,
  type TextAssistRequest,
} from '@/components/business/node/nodes/v4/text/text-assist-request'

export interface UseCanvasOperatorRequestsInput {
  /** 这只 dock 此刻在哪个域 —— ⛔ 不是画布就一张便条都不取。 */
  readonly domain: AssistantOperatorDomain
  /** 面板的发送口（`useAssistantOperator().send`）。 */
  send(text: string): void
  /**
   * 节点 id → 给人读的名字。
   *
   * ⚠ 句子里写**名字**不是 id：用户看着画布，他认得「S02·首帧」，认不得一串
   * uuid；而模型下一步要写回来的那个 id 由它自己从快照里取。
   * 名字取不到时回落成 id —— ⛔ 不因此不发（那就是静默失效）。
   */
  nodeName(nodeId: string): string
}

function textAssistSentence(request: TextAssistRequest, name: string): string {
  const note = request.prompt.trim()
  if (request.action === 'continue') {
    return note
      ? `把「${name}」这段接着往下写：${note}`
      : `把「${name}」这段接着往下写。`
  }
  if (request.action === 'rewrite') {
    return note ? `把「${name}」这段重写：${note}` : `把「${name}」这段重写。`
  }
  return note ? `「${name}」：${note}` : `帮我看看「${name}」这段。`
}

export function useCanvasOperatorRequests({
  domain,
  send,
  nodeName,
}: UseCanvasOperatorRequestsInput): void {
  const isCanvas = domain === ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas

  useEffect(() => {
    if (!isCanvas) return undefined
    return subscribeCanvasRerunDownstream(() => {
      const nodeId = takeCanvasRerunDownstream()
      if (!nodeId) return
      send(
        `我刚改了「${nodeName(nodeId)}」，帮我看看下游哪几张卡要重跑。先只列名单，别跑。`,
      )
    })
  }, [isCanvas, send, nodeName])

  useEffect(() => {
    if (!isCanvas) return undefined
    return subscribeCanvasTextAssist(() => {
      const request = takeCanvasTextAssist()
      if (!request) return
      send(textAssistSentence(request, nodeName(request.nodeId)))
    })
  }, [isCanvas, send, nodeName])

  /**
   * ⚠ 一句话排片这一轮**只送过去，不回程**（如实记在任务包里）：回程那一跳
   * （`deliverTimelineProposal`）要一份 `TimelineProposal`，而操作员的工具表里
   * 今天还没有产出时间线的那一条。所以剪辑台那条排片栏现在得到的是「助手在
   * 面板里答你」，⛔ 不是一份可以直接点应用的提案。
   * ⛔ 别为此在这里编一份提案 —— 那是凭空造一个用户会照着剪的时间线。
   */
  useEffect(() => {
    if (!isCanvas) return undefined
    return subscribeTimelinePlanRequest(() => {
      const request = takeTimelinePlanRequest()
      if (!request) return
      const note = request.prompt.trim()
      if (!note) return
      send(note)
    })
  }, [isCanvas, send])
}
