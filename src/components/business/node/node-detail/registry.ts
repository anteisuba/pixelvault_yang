import {
  NODE_TYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import type { NodeDetailSlotProvider } from './slots'
import { BackgroundDetailBody } from './BackgroundDetailBody'
import { CharacterDetailBody } from './CharacterDetailBody'
import { FrameDetailBody } from './FrameDetailBody'
import { LooseImageDetailBody } from './LooseImageDetailBody'
import { ShotTextDetailBody } from './ShotTextDetailBody'
import { ShotDetailBody } from './ShotDetailBody'
import { VideoDetailBody } from './VideoDetailBody'
import { VideoMergeDetailBody } from './VideoMergeDetailBody'
import { VideoReferenceDetailBody } from './VideoReferenceDetailBody'
import { VoiceDetailBody } from './VoiceDetailBody'

export interface NodeDetailBodyProps {
  nodeId: string
  type: NodeWorkflowNodeType
  data: NodeWorkflowNodeData
}

/**
 * 详情面板可呈现的族。
 *
 * ⚠ `composer` / `agent` 排除在外：它们是已退役的旧 planner，enum 值必须留着
 * （存量项目里还有这类节点，删了会让整份 state parse 失败 —— 见
 * `node-types.ts` 那段长注释），但两条水化路径都会在渲染前把它们剥掉，
 * **详情面板永远够不着它们**。给它们编一个 body 只会是死代码。
 */
export type NodeDetailFamily = Exclude<
  NodeWorkflowNodeType,
  typeof NODE_TYPE_IDS.composer | typeof NODE_TYPE_IDS.agent
>

/**
 * 族 → 七槽提供者。**穷举**（S8，2026-08-04）。
 *
 * ⚠ 类型是 `Record<NodeDetailFamily, …>` 而不是 `Partial<…>`，这是整轮改版
 * 唯一一条把契约立进编译器的地方：新增一个族却忘了给它槽表，**编译就过不去**，
 * 而不是线上打开面板发现关系带整族缺席。
 *
 * 这条闸门是有前科的：原型阶段 `rRelations()` 对散图族写过 `return ''`，
 * 把关系带整族抹掉，而其余四族都留了一行 —— 同一条规则在新旧族上分岔，
 * 谁都没报错。类型层堵第一道，`slots.ts` 的 `relations`/`evidence` 必填堵第二道，
 * 每族一条 DOM 序断言堵第三道。
 *
 * ⚠ 迁移期那张 `NODE_DETAIL_REGISTRY` 与 `GenericDetailBody` 已随本片删除。
 * 别把「兜底 body」加回来：兜底的代价是新族静默落进一个谁也没设计过的面板，
 * 而那正是这轮改版开头查出来的病（shotText 曾落 `GenericDetailBody`，
 * 结果那个面板**从画布上根本够不着**，四个字段既看不到也改不了）。
 */
export const NODE_DETAIL_SLOT_REGISTRY: Record<
  NodeDetailFamily,
  NodeDetailSlotProvider
> = {
  // S3（2026-08-04）：十族里第一个迁到七槽的。
  [NODE_TYPE_IDS.shotText]: ShotTextDetailBody,
  // S4：图片五族。前四族共用 `ImageFamilyBody`，角色族因为七槽里只有身份条
  // 与它们同构而自成一份（见该文件头注）。
  [NODE_TYPE_IDS.image]: LooseImageDetailBody,
  [NODE_TYPE_IDS.shot]: ShotDetailBody,
  [NODE_TYPE_IDS.frameImage]: FrameDetailBody,
  [NODE_TYPE_IDS.backgroundImage]: BackgroundDetailBody,
  [NODE_TYPE_IDS.characterImage]: CharacterDetailBody,
  // S5：音色族。
  [NODE_TYPE_IDS.voice]: VoiceDetailBody,
  // S6：视频合并 + 参考视频（参数一颗按钮的试验场）。
  [NODE_TYPE_IDS.videoMerge]: VideoMergeDetailBody,
  [NODE_TYPE_IDS.videoReference]: VideoReferenceDetailBody,
  // S7：最重的一族。内容仍住在 `VideoComposer` 里，那里只做了重排。
  [NODE_TYPE_IDS.seedance]: VideoDetailBody,
}

/**
 * `presentationType` 是否是一个详情面板认识的族。
 *
 * ⚠ 存在的理由不是「防 composer/agent」——那两个类型在渲染前就被剥掉了。
 * 是因为 `presentationType` 最终来自**持久化数据**：一个来自未来版本、
 * 本地枚举还不认识的 type 应当让面板不开，而不是把 `undefined` 当组件渲染。
 */
export function isNodeDetailFamily(
  type: NodeWorkflowNodeType,
): type is NodeDetailFamily {
  return type in NODE_DETAIL_SLOT_REGISTRY
}
