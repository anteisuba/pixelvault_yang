/**
 * 节点详情面板的七个骨架槽位。
 *
 * 契约来源：`docs/references/pages/canvas-node-detail.md` §2（Round 2 A
 * 「媒体优先」，owner 2026-08-04 确认）。判据是「一个槽 = 回答用户一个问题」：
 *
 *   1 身份条   我打开的是谁？现在什么状态？怎么退回画布？
 *   2 主体台   这个节点此刻是什么？证据长什么样？
 *   3 编排台   这次怎么做：写什么、哪个模型、什么参数？
 *   4 素材架   这次用什么材料？从哪来？还差什么？
 *   5 关系带   绑了哪张卡/谁的声音，又被哪些节点用？
 *   6 证据抽屉 这次真正会送出什么？刚才为什么失败？有什么限制？
 *   7 动作坞   这一屏的主事是什么？现在能不能做？
 *
 * ⚠ **槽是结构约定，不要求界面上出现槽标题**（契约 R1「一级面零标题预算」）。
 * 这些 id 只用于 `data-node-detail-slot` 与 DOM 序断言，不是给用户看的文案。
 */
export const NODE_DETAIL_SLOT_IDS = {
  identity: 'identity-bar',
  stage: 'subject-stage',
  rack: 'source-rack',
  desk: 'compose-desk',
  relations: 'relations-strip',
  evidence: 'evidence-drawer',
  dock: 'action-dock',
} as const

export type NodeDetailSlotId =
  (typeof NODE_DETAIL_SLOT_IDS)[keyof typeof NODE_DETAIL_SLOT_IDS]

/**
 * 滚动区内四槽的顺序 —— **这个元组是 DOM 序的唯一事实源**。
 *
 * ⚠ 契约「槽序 = DOM 序 = 键盘序，全断点严格 2→3→4→5→6→7，不得跳序」是不可推翻的
 * （方向 C 就是因为桌面 Tab 序 3→5→2→4→6→7 出局）。壳必须按本元组 `map`，
 * **永远不要迭代 `Object.keys(slots)`** —— 那等于把契约交给各族 body 的字面量书写顺序，
 * 十个族里只要有一个人换了个位置写，键盘用户拿到的顺序就变了，而且没有任何东西会报错。
 *
 * 身份条（1）与动作坞（7）不在这里：它们钉在滚动区之外，由 Frame 直接渲染。
 */
export const NODE_DETAIL_SCROLL_SLOT_ORDER = [
  NODE_DETAIL_SLOT_IDS.desk,
  NODE_DETAIL_SLOT_IDS.rack,
  NODE_DETAIL_SLOT_IDS.relations,
  NODE_DETAIL_SLOT_IDS.evidence,
] as const

export type NodeDetailScrollSlotId =
  (typeof NODE_DETAIL_SCROLL_SLOT_ORDER)[number]
