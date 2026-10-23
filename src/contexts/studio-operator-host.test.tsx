import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  StudioOperatorHostProvider,
  StudioOperatorHostSlotProvider,
  useStudioOperatorBenchKey,
  useStudioOperatorHost,
  type StudioOperatorHost,
} from '@/contexts/studio-operator-host'

/** 只用到 `domain` 当名字；其余字段这几条用例不读。 */
function fakeHost(domain: string): StudioOperatorHost {
  return { domain } as unknown as StudioOperatorHost
}

const HOME = fakeHost('home')
const IMAGE = fakeHost('image')
const EDIT = fakeHost('canvas')

function ShellReadout() {
  const host = useStudioOperatorHost()
  const key = useStudioOperatorBenchKey()
  return (
    <span data-testid="shell">
      {host.domain}:{key === null ? 'none' : 'bench'}
    </span>
  )
}

function BenchReadout() {
  return <span data-testid="bench">{useStudioOperatorHost().domain}</span>
}

function Shell({ children }: { children?: React.ReactNode }) {
  return (
    <StudioOperatorHostSlotProvider fallback={HOME}>
      {() => (
        <>
          <ShellReadout />
          {children}
        </>
      )}
    </StudioOperatorHostSlotProvider>
  )
}

describe('StudioOperatorHostSlotProvider', () => {
  it('falls back to the home host when no bench is registered', () => {
    render(<Shell />)
    expect(screen.getByTestId('shell').textContent).toBe('home:none')
  })

  it('hands the shell the registered bench host and drops it on unmount', () => {
    const { rerender } = render(
      <Shell>
        <StudioOperatorHostProvider host={IMAGE}>
          <BenchReadout />
        </StudioOperatorHostProvider>
      </Shell>,
    )
    expect(screen.getByTestId('shell').textContent).toBe('image:bench')
    expect(screen.getByTestId('bench').textContent).toBe('image')

    rerender(<Shell />)
    expect(screen.getByTestId('shell').textContent).toBe('home:none')
  })

  it('takes the innermost registration when benches nest', () => {
    render(
      <Shell>
        <StudioOperatorHostProvider host={IMAGE}>
          <StudioOperatorHostProvider host={EDIT}>
            <BenchReadout />
          </StudioOperatorHostProvider>
        </StudioOperatorHostProvider>
      </Shell>,
    )
    expect(screen.getByTestId('shell').textContent).toBe('canvas:bench')
  })

  it('reports no bench key outside the shell', () => {
    function Probe() {
      return (
        <span data-testid="probe">{String(useStudioOperatorBenchKey())}</span>
      )
    }
    render(<Probe />)
    expect(screen.getByTestId('probe').textContent).toBe('undefined')
  })
})
