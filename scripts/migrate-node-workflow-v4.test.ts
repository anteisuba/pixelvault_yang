import { describe, expect, it, vi } from 'vitest'

import {
  MIGRATION_MODES,
  PROJECT_OUTCOMES,
  censusByVersion,
  formatProjectLine,
  migrateOneProject,
  parseCliArgs,
  readStateVersion,
  selectProjectsToMigrate,
  summarize,
  type MigrateProjectDeps,
  type MigrationProjectRow,
} from './migrate-node-workflow-v4'

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

const V4_STATE = { version: 4, nodes: [], edges: [] }

function row(
  overrides: Partial<MigrationProjectRow> = {},
): MigrationProjectRow {
  return {
    id: 'p1',
    name: '项目一',
    isDeleted: false,
    clerkId: 'user_1',
    state: V3_STATE,
    ...overrides,
  }
}

function deps(overrides: Partial<MigrateProjectDeps> = {}): MigrateProjectDeps {
  return {
    backup: vi.fn().mockResolvedValue({ key: 'backups/x.json' }),
    persist: vi.fn().mockResolvedValue(undefined),
    now: NOW,
    ...overrides,
  }
}

describe('parseCliArgs', () => {
  it('默认 dry-run', () => {
    expect(parseCliArgs([])).toEqual({ mode: MIGRATION_MODES.dryRun })
  })

  it('认 --apply / --project / --limit（两种写法）', () => {
    expect(
      parseCliArgs(['--apply', '--project', 'p9', '--limit', '5']),
    ).toEqual({ mode: MIGRATION_MODES.apply, projectId: 'p9', limit: 5 })
    expect(parseCliArgs(['--project=p9', '--limit=2'])).toEqual({
      mode: MIGRATION_MODES.dryRun,
      projectId: 'p9',
      limit: 2,
    })
  })

  it('未知参数与坏 --limit 直接抛，不静默忽略', () => {
    expect(() => parseCliArgs(['--aply'])).toThrow(/未知参数/)
    expect(() => parseCliArgs(['--limit', '0'])).toThrow(/正整数/)
    expect(() => parseCliArgs(['--limit', 'abc'])).toThrow(/正整数/)
    expect(() => parseCliArgs(['--project'])).toThrow(/需要一个值/)
  })
})

describe('普查与过滤', () => {
  it('readStateVersion：缺省 / 非数字都算 null', () => {
    expect(readStateVersion(V4_STATE)).toBe(4)
    expect(readStateVersion(V3_STATE)).toBeNull()
    expect(readStateVersion({ version: '4' })).toBeNull()
    expect(readStateVersion(null)).toBeNull()
  })

  it('censusByVersion 把缺省版本记成 none', () => {
    expect(
      censusByVersion([
        row({ id: 'a' }),
        row({ id: 'b' }),
        row({ id: 'c', state: V4_STATE }),
        row({ id: 'd', state: { version: 3 } }),
      ]),
    ).toEqual({ none: 2, '4': 1, '3': 1 })
  })

  it('只选 version 缺省/≠4 的未删项目', () => {
    const selected = selectProjectsToMigrate([
      row({ id: 'a' }),
      row({ id: 'b', state: V4_STATE }),
      row({ id: 'c', state: { version: 3 } }),
      row({ id: 'd', isDeleted: true }),
    ])
    expect(selected.map((item) => item.id)).toEqual(['a', 'c'])
  })

  it('--project / --limit 在过滤这一步生效', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })]
    expect(
      selectProjectsToMigrate(rows, { projectId: 'b' }).map((item) => item.id),
    ).toEqual(['b'])
    expect(
      selectProjectsToMigrate(rows, { limit: 2 }).map((item) => item.id),
    ).toEqual(['a', 'b'])
  })
})

describe('migrateOneProject', () => {
  it('已经是 v4 → 幂等跳过，不备份不写', async () => {
    const injected = deps()
    const report = await migrateOneProject(
      row({ state: V4_STATE }),
      injected,
      MIGRATION_MODES.apply,
    )
    expect(report.outcome).toBe(PROJECT_OUTCOMES.skippedAlreadyV4)
    expect(injected.backup).not.toHaveBeenCalled()
    expect(injected.persist).not.toHaveBeenCalled()
  })

  it('dry-run：过 v4 schema 但不写库', async () => {
    const injected = deps()
    const report = await migrateOneProject(
      row(),
      injected,
      MIGRATION_MODES.dryRun,
    )
    expect(report.outcome).toBe(PROJECT_OUTCOMES.validated)
    expect(report.nodes).toBe(2)
    expect(injected.persist).not.toHaveBeenCalled()
  })

  it('apply：备份成功 → 写回 version 4', async () => {
    const injected = deps()
    const report = await migrateOneProject(
      row(),
      injected,
      MIGRATION_MODES.apply,
    )
    expect(report.outcome).toBe(PROJECT_OUTCOMES.migrated)
    expect(report.backupKey).toBe('backups/x.json')
    expect(injected.persist).toHaveBeenCalledTimes(1)
    const [, persisted] = vi.mocked(injected.persist).mock.calls[0]!
    expect(persisted.version).toBe(4)
    expect(persisted.nodes).toHaveLength(2)
  })

  it('备份返回 null → 跳过该项目，⛔ 不写', async () => {
    const injected = deps({ backup: vi.fn().mockResolvedValue(null) })
    const report = await migrateOneProject(
      row(),
      injected,
      MIGRATION_MODES.apply,
    )
    expect(report.outcome).toBe(PROJECT_OUTCOMES.backupFailed)
    expect(injected.persist).not.toHaveBeenCalled()
  })

  it('备份抛错 → 同样不写', async () => {
    const injected = deps({
      backup: vi.fn().mockRejectedValue(new Error('R2 down')),
    })
    const report = await migrateOneProject(
      row(),
      injected,
      MIGRATION_MODES.apply,
    )
    expect(report.outcome).toBe(PROJECT_OUTCOMES.backupFailed)
    expect(injected.persist).not.toHaveBeenCalled()
  })

  it('标着 v4 却过不了 schema → 记失败大声报出来，不当成已迁移', async () => {
    const injected = deps()
    const report = await migrateOneProject(
      row({ state: { version: 4, nodes: 'broken' } }),
      injected,
      MIGRATION_MODES.apply,
    )
    expect(report.outcome).toBe(PROJECT_OUTCOMES.invalidResult)
    expect(injected.backup).not.toHaveBeenCalled()
    expect(injected.persist).not.toHaveBeenCalled()
  })
})

describe('汇总与日志', () => {
  it('summarize 分成功/跳过/失败三桶', () => {
    expect(
      summarize([
        { id: 'a', name: 'a', outcome: PROJECT_OUTCOMES.migrated },
        { id: 'b', name: 'b', outcome: PROJECT_OUTCOMES.validated },
        { id: 'c', name: 'c', outcome: PROJECT_OUTCOMES.skippedAlreadyV4 },
        { id: 'd', name: 'd', outcome: PROJECT_OUTCOMES.backupFailed },
        { id: 'e', name: 'e', outcome: PROJECT_OUTCOMES.migrationFailed },
        { id: 'f', name: 'f', outcome: PROJECT_OUTCOMES.invalidResult },
      ]),
    ).toEqual({ succeeded: 2, skipped: 1, failed: 3 })
  })

  it('每项目一行日志带上关键读数', () => {
    expect(
      formatProjectLine({
        id: 'p1',
        name: '项目一',
        outcome: PROJECT_OUTCOMES.migrated,
        nodes: 2,
        edges: 1,
        backupKey: 'backups/x.json',
      }),
    ).toBe(
      '[migrate-v4] migrated p1 (项目一) nodes=2 edges=1 backup=backups/x.json',
    )
  })
})
