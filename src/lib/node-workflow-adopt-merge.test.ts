import { describe, expect, it } from 'vitest'

import { NODE_STUDIO_WORKFLOW_STORAGE } from '@/constants/node-studio'
import type {
  NodeV4,
  NodeWorkflowProjectV4,
  NodeWorkflowStateV4,
  NodeWorkflowStorageV4Snapshot,
} from '@/types/node-workflow'

import { mergeAdoptedProjects } from './node-workflow-adopt-merge'

const OWNER = 'user_owner'

function stateWith(nodeIds: readonly string[]): NodeWorkflowStateV4 {
  const nodes: NodeV4[] = nodeIds.map((id) => ({
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'text',
      subtype: 'script',
      name: id,
      status: 'idle',
      createdAt: '2026-09-10T00:00:00.000Z',
      body: '',
    },
  }))
  return { version: 4, nodes, edges: [] }
}

function project(
  id: string,
  updatedAt: string,
  nodeIds: readonly string[] = [],
): NodeWorkflowProjectV4 {
  return {
    id,
    name: id,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt,
    state: stateWith(nodeIds),
  }
}

function snapshot(
  currentProjectId: string,
  projects: readonly NodeWorkflowProjectV4[],
  ownerClerkId = OWNER,
): NodeWorkflowStorageV4Snapshot {
  return {
    version: NODE_STUDIO_WORKFLOW_STORAGE.version,
    ownerClerkId,
    currentProjectId,
    projects: [...projects],
  }
}

const EMPTY = new Set<string>()

describe('mergeAdoptedProjects', () => {
  it('首屏窗口内建的节点活下来，当前项目不跳', () => {
    // 窗口里：localStorage 读出 p1 / p2，用户在 p2 上建了一张卡。
    const local = snapshot('p2', [
      project('p1', '2026-09-10T09:00:00.000Z'),
      project('p2', '2026-09-10T09:00:01.000Z', ['just-made']),
    ])
    // 服务端按 lastActiveAt 倒序回来，第 0 条是 p1 —— 旧代码会把当前项目跳到它。
    const merged = mergeAdoptedProjects({
      local,
      server: [
        project('p1', '2026-09-10T09:00:00.000Z'),
        project('p2', '2026-09-10T08:00:00.000Z'),
      ],
      ownerClerkId: OWNER,
      editedBeforeHydration: new Set(['p2']),
      readOnlyIds: EMPTY,
    })

    expect(merged.currentProjectId).toBe('p2')
    expect(
      merged.projects.find((p) => p.id === 'p2')?.state.nodes.map((n) => n.id),
    ).toEqual(['just-made'])
  })

  it('窗口里新建的、服务端还没有的项目也留着', () => {
    const local = snapshot('fresh', [
      project('fresh', '2026-09-10T09:00:00.000Z', ['a']),
    ])
    const merged = mergeAdoptedProjects({
      local,
      server: [project('p1', '2026-09-10T08:00:00.000Z')],
      ownerClerkId: OWNER,
      editedBeforeHydration: new Set(['fresh']),
      readOnlyIds: EMPTY,
    })

    expect(merged.projects.map((p) => p.id)).toEqual(['p1', 'fresh'])
    expect(merged.currentProjectId).toBe('fresh')
  })

  it('没被改过的本地独有项目不复活（多半是别的设备上删掉的）', () => {
    const local = snapshot('ghost', [
      project('ghost', '2026-09-09T00:00:00.000Z', ['x']),
    ])
    const merged = mergeAdoptedProjects({
      local,
      server: [project('p1', '2026-09-10T00:00:00.000Z')],
      ownerClerkId: OWNER,
      editedBeforeHydration: EMPTY,
      readOnlyIds: EMPTY,
    })

    expect(merged.projects.map((p) => p.id)).toEqual(['p1'])
    expect(merged.currentProjectId).toBe('p1')
  })

  it('本地 updatedAt 更新时保留本地（上次防抖 PUT 没发出去）', () => {
    const merged = mergeAdoptedProjects({
      local: snapshot('p1', [
        project('p1', '2026-09-10T10:00:00.000Z', ['local']),
      ]),
      server: [project('p1', '2026-09-10T09:00:00.000Z', ['server'])],
      ownerClerkId: OWNER,
      editedBeforeHydration: EMPTY,
      readOnlyIds: EMPTY,
    })

    expect(merged.projects[0]?.state.nodes.map((n) => n.id)).toEqual(['local'])
  })

  it('服务端更新时以服务端为准', () => {
    const merged = mergeAdoptedProjects({
      local: snapshot('p1', [
        project('p1', '2026-09-10T08:00:00.000Z', ['local']),
      ]),
      server: [project('p1', '2026-09-10T09:00:00.000Z', ['server'])],
      ownerClerkId: OWNER,
      editedBeforeHydration: EMPTY,
      readOnlyIds: EMPTY,
    })

    expect(merged.projects[0]?.state.nodes.map((n) => n.id)).toEqual(['server'])
  })

  it('只读记录（v3 备份失败）一律用服务端那份，本地顶不上去', () => {
    const merged = mergeAdoptedProjects({
      local: snapshot('p1', [
        project('p1', '2026-09-10T10:00:00.000Z', ['local']),
      ]),
      server: [project('p1', '2026-09-10T09:00:00.000Z', ['server'])],
      ownerClerkId: OWNER,
      editedBeforeHydration: new Set(['p1']),
      readOnlyIds: new Set(['p1']),
    })

    expect(merged.projects[0]?.state.nodes.map((n) => n.id)).toEqual(['server'])
  })

  it('上一个账号留下的本地快照一个字都不合并', () => {
    const merged = mergeAdoptedProjects({
      local: snapshot(
        'p1',
        [project('p1', '2026-09-10T10:00:00.000Z', ['other-user'])],
        'user_someone_else',
      ),
      server: [project('p1', '2026-09-10T09:00:00.000Z', ['server'])],
      ownerClerkId: OWNER,
      editedBeforeHydration: new Set(['p1']),
      readOnlyIds: EMPTY,
    })

    expect(merged.ownerClerkId).toBe(OWNER)
    expect(merged.projects[0]?.state.nodes.map((n) => n.id)).toEqual(['server'])
  })

  it('id 与 createdAt 永远是服务端的身份，本地只贡献内容', () => {
    const merged = mergeAdoptedProjects({
      local: snapshot('p1', [
        {
          ...project('p1', '2026-09-10T10:00:00.000Z', ['local']),
          createdAt: '1999-01-01T00:00:00.000Z',
          name: '本地改的名字',
        },
      ]),
      server: [project('p1', '2026-09-10T09:00:00.000Z', ['server'])],
      ownerClerkId: OWNER,
      editedBeforeHydration: new Set(['p1']),
      readOnlyIds: EMPTY,
    })

    expect(merged.projects[0]?.createdAt).toBe('2026-09-01T00:00:00.000Z')
    expect(merged.projects[0]?.name).toBe('本地改的名字')
  })

  it('读不出时间戳时不许本地赢', () => {
    const merged = mergeAdoptedProjects({
      local: snapshot('p1', [project('p1', 'not-a-date', ['local'])]),
      server: [project('p1', '2026-09-10T09:00:00.000Z', ['server'])],
      ownerClerkId: OWNER,
      editedBeforeHydration: EMPTY,
      readOnlyIds: EMPTY,
    })

    expect(merged.projects[0]?.state.nodes.map((n) => n.id)).toEqual(['server'])
  })
})
