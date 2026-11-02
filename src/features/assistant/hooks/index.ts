/**
 * assistant 域的对外入口 —— 客户端 hook（只要 hook 时走这里，不会把组件一起加载）
 *（见 docs/design/features-migration.md）。
 */
export { useAskAssistantAboutImage } from './use-ask-assistant-about-image'
export {
  useHandMentionToAssistant,
  useHandToAssistant,
} from './use-hand-to-assistant'
export { useHomeDraftOperatorHost } from './use-home-draft-operator-host'
export { useHomeOperatorHost } from './use-home-operator-host'
export { useOperatorUserUrlMount } from './use-operator-user-url-mount'
export {
  getOperatorVoicePrefs,
  playOperatorVoice,
  stopOperatorVoice,
  useOperatorVoice,
  usePlayingOperatorVoice,
  waitForAudioJob,
} from './use-operator-voice'
export {
  type StudioOperatorActions,
  useStudioOperatorActions,
} from './use-studio-operator-actions'
export { useStudioOperatorFace } from './use-studio-operator-face'
export {
  studioOperatorYield,
  useStudioOperatorYield,
} from './use-studio-operator-yield'
export { useStudioWorkbenchOperatorHost } from './use-studio-workbench-operator-host'
