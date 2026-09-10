import { render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ModelViewerInner from './ModelViewerInner'

vi.mock('@google/model-viewer', () => ({}))

class ViewerElement extends HTMLElement {
  cameraOrbit = ''
  cameraTarget = ''
  fieldOfView = ''
  updateComplete = Promise.resolve(true)
  resetTurntableRotation = vi.fn()
  jumpCameraToGoal = vi.fn()
}
if (!customElements.get('model-viewer'))
  customElements.define('model-viewer', ViewerElement)
afterEach(() => vi.unstubAllGlobals())

it('sets front and side views and resets zoom and target even after a repeated reset', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const { container, rerender } = render(
    <ModelViewerInner
      src="/test.glb"
      cameraView={{ view: 'side', revision: 1 }}
    />,
  )
  const viewer = container.querySelector<ViewerElement>('model-viewer')!
  expect(viewer.cameraOrbit).toBe('90deg 75deg 105%')
  rerender(
    <ModelViewerInner
      src="/test.glb"
      cameraView={{ view: 'front', revision: 2 }}
    />,
  )
  expect(viewer.cameraOrbit).toBe('0deg 75deg 105%')
  rerender(
    <ModelViewerInner
      src="/test.glb"
      cameraView={{ view: 'reset', revision: 3 }}
    />,
  )
  viewer.cameraOrbit = '30deg 60deg 50%'
  viewer.cameraTarget = '1m 2m 3m'
  viewer.fieldOfView = '10deg'
  rerender(
    <ModelViewerInner
      src="/test.glb"
      cameraView={{ view: 'reset', revision: 4 }}
    />,
  )
  expect(viewer.cameraOrbit).toBe('0deg 75deg 105%')
  expect(viewer.cameraTarget).toBe('auto auto auto')
  expect(viewer.fieldOfView).toBe('auto')
  expect(viewer.resetTurntableRotation).toHaveBeenLastCalledWith(0)
})

it('jumps to the target when reduced motion is enabled', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const { container } = render(
    <ModelViewerInner
      src="/test.glb"
      cameraView={{ view: 'side', revision: 1 }}
    />,
  )
  const viewer = container.querySelector<ViewerElement>('model-viewer')!
  await waitFor(() => expect(viewer.jumpCameraToGoal).toHaveBeenCalledOnce())
})

it('leaves other viewer surfaces unchanged when no preset is requested', () => {
  const { container } = render(<ModelViewerInner src="/test.glb" />)
  const viewer = container.querySelector<ViewerElement>('model-viewer')!
  expect(viewer.resetTurntableRotation).not.toHaveBeenCalled()
})
