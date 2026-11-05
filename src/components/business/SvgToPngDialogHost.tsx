'use client'

import { useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'

import { useSvgToPng } from '@/hooks/use-svg-to-png'
import {
  getSvgToPngRequest,
  settleSvgToPngRequest,
  subscribeSvgToPngRequest,
  type SvgToPngRequest,
} from '@/lib/svg-to-png-request'
import {
  SVG_TO_PNG_DEFAULT_LONG_EDGE,
  SVG_TO_PNG_LONG_EDGES,
  type SvgToPngLongEdge,
} from '@/lib/svg-to-png'
import { Button } from '@/components/ui/button'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'

type LongEdgeValue = `${SvgToPngLongEdge}`

const DEFAULT_EDGE = String(SVG_TO_PNG_DEFAULT_LONG_EDGE) as LongEdgeValue

const LONG_EDGE_ITEMS = SVG_TO_PNG_LONG_EDGES.map((edge) => ({
  value: String(edge) as LongEdgeValue,
  label: String(edge),
}))

/**
 * 全站唯一的「转 PNG」弹窗（挂在 `(main)/layout`）。两种来路共用：
 * 结果卡的「转 PNG」键，与拿 SVG 当输入时的拦截（`lib/svg-to-png-request.ts`）。
 * 长边三档，默认 2048；转好的 PNG 存成一张新作品，SVG 原件不动。
 */
export function SvgToPngDialogHost() {
  const t = useTranslations('SvgToPng')
  const request = useSyncExternalStore(
    subscribeSvgToPngRequest,
    getSvgToPngRequest,
    () => null,
  )
  const { convert, convertGifFirstFrame, convertingId } = useSvgToPng()
  // 档位记在「哪一条请求」名下：来了新请求就回到默认（上一张选 4096 不该粘到
  // 下一张），⛔ 用 effect 去重置。
  const [choice, setChoice] = useState<{
    request: SvgToPngRequest | null
    edge: LongEdgeValue
  }>({ request: null, edge: DEFAULT_EDGE })
  const longEdge = choice.request === request ? choice.edge : DEFAULT_EDGE
  const setLongEdge = (edge: LongEdgeValue) => setChoice({ request, edge })
  const busy = convertingId !== null

  const gate = request?.mode === 'gate'
  // GIF 只有「取第一帧」一种做法，原尺寸，不给长边档。
  const gif = request?.kind === 'gif'

  const handleConfirm = async () => {
    if (!request) return
    const source = { url: request.url, id: request.id }
    const png = gif
      ? await convertGifFirstFrame(source)
      : await convert(source, Number(longEdge) as SvgToPngLongEdge)
    // 失败已经 toast 过；弹窗留着，用户可以换一档重试或取消。
    if (png) settleSvgToPngRequest(png)
  }

  return (
    <ResponsiveDialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open && !busy) settleSvgToPngRequest(null)
      }}
    >
      <ResponsiveDialogContent
        className="sm:max-w-sm"
        data-testid="svg-to-png-dialog"
      >
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {gif
              ? t('gifGateTitle')
              : gate
                ? t('gateTitle')
                : t('convertTitle')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {gif ? t('gifGateBody') : gate ? t('gateBody') : t('convertBody')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {gif ? null : (
          <div className="flex items-center justify-between gap-3 py-2">
            <span className="text-2sm text-muted-foreground">
              {t('sizeHint')}
            </span>
            <LiquidSegmented
              items={LONG_EDGE_ITEMS}
              value={longEdge}
              onChange={setLongEdge}
              ariaLabel={t('sizeHint')}
              semantics="radio"
              size="sm"
              disabled={busy}
            />
          </div>
        )}

        <ResponsiveDialogFooter>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => settleSvgToPngRequest(null)}
          >
            {t('gateCancel')}
          </Button>
          <Button disabled={busy} onClick={() => void handleConfirm()}>
            {busy
              ? gif
                ? t('gifConverting')
                : t('converting')
              : gif
                ? t('gifGateConfirm')
                : gate
                  ? t('gateConfirm')
                  : t('action')}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
