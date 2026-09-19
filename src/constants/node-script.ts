/**
 * 剧本节点与剧本投影的词表（进度表 24，画板 `DesignD7Script.dc.html`）。
 *
 * ── 为什么单开一个文件 ──────────────────────────────────────────────────
 * 剧本这件事横跨三层：拆镜是纯函数（`lib/node-script-shots.ts`）、投影是一条 op
 * （`project_script`）、卡面与镜头角标是渲染。三层共用的只有**这几组闭合枚举与
 * 上限**，塞进 `node-types.ts`（分类法）或 `node-studio.ts`（几何）都会让那两张
 * 表变成杂物间。
 *
 * ⛔ 这里只放**确定性拆镜**要用到的东西。「让 LLM 拆镜」是后话：它会换掉
 * `parseScriptShots` 的产出来源，但不会换掉下面这几组值域 —— 所以⛔ 不预先为它
 * 加开关字段。
 */

/**
 * 一面镜与剧本的关系（投影之后写在镜头节点的 `scriptShot.state` 上）。
 *
 * ⚠ 三档是**重投影 diff 的三种结局**，不是生成状态的一部分：一面镜完全可以同时
 * 是 `changed`（剧本改了）和已经出片（`status: done`）。挤进 `status` 会丢掉其中
 * 一个语义。
 */
export const NODE_SCRIPT_SHOT_STATE_IDS = {
  /** 节点文本与剧本里那一段一致。 */
  synced: 'synced',
  /**
   * 剧本里那一段改了。⛔ **不覆盖**节点上的内容——用户可能已经在这一镜上改过
   * 提示词、出过片；投影只把新文本摆在 `pendingText` 上并标一次「已变」。
   */
  changed: 'changed',
  /** 剧本里删掉了这一段。⛔ 节点不删，只标灰——上面可能挂着已经生成的产物。 */
  dropped: 'dropped',
} as const

export const NODE_SCRIPT_SHOT_STATES = [
  NODE_SCRIPT_SHOT_STATE_IDS.synced,
  NODE_SCRIPT_SHOT_STATE_IDS.changed,
  NODE_SCRIPT_SHOT_STATE_IDS.dropped,
] as const

export type NodeScriptShotState = (typeof NODE_SCRIPT_SHOT_STATES)[number]

/**
 * `project_script` 的两档。
 *
 * ⚠ 缺省是 `create`，且**投影过的剧本再 `create` 直接拒**（提示改用 `reproject`）：
 * 静默当成重投影会让「我只是想再建一排」和「我改了剧本要同步」长得一模一样，
 * 而这两件事的 inverse 收的不是同一批 id。
 */
export const NODE_SCRIPT_PROJECTION_MODE_IDS = {
  create: 'create',
  reproject: 'reproject',
} as const

export const NODE_SCRIPT_PROJECTION_MODES = [
  NODE_SCRIPT_PROJECTION_MODE_IDS.create,
  NODE_SCRIPT_PROJECTION_MODE_IDS.reproject,
] as const

export type NodeScriptProjectionMode =
  (typeof NODE_SCRIPT_PROJECTION_MODES)[number]

export const NODE_SCRIPT_PROJECTION = {
  /**
   * 一张剧本卡最多拆出几面镜。
   *
   * ⚠ 上限不是审美：一次投影就是一批节点 + 一批边落进项目 state，而整份 state
   * 有落库体积。⛔ 也不能超过 `shotNo` 的值域（1..999）。
   */
  maxShots: 99,
  /** 分镜行上那句话最多显示多少字（超出在卡上截断，正文一个字不动）。 */
  maxTitleChars: 80,
  /** 卡面分镜列表最多列几行，其余收成「+ N 镜…」。 */
  maxListRows: 4,
  /** 一面镜最多认几个 `@角色`（角色槽的空位数）。 */
  maxRolesPerShot: 8,
} as const
