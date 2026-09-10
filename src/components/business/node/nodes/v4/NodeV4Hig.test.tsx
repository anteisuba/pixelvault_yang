/**
 * HIG 定稿（owner 2026-09-08 = `proto6-expanded-A-hig`）里**还活着**的那条算术。
 *
 * ⚠ 2026-09-10（S3 图片节点重做）：本文件原来的八条结构断言全部是拿**图片卡**当
 * 主语去核旧骨架 `NodeV4Shell`（卡头 44 / kind 标 / chevron / 展开态栈 / 媒体井 /
 * 关系带 / 证据抽屉）。图片卡在 v3 界面重做里换到了 `NodeCardShell`——「卡就是内容，
 * 没有卡头」正是 spec §1.1 要的结果，所以那八条不是回归、是**过时的规格**，随主语
 * 一起删（AGENTS「删除过时实现，不留垫片」）。旧骨架剩下的用户是音频与视频卡，
 * 它们各自的断言住在 `NodeV4.test.tsx` 与各自的测试里，整套骨架由 S11 删除。
 *
 * 留下的这一条与骨架无关：它核的是**展开宽与槽卡定宽之间的算术**，改任一个常量
 * 都会让「一屏 4 格整齐、第 5 格露 24px」这条设计意图静默失效。
 */

import { describe, expect, it } from 'vitest'

import { NODE_V4_CARD } from '@/constants/node-studio'

describe('NodeV4 HIG 定稿的几何算术', () => {
  it('展开宽 480，且槽轨定宽让「4 格整齐 + 第 5 格露 24px」成立', () => {
    // 480 − 32 卡内左右内距 = 448；4×100 + 3×8 = 424，第 5 格露 448 − 424 = 24。
    expect(NODE_V4_CARD.expandedWidth).toBe(480)
    const usable = NODE_V4_CARD.expandedWidth - 32
    const four = NODE_V4_CARD.slotCardWidth * 4 + NODE_V4_CARD.slotCardGap * 3
    expect(usable - four).toBe(24)
  })
})
