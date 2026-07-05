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
  // Storyboard frames — 4 distinct, bright showcase shots so the strip reads
  // as varied cinematic frames instead of one dark blur. The original
  // /homepage/video/0X.webp stills were too dark + too similar; drop real
  // bright video stills back in there and re-point here when available.
  video: [
    '/showcase/showcase-05.webp',
    '/showcase/showcase-06.webp',
    '/showcase/showcase-07.webp',
    '/showcase/showcase-08.webp',
  ],
  lora: [
    '/homepage/lora/01.png',
    '/homepage/lora/02.png',
    '/homepage/lora/03.png',
    '/homepage/lora/04.png',
  ],
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
    case 'image':
      return <FallbackImage />
    case 'video':
      return <FallbackVideoStrip />
    case 'lora':
      return (
        <FallbackLoraSheet
          trainingSetLabel={t('lora.trainingSet')}
          modelLabel={t('lora.model')}
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
      return <FallbackModel3d />
    case 'workflow':
      return (
        <FallbackWorkflow
          nodes={[
            t('workflow.imageNode'),
            t('workflow.upscaleNode'),
            t('workflow.videoNode'),
            t('workflow.deployNode'),
          ]}
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

/**
 * Film strip — four real frames side by side; a light sweeps across them in
 * sequence (one frame at a time brightens) so the strip reads as frames of a
 * moving picture, not a fake player. Motion lives in homepage.css
 * (.homepage-film-frame), reduced-motion collapses to all-bright static.
 */
function FallbackVideoStrip() {
  return (
    <div className="homepage-film-strip absolute inset-0">
      {[0, 1, 2, 3].map((idx) => (
        <div
          key={idx}
          className="homepage-film-frame"
          style={{ '--film-index': idx } as React.CSSProperties}
        >
          <FbImg src={pick('video', idx, 4 + idx)} alt="" sizes="20vw" />
        </div>
      ))}
    </div>
  )
}

interface FallbackLoraSheetProps {
  trainingSetLabel: string
  modelLabel: string
}

/**
 * Reference sheet → result: three small reference thumbs stacked left, one
 * large output right, so the "lock a character, keep the look" story is told
 * by the layout itself. The two labels carry real semantics (which images are
 * input vs output) and stay.
 */
function FallbackLoraSheet({
  trainingSetLabel,
  modelLabel,
}: FallbackLoraSheetProps) {
  return (
    <div className="absolute inset-0 flex gap-2 p-2">
      <div className="relative grid w-[34%] shrink-0 grid-rows-3 gap-2">
        {[0, 1, 2].map((idx) => (
          <div key={idx} className="relative overflow-hidden rounded-lg">
            <FbImg src={pick('lora', idx, idx)} alt="" sizes="14vw" />
          </div>
        ))}
        <FbLabel className="left-2 top-2">{trainingSetLabel}</FbLabel>
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-lg">
        <FbImg src={pick('lora', 3, 3)} alt="" sizes="26vw" />
        <FbLabel className="bottom-3 right-3">{modelLabel}</FbLabel>
      </div>
    </div>
  )
}

/**
 * Flagship 图片生成 tile: the same idea rendered by several models, each cell
 * chipped with its model name — the BYOK multi-model compare in one glance.
 * The model chips are real semantics (which model made which) and stay; the
 * old "side by side" corner label was redundant with the section title.
 */
function FallbackImage() {
  return (
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-2 p-2">
      {HOMEPAGE_SHOWCASE.slice(0, 4).map((shot) => (
        <div key={shot.id} className="relative overflow-hidden rounded-lg">
          <FbImg src={shot.src} alt="" sizes="20vw" />
          <span className="absolute left-2 top-2 z-[2] rounded-full bg-black/55 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-white/85">
            {shot.model}
          </span>
        </div>
      ))}
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

function FallbackModel3d() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="absolute inset-0 overflow-hidden">
        <FbImg src={pick('model3d', 0, 1)} alt="" />
      </div>
      <div className="absolute inset-x-0 bottom-0 z-[1] h-1/2 bg-gradient-to-t from-black/55 to-transparent" />
      <svg
        viewBox="0 0 200 200"
        className="relative z-[2] h-56 w-56 opacity-95"
        aria-hidden="true"
      >
        <ellipse
          cx="100"
          cy="160"
          rx="70"
          ry="14"
          fill="none"
          stroke="white"
          strokeOpacity="0.7"
          strokeWidth="1.5"
          strokeDasharray="3 4"
        />
        <ellipse
          cx="100"
          cy="160"
          rx="40"
          ry="8"
          fill="none"
          stroke="white"
          strokeOpacity="0.5"
          strokeWidth="1.5"
          strokeDasharray="2 3"
        />
      </svg>
    </div>
  )
}

interface FallbackWorkflowProps {
  nodes: readonly [string, string, string, string]
}

function FallbackWorkflow({ nodes }: FallbackWorkflowProps) {
  // 剧本 → (图像, 音频) → 视频 — the canvas autospawn shape, with real
  // generated media inside the visual nodes so it reads as produced work
  // rather than an abstract diagram. Connectors live on a 0–100 viewBox
  // stretched to fill, so their endpoints track the percentage-positioned
  // HTML nodes at any tile size.
  return (
    <div className="absolute inset-0">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <path
          className="homepage-canvas-wire"
          d="M16 50 C30 50 30 28 45 28"
          fill="none"
          stroke="rgba(255,255,255,0.32)"
          strokeWidth="0.6"
        />
        <path
          className="homepage-canvas-wire"
          d="M16 50 C30 50 30 72 45 72"
          fill="none"
          stroke="rgba(255,255,255,0.32)"
          strokeWidth="0.6"
        />
        <path
          className="homepage-canvas-wire"
          d="M45 28 C66 28 64 50 84 50"
          fill="none"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="0.6"
        />
        <path
          className="homepage-canvas-wire"
          d="M45 72 C66 72 64 50 84 50"
          fill="none"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="0.6"
        />
      </svg>

      <WorkflowNode left="16%" top="50%" label={nodes[0]}>
        <div className="flex h-full w-full flex-col justify-center gap-1.5 px-3">
          <span className="h-1 w-3/4 rounded-full bg-white/45" />
          <span className="h-1 w-full rounded-full bg-white/25" />
          <span className="h-1 w-2/3 rounded-full bg-white/25" />
        </div>
      </WorkflowNode>

      <WorkflowNode left="45%" top="28%" label={nodes[1]} media>
        <FbImg src={SHOWCASE[2]} alt="" sizes="12vw" />
      </WorkflowNode>

      <WorkflowNode left="45%" top="72%" label={nodes[2]}>
        <div className="flex h-full w-full items-center justify-center gap-[2px]">
          {Array.from({ length: 16 }, (_, i) =>
            Math.round(6 + 22 * Math.abs(Math.sin(i * 0.7))),
          ).map((h, i) => (
            <span
              key={i}
              className="w-[2px] rounded-full bg-white/70"
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
      </WorkflowNode>

      <WorkflowNode left="84%" top="50%" label={nodes[3]} media>
        <FbImg src={pick('video', 0, 4)} alt="" sizes="12vw" />
        <span className="absolute left-1/2 top-1/2 z-[2] flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
          <svg
            viewBox="0 0 24 24"
            className="h-3 w-3 fill-white"
            aria-hidden="true"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </WorkflowNode>
    </div>
  )
}

function WorkflowNode({
  left,
  top,
  label,
  media = false,
  children,
}: {
  left: string
  top: string
  label: string
  media?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
      style={{ left, top }}
    >
      <div
        className={`relative h-14 w-20 overflow-hidden rounded-xl border lg:h-24 lg:w-36 ${
          media ? 'border-white/25' : 'border-white/15 bg-white/[0.05]'
        }`}
      >
        {children}
      </div>
      <span className="font-mono text-[10px] tracking-wide text-white/70">
        {label}
      </span>
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
              winner ? 'ring-2 ring-inset ring-white/80' : 'opacity-80'
            }`}
          >
            <FbImg src={pick('arena', idx, idx)} alt="" sizes="20vw" />
            <span className="absolute right-2 top-2 z-[2] rounded-full bg-black/55 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-white/85">
              {models[idx]}
            </span>
            {winner && (
              <span className="absolute left-2 top-2 z-[2] rounded-full bg-white px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-black">
                {winnerLabel}
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
        <div key={idx} className="relative overflow-hidden">
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
