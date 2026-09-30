import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  CircleIcon,
  Flag,
  Heart,
  type Icon,
  Pin,
  Play,
  Sparkles,
  Star,
} from '@/components/icons'

// 实心靠 weight="fill"；`fill-current` 在 Phosphor 的轮廓字形上画不出区别。
describe('Phosphor solid state', () => {
  it.each<[string, Icon]>([
    ['CircleIcon', CircleIcon],
    ['Flag', Flag],
    ['Heart', Heart],
    ['Pin', Pin],
    ['Play', Play],
    ['Sparkles', Sparkles],
    ['Star', Star],
  ])('%s: weight fill draws a different glyph from bold', (_, Glyph) => {
    const markup = (weight: 'fill' | 'bold') =>
      render(<Glyph weight={weight} />).container.querySelector('svg')!
        .innerHTML
    expect(markup('fill')).not.toBe(markup('bold'))
  })
})
