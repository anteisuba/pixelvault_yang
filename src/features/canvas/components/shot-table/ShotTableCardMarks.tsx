'use client'

/**
 * 表坐上画布时素材卡身上的两样（H2b，`canvas-shotlist.md` 第 26 条 ④ / mock ③）：
 * - 右下角墨色胶囊「N 镜」（配音卡也有；0 镜不显示）；
 * - 正压在表上时，卡下面一行墨底提示「松手 = 加进全片素材」。
 *
 * 单独一个文件：卡壳四类卡共用、被很多单测直接渲染，⛔ 卡壳自己不拿文案 —— 只有真要画
 * 的时候这里才挂上（单测里没有 provider，两样都是 0 / false，不挂）。
 */

import { useTranslations } from 'next-intl'

export function ShotTableCardMarks({
  shotCount,
  dropping,
  zoom,
}: {
  readonly shotCount: number
  readonly dropping: boolean
  readonly zoom: number
}) {
  if (shotCount <= 0 && !dropping) return null
  return <Marks shotCount={shotCount} dropping={dropping} zoom={zoom} />
}

function Marks({
  shotCount,
  dropping,
  zoom,
}: {
  readonly shotCount: number
  readonly dropping: boolean
  readonly zoom: number
}) {
  const t = useTranslations('StudioNode.shotTable.canvas')
  const scale = zoom > 0 ? zoom : 1
  return (
    <>
      {shotCount > 0 ? (
        <span
          data-testid="shot-table-card-count"
          className="pointer-events-none absolute right-1.5 bottom-1.5 inline-flex h-5 items-center rounded-full bg-foreground px-2 text-2xs font-semibold tabular-nums text-background"
        >
          {t('shotCount', { count: shotCount })}
        </span>
      ) : null}
      {dropping ? (
        <span
          data-testid="shot-table-drop-hint"
          className="pointer-events-none absolute top-full left-0 mt-2 whitespace-nowrap rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background"
          // 提示跟着屏幕走、不跟画布缩放（与卡名同一个做法）。
          style={{
            transform: `scale(${1 / scale})`,
            transformOrigin: 'top left',
          }}
        >
          {t('dropHint')}
        </span>
      ) : null}
    </>
  )
}
