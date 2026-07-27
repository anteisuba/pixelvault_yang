'use client'

import { MiniMap, useNodes } from '@xyflow/react'
import { useTranslations } from 'next-intl'

export function CanvasMiniMap() {
  const t = useTranslations('StudioNode')
  const nodes = useNodes()

  if (nodes.length === 0) {
    return null
  }

  return (
    // v0.2 皮（2026-07-27）：原来这里是旧皮的「蓝图纸」——深青底 `--node-blueprint-*`，
    // 且 nodeColor 与 bgColor **同值**（深底上靠线框读出节点，是"线框感"的做法）。
    // 画布换成浅色域之后这套整个失效：深青底成了白画布上的一个黑洞，而节点填充
    // 与底色同值意味着**连线框都看不见** —— owner 反馈"纯黑什么都看不到"。
    //
    // 改法：容器交给 `.canvas-glass`（canvas.css 已有的 §8 玻璃配方，自带
    // backdrop-filter 与不支持时的降级），SVG 内部只留内容色：
    //  · bgColor 透明   —— 让玻璃容器透出来，minimap 不再自带一块不透明底
    //  · nodeColor 淡填 + nodeStrokeColor 中性描边 —— 节点这次是**看得见的实体**，
    //    不再走"填充融进底色"那条只在深底成立的路子
    //  · maskStrokeColor 用 accent：视口框是"你现在在看哪儿"，正是 §0.6 给
    //    accent 定义的「活跃 / 指向」，不是结构着色。要退回中性只需换成
    //    --canvas-stroke-focus，一行的事。
    <MiniMap
      ariaLabel={t('minimapTitle')}
      position="bottom-left"
      pannable
      zoomable
      nodeColor="var(--canvas-stroke-bold)"
      nodeStrokeColor="var(--canvas-ink-subtle)"
      nodeStrokeWidth={1.5}
      maskColor="color-mix(in oklab, var(--canvas-bg) 72%, transparent)"
      maskStrokeColor="var(--canvas-accent)"
      bgColor="transparent"
      // S2b（2026-07-26）：左下角现在被左侧合体面板占着，minimap 必须让开。
      // 靠 --canvas-minimap-left 定位，值由 StudioNodeWorkbench 按面板展开态给：
      // 展开 = 面板宽 + 间距，收起 = 图标轨宽 + 间距。作用域外（无该变量时）
      // 回退到原来的贴边值，不影响任何非画布消费者。
      style={{
        left: 'var(--canvas-minimap-left, 1rem)',
        border: '1px solid var(--canvas-stroke-regular)',
      }}
      className="canvas-glass !bottom-24 !m-0 !h-32 !w-48 overflow-hidden rounded-2xl md:!bottom-28"
    />
  )
}
