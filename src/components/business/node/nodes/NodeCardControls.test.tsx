import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NODE_WORKFLOW_FIELD_IDS } from '@/constants/node-types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// NodeFieldEditor 不用模型选择器，但它与本文件同模块；不切掉这棵子树会经由
// `@/i18n/navigation` 把 next-intl 的 navigation 实模块拉进来（ESM 解析失败）。
vi.mock('../WorkflowModelPicker', () => ({
  WorkflowModelPicker: () => null,
}))

const { updateNodeData } = vi.hoisted(() => ({ updateNodeData: vi.fn() }))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({ updateNodeData }),
}))

import { NodeFieldEditor } from './NodeCardControls'

const FIELD = NODE_WORKFLOW_FIELD_IDS.scene

function renderEditor(value = '') {
  render(
    <NodeFieldEditor
      nodeId="shot-text-1"
      data={{ [FIELD]: value } as NodeWorkflowNodeData}
      fields={[FIELD]}
    />,
  )
  return screen.getByPlaceholderText(`${FIELD}.placeholder`)
}

/**
 * 镜头文本的「场景 / 动作 / 镜头 / 构图」四个字段是全 app 中文正文最密集的一组，
 * 却曾是唯一绕过 `IMEAwareField` 的一处 —— 裸 `Textarea` 直连 `updateNodeData`，
 * 组字过程中父级 value 回灌会清掉输入法缓冲（拼音/假名还没上屏就被冲掉）。
 * 这组测试锁住换成 `IMEAwareTextarea` 之后的行为。
 */
describe('NodeFieldEditor', () => {
  beforeEach(() => {
    updateNodeData.mockClear()
  })

  it('组字期间不向上提交中间拼音，compositionend 才提交最终字符串', () => {
    const field = renderEditor()

    fireEvent.compositionStart(field)
    fireEvent.change(field, { target: { value: 'nihao' } })

    expect(
      updateNodeData,
      '组字期间不得把中间拼音提交上去',
    ).not.toHaveBeenCalled()
    expect(field).toHaveValue('nihao')

    fireEvent.change(field, { target: { value: '你好' } })
    fireEvent.compositionEnd(field, { target: { value: '你好' } })

    expect(updateNodeData).toHaveBeenCalledTimes(1)
    expect(updateNodeData).toHaveBeenCalledWith('shot-text-1', {
      [FIELD]: '你好',
    })
  })

  it('非组字状态下正常逐次提交，且焦点留在字段里', () => {
    const field = renderEditor()
    field.focus()

    fireEvent.change(field, { target: { value: 'a' } })

    expect(updateNodeData).toHaveBeenCalledTimes(1)
    expect(updateNodeData).toHaveBeenCalledWith('shot-text-1', { [FIELD]: 'a' })
    expect(document.activeElement).toBe(field)
  })

  it('父级回灌的新值在非组字时会同步下来', () => {
    const field = renderEditor('旧值')
    expect(field).toHaveValue('旧值')
  })

  it('键盘事件不冒泡出去，避免触发画布快捷键', () => {
    const onKeyDown = vi.fn()
    const onKeyUp = vi.fn()
    const { container } = render(
      <div onKeyDown={onKeyDown} onKeyUp={onKeyUp}>
        <NodeFieldEditor
          nodeId="shot-text-1"
          data={{ [FIELD]: '' } as NodeWorkflowNodeData}
          fields={[FIELD]}
        />
      </div>,
    )
    const field = container.querySelector('textarea')
    expect(field).not.toBeNull()

    fireEvent.keyDown(field!, { key: 'x' })
    fireEvent.keyUp(field!, { key: 'x' })

    expect(onKeyDown).not.toHaveBeenCalled()
    expect(onKeyUp).not.toHaveBeenCalled()
  })
})
