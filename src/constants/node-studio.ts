export const NODE_STUDIO_CANVAS = {
  defaultViewport: {
    x: 0,
    y: 0,
    zoom: 0.8,
  },
  background: {
    gap: 28,
    size: 1,
    color: 'rgba(244,241,234,0.12)',
  },
  defaultZoomPercent: 80,
} as const

export const NODE_STUDIO_REACT_FLOW_PRO_OPTIONS = {
  hideAttribution: true,
} as const

export const NODE_STUDIO_PLACEHOLDER_TOAST = {
  durationMs: 1600,
  position: 'bottom-right',
} as const

export const NODE_STUDIO_TOOL_MODES = [
  'pointer',
  'hand',
  'connect',
  'cut',
] as const

export type NodeStudioToolMode = (typeof NODE_STUDIO_TOOL_MODES)[number]
