import Image from 'next/image'
import { useTranslations } from 'next-intl'

import {
  HOME_V3_CANVAS_BOX,
  HOME_V3_CANVAS_EDGES,
  HOME_V3_CANVAS_NODES,
  HOME_V3_SHOTS,
  HOME_V3_WAVE_BARS,
} from '@/constants/home-v3'

const { width: BOX_W, height: BOX_H, portY: PORT_Y } = HOME_V3_CANVAS_BOX

const nodeById = (id: string) =>
  HOME_V3_CANVAS_NODES.find((node) => node.id === id)

/**
 * Edges are drawn between node *left* edges rather than between ports. The card
 * is opaque, so the run underneath it is hidden and the line appears to leave at
 * the right port — which keeps the geometry exact even though card width is a
 * percentage while the svg stretches.
 */
function edgePath(fromId: string, toId: string) {
  const from = nodeById(fromId)
  const to = nodeById(toId)
  if (!from || !to) return ''

  const x1 = from.x
  const y1 = from.y + PORT_Y
  const x2 = to.x
  const y2 = to.y + PORT_Y
  const dx = Math.max(60, (x2 - x1) * 0.45)

  return `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`
}

const MINIMAP_BLOCKS = [
  { left: 7, top: 28, width: 14 },
  { left: 30, top: 10, width: 14 },
  { left: 30, top: 28, width: 14 },
  { left: 30, top: 46, width: 14 },
  { left: 58, top: 19, width: 14, active: true },
  { left: 86, top: 33, width: 16 },
] as const

export function HomeV3ViewCanvas() {
  const t = useTranslations('Homepage.canvasView')

  return (
    <>
      <div className="home-v3-canvas">
        <svg
          viewBox={`0 0 ${BOX_W} ${BOX_H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {HOME_V3_CANVAS_EDGES.map(([from, to, active]) => (
            <path
              key={`${from}-${to}`}
              d={edgePath(from, to)}
              data-active={active}
            />
          ))}
        </svg>

        {HOME_V3_CANVAS_NODES.map((node) => (
          <div
            className="home-v3-node"
            key={node.id}
            data-selected={'selected' in node ? node.selected : undefined}
            data-running={'running' in node ? node.running : undefined}
            style={{
              left: `${((node.x / BOX_W) * 100).toFixed(3)}%`,
              top: `${((node.y / BOX_H) * 100).toFixed(3)}%`,
            }}
          >
            <div className="home-v3-node-head">
              <span>{t(`nodes.${node.id}`)}</span>
              <em>{node.model}</em>
            </div>

            {node.kind === 'image' && 'shot' in node ? (
              <div className="home-v3-node-body">
                <Image src={node.shot} alt="" width={200} height={150} />
              </div>
            ) : null}

            {node.kind === 'wave' ? (
              <div className="home-v3-node-body">
                <div className="home-v3-wave">
                  {HOME_V3_WAVE_BARS.map((height, index) => (
                    <span key={index} style={{ height: `${height}%` }} />
                  ))}
                </div>
              </div>
            ) : null}

            {node.kind === 'text' ? (
              <p className="home-v3-node-text">{t('script')}</p>
            ) : null}

            {'running' in node && node.running ? (
              <div className="home-v3-node-bar">
                <i style={{ width: '62%' }} />
              </div>
            ) : null}

            <div className="home-v3-node-status">
              <span>{t(`nodeStatus.${node.id}.state`)}</span>
              <span>{t(`nodeStatus.${node.id}.detail`)}</span>
            </div>

            <span className="home-v3-port" data-side="in" />
            <span className="home-v3-port" data-side="out" />
          </div>
        ))}

        <div className="home-v3-minimap" aria-hidden="true">
          {MINIMAP_BLOCKS.map((block, index) => (
            <b
              key={index}
              data-active={'active' in block ? block.active : undefined}
              style={{
                left: `${block.left}px`,
                top: `${block.top}px`,
                width: `${block.width}px`,
                height: '8px',
              }}
            />
          ))}
        </div>
      </div>

      <div className="home-v3-inspector">
        <h4>{t('inspector.title')}</h4>
        <div className="home-v3-row">
          <span>{t('inspector.rowModel')}</span>
          <b>Seedream 5.0 Pro</b>
        </div>
        <div className="home-v3-row">
          <span>{t('inspector.rowSize')}</span>
          <b>1536 × 864</b>
        </div>
        <div className="home-v3-row">
          <span>{t('inspector.rowSeed')}</span>
          <b>8841</b>
        </div>
        <p className="home-v3-sublabel">PROMPT</p>
        <p className="home-v3-prompt">{t('inspector.prompt')}</p>
        <p className="home-v3-sublabel">{t('inspector.refs')}</p>
        <div className="home-v3-refs">
          <Image src={HOME_V3_SHOTS.portrait} alt="" width={120} height={120} />
          <Image src={HOME_V3_SHOTS.concept} alt="" width={120} height={120} />
        </div>
        <button type="button" className="home-v3-action">
          {t('inspector.regenerate')}
        </button>
      </div>
    </>
  )
}
