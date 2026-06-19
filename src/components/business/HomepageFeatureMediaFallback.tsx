import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { HOMEPAGE_SHOWCASE } from '@/constants/homepage'

import { HomepageTtsPlayer } from './HomepageTtsPlayer'

interface HomepageFeatureMediaFallbackProps {
  id: string
}

const SHOWCASE = HOMEPAGE_SHOWCASE.map((s) => s.src)

/**
 * Real per-section assets generated for each feature section. When a section
 * has its own image set we use it; sections still listed as `[]` (tts /
 * workflow) intentionally rely on pure-SVG renderers below.
 */
const SECTION_ASSETS: Record<string, readonly string[]> = {
  video: [
    '/homepage/video/01.webp',
    '/homepage/video/02.webp',
    '/homepage/video/03.webp',
    '/homepage/video/04.webp',
  ],
  lora: [
    '/homepage/lora/01.png',
    '/homepage/lora/02.png',
    '/homepage/lora/03.png',
    '/homepage/lora/04.png',
  ],
  upscale: ['/homepage/upscale/01.png'],
  model3d: ['/homepage/model3d/01.png'],
  arena: [
    '/homepage/arena/01-flux.webp',
    '/homepage/arena/02-gpt.png',
    '/homepage/arena/03-gemini.jpeg',
  ],
  archive: [
    '/homepage/archive/portrait.webp',
    '/homepage/archive/landscape.webp',
    '/homepage/archive/animal.webp',
    '/homepage/archive/abstract.webp',
    '/homepage/archive/stilllife.webp',
    '/homepage/archive/concept.webp',
  ],
  social: [
    '/homepage/social/01.png',
    '/homepage/social/02.png',
    '/homepage/social/03.png',
  ],
}

function pick(section: string, index: number, fallbackIdx: number): string {
  const arr = SECTION_ASSETS[section]
  if (arr && arr[index]) return arr[index]
  return SHOWCASE[fallbackIdx % SHOWCASE.length]
}

export function HomepageFeatureMediaFallback({
  id,
}: HomepageFeatureMediaFallbackProps) {
  const t = useTranslations('Homepage.mediaLabels')

  switch (id) {
    case 'video':
      return <FallbackVideoStrip storyboardLabel={t('video.storyboard')} />
    case 'lora':
      return (
        <FallbackLoraSheet
          trainingSetLabel={t('lora.trainingSet')}
          modelLabel={t('lora.model')}
        />
      )
    case 'upscale':
      return (
        <FallbackUpscale
          beforeLabel={t('upscale.before')}
          afterLabel={t('upscale.after')}
          scaleLabel={t('upscale.scale')}
        />
      )
    case 'tts':
      return (
        <FallbackTts
          label={t('tts.label')}
          caption={t('tts.caption')}
          playLabel={t('tts.play')}
          pauseLabel={t('tts.pause')}
        />
      )
    case 'model3d':
      return <FallbackModel3d turntableLabel={t('model3d.turntable')} />
    case 'workflow':
      return (
        <FallbackWorkflow
          nodes={[
            t('workflow.imageNode'),
            t('workflow.upscaleNode'),
            t('workflow.videoNode'),
            t('workflow.deployNode'),
          ]}
          statusLabel={t('workflow.status')}
        />
      )
    case 'arena':
      return (
        <FallbackArena
          winnerLabel={t('arena.winner')}
          voteLabel={t('arena.vote')}
        />
      )
    case 'archive':
      return <FallbackArchive />
    case 'social':
      return <FallbackSocial />
    default:
      return null
  }
}

function FbImg({
  src,
  alt = '',
  className,
  sizes = '40vw',
  eager = false,
}: {
  src: string
  alt?: string
  className?: string
  sizes?: string
  eager?: boolean
}) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : 'auto'}
      className={`object-cover ${className ?? ''}`}
    />
  )
}

function FbLabel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={`absolute z-[2] rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-white backdrop-blur-sm ${className ?? ''}`}
    >
      {children}
    </span>
  )
}

interface FallbackVideoStripProps {
  storyboardLabel: string
}

function FallbackVideoStrip({ storyboardLabel }: FallbackVideoStripProps) {
  return (
    <div className="absolute inset-0 flex">
      {[0, 1, 2, 3].map((idx) => (
        <div key={idx} className="relative flex-1 overflow-hidden">
          <FbImg src={pick('video', idx, idx)} alt="" sizes="15vw" />
          <span className="absolute left-1.5 top-1.5 z-[2] rounded bg-black/65 px-1.5 py-0.5 font-mono text-[9px] text-white">
            {String(idx + 1).padStart(2, '0')}
          </span>
        </div>
      ))}
      <FbLabel className="bottom-3 right-3">{storyboardLabel}</FbLabel>
    </div>
  )
}

interface FallbackLoraSheetProps {
  trainingSetLabel: string
  modelLabel: string
}

function FallbackLoraSheet({
  trainingSetLabel,
  modelLabel,
}: FallbackLoraSheetProps) {
  return (
    <div className="absolute inset-0 grid grid-cols-2">
      {[0, 1, 2, 3].map((idx) => (
        <div key={idx} className="relative overflow-hidden">
          <FbImg src={pick('lora', idx, idx)} alt="" sizes="20vw" />
        </div>
      ))}
      <FbLabel className="left-3 top-3">{trainingSetLabel}</FbLabel>
      <FbLabel className="bottom-3 right-3">{modelLabel}</FbLabel>
    </div>
  )
}

interface FallbackUpscaleProps {
  beforeLabel: string
  afterLabel: string
  scaleLabel: string
}

function FallbackUpscale({
  beforeLabel,
  afterLabel,
  scaleLabel,
}: FallbackUpscaleProps) {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0">
        <FbImg src={pick('upscale', 0, 2)} alt="" />
      </div>
      <div
        className="absolute inset-0"
        style={{
          backdropFilter: 'blur(14px)',
          clipPath: 'polygon(0 0, 50% 0, 50% 100%, 0 100%)',
        }}
      />
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/70 mix-blend-overlay" />
      <FbLabel className="left-3 top-3">{beforeLabel}</FbLabel>
      <FbLabel className="right-3 top-3">{afterLabel}</FbLabel>
      <div className="absolute left-1/2 top-1/2 z-[2] flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-black/30 backdrop-blur-sm">
        <span className="font-mono text-[10px] text-white">{scaleLabel}</span>
      </div>
    </div>
  )
}

interface FallbackTtsProps {
  label: string
  caption: string
  playLabel: string
  pauseLabel: string
}

function FallbackTts({
  label,
  caption,
  playLabel,
  pauseLabel,
}: FallbackTtsProps) {
  return (
    <HomepageTtsPlayer
      label={label}
      caption={caption}
      playLabel={playLabel}
      pauseLabel={pauseLabel}
    />
  )
}

interface FallbackModel3dProps {
  turntableLabel: string
}

function FallbackModel3d({ turntableLabel }: FallbackModel3dProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="absolute inset-0 overflow-hidden">
        <FbImg src={pick('model3d', 0, 1)} alt="" />
      </div>
      <svg
        viewBox="0 0 200 200"
        className="relative z-[2] h-56 w-56 opacity-90"
        aria-hidden="true"
      >
        <ellipse
          cx="100"
          cy="160"
          rx="70"
          ry="14"
          fill="none"
          stroke="white"
          strokeOpacity="0.55"
          strokeDasharray="3 4"
        />
        <ellipse
          cx="100"
          cy="160"
          rx="40"
          ry="8"
          fill="none"
          stroke="white"
          strokeOpacity="0.35"
          strokeDasharray="2 3"
        />
      </svg>
      <FbLabel className="bottom-3 right-3">{turntableLabel}</FbLabel>
    </div>
  )
}

interface FallbackWorkflowProps {
  nodes: readonly [string, string, string, string]
  statusLabel: string
}

function FallbackWorkflow({ nodes, statusLabel }: FallbackWorkflowProps) {
  const workflowNodes = [
    { x: 40, y: 70, label: nodes[0] },
    { x: 250, y: 40, label: nodes[1] },
    { x: 250, y: 140, label: nodes[2] },
    { x: 460, y: 100, label: nodes[3] },
  ] as const

  return (
    <div className="absolute inset-0 p-6">
      <svg viewBox="0 0 600 320" className="h-full w-full" aria-hidden="true">
        <defs>
          <pattern
            id="wf-grid"
            x="0"
            y="0"
            width="28"
            height="28"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 28 0 L 0 0 0 28"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-white/10"
            />
          </pattern>
        </defs>
        <rect width="600" height="320" fill="url(#wf-grid)" />
        {workflowNodes.map((n, i) => (
          <g key={i}>
            <rect
              x={n.x}
              y={n.y}
              width={110}
              height={44}
              rx={8}
              fill="rgba(255,255,255,0.08)"
              stroke="rgba(255,255,255,0.4)"
            />
            <text
              x={n.x + 10}
              y={n.y + 27}
              fill="white"
              fontSize="11"
              fontFamily="ui-monospace, monospace"
            >
              {n.label}
            </text>
          </g>
        ))}
        <path
          d="M 150 92 C 200 92, 200 62, 250 62"
          fill="none"
          stroke="white"
          strokeOpacity="0.55"
          strokeWidth="1.5"
        />
        <path
          d="M 150 92 C 200 92, 200 162, 250 162"
          fill="none"
          stroke="white"
          strokeOpacity="0.55"
          strokeWidth="1.5"
        />
        <path
          d="M 360 62 C 410 62, 410 122, 460 122"
          fill="none"
          stroke="white"
          strokeOpacity="0.7"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <path
          d="M 360 162 C 410 162, 410 122, 460 122"
          fill="none"
          stroke="white"
          strokeOpacity="0.7"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <circle cx="460" cy="122" r="6" fill="rgb(34,197,94)" />
      </svg>
      <FbLabel className="bottom-4 right-4">{statusLabel}</FbLabel>
    </div>
  )
}

interface FallbackArenaProps {
  winnerLabel: string
  voteLabel: string
}

function FallbackArena({ winnerLabel, voteLabel }: FallbackArenaProps) {
  const models = ['Flux', 'GPT-Image', 'Gemini']
  const winnerIdx = 1
  return (
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
      {[0, 1, 2].map((idx) => {
        const winner = idx === winnerIdx
        return (
          <div
            key={idx}
            className={`relative overflow-hidden ${
              winner ? 'ring-2 ring-inset ring-amber-300' : 'opacity-80'
            }`}
          >
            <FbImg src={pick('arena', idx, idx)} alt="" sizes="20vw" />
            <span className="absolute right-2 top-2 z-[2] rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-white/85">
              {models[idx]}
            </span>
            {winner && (
              <span className="absolute left-2 top-2 z-[2] rounded bg-amber-300 px-2 py-0.5 font-mono text-[10px] font-bold text-black">
                ELO 1547 · {winnerLabel}
              </span>
            )}
          </div>
        )
      })}
      <div className="relative flex flex-col items-center justify-center gap-1 border border-dashed border-white/25 bg-white/[0.03] text-white/70">
        <span className="font-mono text-[28px] leading-none">+</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
          {voteLabel}
        </span>
      </div>
    </div>
  )
}

function FallbackArchive() {
  return (
    <div className="absolute inset-0 grid grid-cols-3 grid-rows-2">
      {[0, 1, 2, 3, 4, 5].map((idx) => (
        <div
          key={idx}
          className="relative overflow-hidden"
          style={{ filter: 'grayscale(0.55) brightness(0.9)' }}
        >
          <FbImg src={pick('archive', idx, idx)} alt="" sizes="14vw" />
        </div>
      ))}
      <div className="absolute inset-x-0 bottom-3 z-[2] flex items-center justify-between px-4 font-mono text-[10px] text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
        <span>2024</span>
        <div className="mx-3 h-px flex-1 bg-white/40" />
        <span>2025</span>
        <div className="mx-3 h-px flex-1 bg-white/40" />
        <span>2026</span>
      </div>
    </div>
  )
}

function FallbackSocial() {
  const handles = ['@maya', '@yang', '@kai']
  const likes = [184, 248, 96]
  return (
    <div className="absolute inset-0 grid grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="relative overflow-hidden">
          <FbImg src={pick('social', i, i + 1)} alt="" sizes="20vw" />
          <div className="absolute inset-x-2 bottom-2 z-[2] flex items-center gap-1.5 rounded-lg bg-black/55 px-2 py-1 backdrop-blur-sm">
            <span className="block h-5 w-5 rounded-full bg-white/30" />
            <span className="font-mono text-[10px] text-white/90">
              {handles[i]}
            </span>
            <span className="ml-auto font-mono text-[10px] text-white/80">
              ♥ {likes[i]}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
