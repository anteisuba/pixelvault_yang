import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
}))

import { ImageSendReadout } from './ImageSendReadout'

describe('ImageSendReadout（spec §3 发送键带价）', () => {
  it('有价：写单价 × 张数', () => {
    const { container } = render(
      <ImageSendReadout
        unit={0.04}
        count={4}
        missingKey={false}
        onSetupKey={vi.fn()}
      />,
    )
    const readout = container.querySelector('[data-image-send-readout]')!
    expect(readout.getAttribute('data-image-send-readout')).toBe('price')
    expect(readout.textContent).toContain('$0.16')
  })

  it('钉不死价：整行不画', () => {
    const { container } = render(
      <ImageSendReadout
        unit={null}
        count={1}
        missingKey={false}
        onSetupKey={vi.fn()}
      />,
    )
    expect(container.querySelector('[data-image-send-readout]')).toBeNull()
  })

  it('缺 key：写「先配 key」，点了就地配置', () => {
    const onSetupKey = vi.fn()
    const { container } = render(
      <ImageSendReadout
        unit={0.04}
        count={1}
        missingKey
        onSetupKey={onSetupKey}
      />,
    )
    const button = container.querySelector(
      '[data-image-send-readout="missing-key"]',
    )!
    expect(button.textContent).toBe('needsKey')
    fireEvent.click(button)
    expect(onSetupKey).toHaveBeenCalledTimes(1)
  })
})
