import { describe, expect, it, vi } from 'vitest'

import {
  NODE_V4_UPGRADE_OUTCOMES,
  upgradeNodeWorkflowStateToV4,
} from '@/lib/node-workflow-v4-upgrade'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const NOW = '2026-09-07T00:00:00.000Z'

const V3_STATE = {
  nodes: [
    {
      id: 'n_kf',
      type: 'frameImage',
      position: { x: 0, y: 0 },
      data: { imageUrl: 'https://cdn.test/kf.png' },
    },
    {
      id: 'n_shot',
      type: 'seedance',
      position: { x: 400, y: 0 },
      data: { prompt: '7 秒中近景' },
    },
  ],
  edges: [{ id: 'e1', source: 'n_kf', target: 'n_shot' }],
}

describe('upgradeNodeWorkflowStateToV4', () => {
  it('v3 → 备份成功才升级，允许写回', async () => {
    const backup = vi.fn().mockResolvedValue({ key: 'backups/x.json' })
    const result = await upgradeNodeWorkflowStateToV4({
      projectId: 'p1',
      rawState: V3_STATE,
      backup,
      now: NOW,
    })
    expect(backup).toHaveBeenCalledWith('p1')
    expect(result.outcome).toBe(NODE_V4_UPGRADE_OUTCOMES.upgraded)
    expect(result.canPersist).toBe(true)
    expect(result.backupKey).toBe('backups/x.json')
    expect(result.state?.version).toBe(4)
    expect(result.state?.nodes).toHaveLength(2)
  })

  it('备份失败 → 不允许写回，但仍给出可渲染的 v4 视图', async () => {
    const backup = vi.fn().mockResolvedValue(null)
    const result = await upgradeNodeWorkflowStateToV4({
      projectId: 'p1',
      rawState: V3_STATE,
      backup,
      now: NOW,
    })
    expect(result.outcome).toBe(NODE_V4_UPGRADE_OUTCOMES.backupFailed)
    expect(result.canPersist).toBe(false)
    expect(result.state?.nodes).toHaveLength(2)
  })

  it('备份抛错也一样关闸，不静默升级', async () => {
    const backup = vi.fn().mockRejectedValue(new Error('R2 down'))
    const result = await upgradeNodeWorkflowStateToV4({
      projectId: 'p1',
      rawState: V3_STATE,
      backup,
      now: NOW,
    })
    expect(result.canPersist).toBe(false)
    expect(result.outcome).toBe(NODE_V4_UPGRADE_OUTCOMES.backupFailed)
  })

  it('已经是 v4 时一次备份都不发', async () => {
    const backup = vi.fn()
    const result = await upgradeNodeWorkflowStateToV4({
      projectId: 'p1',
      rawState: { version: 4, nodes: [], edges: [] },
      backup,
      now: NOW,
    })
    expect(backup).not.toHaveBeenCalled()
    expect(result.outcome).toBe(NODE_V4_UPGRADE_OUTCOMES.alreadyV4)
    expect(result.canPersist).toBe(true)
  })

  it('v4 parse 失败不兜成空状态，而是关闸报错', async () => {
    const backup = vi.fn()
    const result = await upgradeNodeWorkflowStateToV4({
      projectId: 'p1',
      rawState: { version: 4, nodes: [{ id: 'x' }], edges: [] },
      backup,
      now: NOW,
    })
    expect(result.outcome).toBe(NODE_V4_UPGRADE_OUTCOMES.migrationFailed)
    expect(result.canPersist).toBe(false)
    expect(result.state).toBeUndefined()
  })

  it('迁移产物的槽 binding 已经重算好（首帧槽里看得见来源）', async () => {
    const backup = vi.fn().mockResolvedValue({ key: 'k' })
    const result = await upgradeNodeWorkflowStateToV4({
      projectId: 'p1',
      rawState: V3_STATE,
      backup,
      now: NOW,
    })
    const shot = result.state?.nodes.find((node) => node.id === 'n_shot')
    expect(shot?.data.slots?.firstFrame?.versions).toHaveLength(1)
    expect(shot?.data.slots?.firstFrame?.cur).toBeTruthy()
  })
})
