import Image from 'next/image'

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
  imageEditing: [
    '/homepage/imageEditing/01-original.webp',
    '/homepage/imageEditing/02-ghibli.webp',
    '/homepage/imageEditing/03-oil.webp',
    '/homepage/imageEditing/04-watercolor.webp',
  ],
  video: [
    '/homepage/video/01.png',
    '/homepage/video/02.png',
    '/homepage/video/03.png',
    '/homepage/video/04.png',
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
  switch (id) {
    case 'imageEditing':
      return <FallbackImageEditing />
    case 'video':
      return <FallbackVideoStrip />
    case 'lora':
      return <FallbackLoraSheet />
    case 'upscale':
      return <FallbackUpscale />
    case 'tts':
      return <FallbackTts />
    case 'model3d':
      return <FallbackModel3d />
    case 'workflow':
      return <FallbackWorkflow />
    case 'arena':
      return <FallbackArena />
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
}: {
  src: string
  alt?: string
  className?: string
  sizes?: string
}) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
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

function FallbackImageEditing() {
  const labels = ['吉卜力', '油画', '水彩']
  return (
    <div className="absolute inset-0 grid grid-cols-2">
      <div className="relative overflow-hidden">
        <FbImg src={pick('imageEditing', 0, 0)} alt="" />
        <FbLabel className="left-3 top-3">原图</FbLabel>
      </div>
      <div className="grid grid-rows-3">
        {[1, 2, 3].map((idx, i) => (
          <div key={idx} className="relative overflow-hidden">
            <FbImg src={pick('imageEditing', idx, idx)} alt="" sizes="20vw" />
            <FbLabel className="left-2 top-2">{labels[i]}</FbLabel>
          </div>
        ))}
      </div>
    </div>
  )
}

function FallbackVideoStrip() {
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
      <FbLabel className="bottom-3 right-3">storyboard · 4f</FbLabel>
    </div>
  )
}

function FallbackLoraSheet() {
  return (
    <div className="absolute inset-0 grid grid-cols-2">
      {[0, 1, 2, 3].map((idx) => (
        <div key={idx} className="relative overflow-hidden">
          <FbImg src={pick('lora', idx, idx)} alt="" sizes="20vw" />
        </div>
      ))}
      <FbLabel className="left-3 top-3">训练集 · 4 张</FbLabel>
      <FbLabel className="bottom-3 right-3">LoRA · v1.2</FbLabel>
    </div>
  )
}

function FallbackUpscale() {
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
      <FbLabel className="left-3 top-3">512px</FbLabel>
      <FbLabel className="right-3 top-3">2048px · 4×</FbLabel>
      <div className="absolute left-1/2 top-1/2 z-[2] flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-black/30 backdrop-blur-sm">
        <span className="font-mono text-[10px] text-white">4×</span>
      </div>
    </div>
  )
}

function FallbackTts() {
  return <HomepageTtsPlayer />
}

function FallbackModel3d() {
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
      <FbLabel className="bottom-3 right-3">turntable · 360°</FbLabel>
    </div>
  )
}

function FallbackWorkflow() {
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
        {/* nodes */}
        {[
          { x: 40, y: 70, label: 'image · flux' },
          { x: 250, y: 40, label: 'upscale · 4×' },
          { x: 250, y: 140, label: 'i2v · veo3' },
          { x: 460, y: 100, label: 'deploy →' },
        ].map((n, i) => (
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
        {/* edges */}
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
      <FbLabel className="bottom-4 right-4">即将上线</FbLabel>
    </div>
  )
}

function FallbackArena() {
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
                ELO 1547 · WIN
              </span>
            )}
          </div>
        )
      })}
      <div className="relative flex flex-col items-center justify-center gap-1 border border-dashed border-white/25 bg-white/[0.03] text-white/70">
        <span className="font-mono text-[28px] leading-none">+</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
          Cast your vote
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
