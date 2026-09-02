import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * C1：画布操作员宿主**已挂、未接 UI**的结构性证明。
 *
 * `StudioNodeWorkbench.tsx` 5000+ 行、没有渲染测试宿主，这里读源码钉两件事：
 * ① 宿主 hook 在组件里被调用并经 `<StudioOperatorHostProvider>` 提供给子树；
 * ② dock 仍走 marker 链 —— 共享操作员面板一个都没进画布（C2 平价后一次性切换）。
 */
const SOURCE = readFileSync(
  join(process.cwd(), 'src/components/business/node/StudioNodeWorkbench.tsx'),
  'utf8',
)

describe('StudioNodeWorkbench · 画布操作员宿主（C1）', () => {
  it('挂了宿主：useCanvasOperatorHost + StudioOperatorHostProvider', () => {
    expect(SOURCE).toContain(
      "import { useCanvasOperatorHost } from '@/hooks/node/use-canvas-operator-host'",
    )
    expect(SOURCE).toContain(
      "import { StudioOperatorHostProvider } from '@/contexts/studio-operator-host'",
    )
    expect(SOURCE).toContain(
      'const canvasOperatorHost = useCanvasOperatorHost({',
    )
    expect(SOURCE).toContain(
      '<StudioOperatorHostProvider host={canvasOperatorHost}>',
    )
    expect(SOURCE).toContain('</StudioOperatorHostProvider>')
  })

  it('dock 未换：共享操作员面板不进画布，旧 op 执行链仍在（marker 链到 C2 才退役）', () => {
    expect(SOURCE).not.toContain('StudioOperatorDock')
    expect(SOURCE).not.toContain('StudioOperatorPanel')
    expect(SOURCE).not.toContain('useAssistantOperator')
    expect(SOURCE).toContain('<StudioNodeAssistantDock')
    expect(SOURCE).toContain('handleRunAssistantCanvasOps')
  })
})
