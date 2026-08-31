/**
 * 工作台助手 · 操作员化面板（P2）。
 *
 * 对外只有两颗：**外壳**（`StudioWorkspaceUI` 挂）与**归属标记 rail**
 * （`StudioPromptArea` 挂）。其余组件是面板内部件，不从这里导出 —— 让宿主只
 * 认识两个入口，接线面就只有两处。
 */

export { StudioOperatorChangeRail } from '@/components/business/studio/assistant-operator/StudioOperatorChangeRail'
export { StudioOperatorDock } from '@/components/business/studio/assistant-operator/StudioOperatorDock'
