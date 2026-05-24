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

export const NODE_STUDIO_WORKFLOW_STORAGE = {
  key: 'pixelvault.nodeStudio.v3',
  debounceMs: 400,
  version: 1,
} as const

export const NODE_STUDIO_REFERENCE_ROLES = [
  'identity',
  'pose',
  'style',
  'composition',
  'background',
] as const

export const NODE_STUDIO_REFERENCE_SOURCES = ['upload', 'asset'] as const

export const NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS = {
  generated: 'generated',
  existing: 'existing',
} as const

export const NODE_STUDIO_IMAGE_OUTPUT_SOURCES = [
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
] as const

export const NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS = {
  choice: 'choice',
  ai: 'ai',
  existing: 'existing',
} as const

export const NODE_STUDIO_CHARACTER_IMAGE_MODES = [
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.choice,
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.ai,
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.existing,
] as const

export const NODE_STUDIO_CHARACTER_IMAGE_REFERENCES = {
  maxItems: 3,
  defaultRole: 'identity',
  defaultWeight: 0.72,
  minWeight: 0,
  maxWeight: 1,
  weightStep: 0.05,
  uploadNote: 'Node Studio character reference',
} as const

export const NODE_STUDIO_CHARACTER_IMAGE_OUTPUT = {
  maxSourceLabelLength: 160,
} as const

export const NODE_STUDIO_CHARACTER_IMAGE_LORAS = {
  maxItems: 5,
  defaultScale: 1,
  minScale: 0.1,
  maxScale: 2,
  scaleStep: 0.05,
  customBaseFamily: 'custom',
} as const

export const NODE_STUDIO_NODE_PLACEMENT = {
  topbarAddPosition: {
    x: 96,
    y: 96,
  },
  menuOffset: {
    x: 16,
    y: 16,
  },
  characterSpawn: {
    offsetX: 420,
    offsetY: 260,
  },
} as const

export const NODE_STUDIO_ID_PREFIXES = {
  node: 'node',
  edge: 'edge',
} as const

export const NODE_STUDIO_EDGE_VISUALS = {
  type: 'smoothstep',
  color: 'var(--node-amber)',
  previewColor: 'color-mix(in oklab, var(--node-amber) 82%, white)',
  glowFilter:
    'drop-shadow(0 0 5px color-mix(in oklab, var(--node-amber) 45%, transparent))',
  strokeWidth: 3,
  previewStrokeWidth: 3.5,
  interactionWidth: 28,
  markerSize: 20,
  markerStrokeWidth: 1.8,
  previewDash: '9 7',
  markerEndType: 'arrowclosed',
} as const
