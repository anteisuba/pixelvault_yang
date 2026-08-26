import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}))

import { CanvasProjectPanel } from './CanvasProjectPanel'

const project = {
  id: 'p1',
  name: '演示项目',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
  nodeCount: 5,
}

describe('CanvasProjectPanel', () => {
  // G4（画布修法 P2 收口）：调查实测项目菜单里删除紧挨着改名，误点代价不
  // 对称——改名可以再改回来，删除大概率不可逆。这里锁的是收口后的结构：两颗
  // 按钮之间必须隔着一条分隔，删除仍然保留（而不是新加）危险色，且两颗各自
  // 的点击行为不受影响。
  it('把删除和改名用一条分隔隔开，删除保留危险色，行为不变', () => {
    const onRenameProject = vi.fn()
    const onDeleteProject = vi.fn()

    render(
      <CanvasProjectPanel
        projectName={project.name}
        projects={[project]}
        currentProjectId={project.id}
        nodeCount={project.nodeCount}
        onCreateProject={vi.fn()}
        onRenameProject={onRenameProject}
        onDeleteProject={onDeleteProject}
        onSwitchProject={vi.fn()}
      />,
    )

    const renameButton = screen.getByRole('button', {
      name: 'projectMenu.rename',
    })
    const deleteButton = screen.getByRole('button', {
      name: 'projectMenu.delete',
    })

    fireEvent.click(renameButton)
    expect(onRenameProject).toHaveBeenCalledTimes(1)
    fireEvent.click(deleteButton)
    expect(onDeleteProject).toHaveBeenCalledTimes(1)

    expect(deleteButton).toHaveClass('text-destructive')

    // 分隔与两颗按钮同处一个父容器，物理上位于两者之间——不是靠 CSS 间距
    // 假装隔开，是真的多了一个非交互元素把它们分开。
    const row = renameButton.parentElement
    expect(row).not.toBeNull()
    const children = Array.from(row!.children)
    const renameIndex = children.indexOf(renameButton)
    const deleteIndex = children.indexOf(deleteButton)
    expect(deleteIndex).toBe(renameIndex + 2)
    const divider = children[renameIndex + 1]
    expect(divider?.tagName).toBe('DIV')
    expect(divider).toHaveAttribute('aria-hidden', 'true')
  })

  it('保存与更新时间展示、项目切换等既有行为保持不变', () => {
    const onSwitchProject = vi.fn()
    const otherProject = { ...project, id: 'p2', name: '第二个项目' }

    render(
      <CanvasProjectPanel
        projectName={project.name}
        projects={[project, otherProject]}
        currentProjectId={project.id}
        nodeCount={project.nodeCount}
        onCreateProject={vi.fn()}
        onRenameProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onSwitchProject={onSwitchProject}
      />,
    )

    fireEvent.click(screen.getByText('第二个项目'))
    expect(onSwitchProject).toHaveBeenCalledWith('p2')
  })
})
