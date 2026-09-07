import type { CSSProperties } from 'react'

/**
 * 品牌标 —— 四颗错位的圆点。
 *
 * ⚠ 内部尺寸全部走**百分比**（gap 相对外框、位移相对每颗点自己），所以外框换成
 * 任何尺寸时排布不变 —— 助手预设头像那一款就是把它塞进圆形容器里缩放
 * （`AssistantAvatarGlyph`），⛔ 不再另抄一份几何。
 * 默认框 `1.5rem × 1.85rem` 与默认色 `--foreground` 是历史落点，别改。
 */

const DOT_TRANSFORMS = [
  'translateY(18.9%) rotate(-12deg)',
  'translateY(41.4%) rotate(12deg)',
  'translateY(-9.5%) rotate(12deg)',
  'translateY(-29.6%) rotate(-12deg)',
] as const

interface BrandMarkProps {
  className?: string
  /** 覆盖默认外框（头像档传百分比，让它跟着圆形容器走）。 */
  style?: CSSProperties
  /** 传 `currentColor` 可以让它继承上下文前景色（选中态要跟着变）。 */
  color?: string
}

export function BrandMark({
  className,
  style,
  color = 'var(--foreground)',
}: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: 'grid',
        width: '1.5rem',
        height: '1.85rem',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        columnGap: '10.6%',
        rowGap: '8.6%',
        ...style,
      }}
    >
      {DOT_TRANSFORMS.map((t, i) => (
        <span
          key={i}
          style={{
            borderRadius: '9999px',
            background: color,
            transform: t,
          }}
        />
      ))}
    </span>
  )
}
