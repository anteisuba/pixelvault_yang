/**
 * 画布域的对外入口（客户端）。域外只从这里引，⛔ 直引域内文件
 *（见 docs/design/features-migration.md）。
 */
export { type NodeV4MediaPatch } from './components/nodes/v4/NodeV4Context'
export { NodeCardShell } from './components/nodes/v4/chrome/NodeCardShell'
export { NodeFrameProgress } from './components/nodes/v4/chrome/NodeFrameProgress'
export { ImageSearchGroundingSide } from './components/nodes/v4/image/ImageSearchGroundingSide'
export { NodeWorkbenchV4 } from './components/workbench-v4/NodeWorkbenchV4'
