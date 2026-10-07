import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MCP_MAX_ACTIVE_TOKENS } from '@/constants/mcp'
import type { McpTokenRecord } from '@/types/mcp'

import { SettingsConnectionsSection } from './SettingsConnectionsSection'

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) => (key: string, values?: Record<string, unknown>) =>
      values?.name
        ? `${namespace}:${key}:${values.name}`
        : `${namespace}:${key}`,
  useFormatter: () => ({
    relativeTime: () => '5 minutes ago',
    dateTime: () => '10/4',
  }),
}))

const api = vi.hoisted(() => ({
  listMcpTokensAPI: vi.fn(),
  createMcpTokenAPI: vi.fn(),
  revokeMcpTokenAPI: vi.fn(),
}))
vi.mock('@/lib/api-client', () => api)

const TOKEN = 'pvmcp_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'

function record(overrides: Partial<McpTokenRecord> = {}): McpTokenRecord {
  return {
    id: 't1',
    name: 'Claude Code',
    last4: 'a3f9',
    createdAt: '2026-10-04T00:00:00.000Z',
    lastUsedAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})

describe('SettingsConnectionsSection', () => {
  it('lists tokens by name and last four only', async () => {
    api.listMcpTokensAPI.mockResolvedValue({
      success: true,
      data: [record(), record({ id: 't2', name: '工作电脑', last4: 'c07e' })],
    })
    render(<SettingsConnectionsSection />)

    expect(await screen.findByText('工作电脑')).toBeInTheDocument()
    expect(screen.getByText('…a3f9')).toBeInTheDocument()
    expect(screen.getByText('…c07e')).toBeInTheDocument()
  })

  it('shows the plaintext and the filled-in command once, then collapses to a row', async () => {
    api.listMcpTokensAPI.mockResolvedValue({ success: true, data: [] })
    api.createMcpTokenAPI.mockResolvedValue({
      success: true,
      data: {
        ...record({ id: 'new', name: 'MacBook', last4: 'DEFG' }),
        token: TOKEN,
      },
    })
    render(<SettingsConnectionsSection />)

    expect(
      await screen.findByText('Settings:connections.empty'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /connections.create/ }))
    const input = screen.getByRole('textbox', {
      name: 'Settings:connections.nameLabel',
    })
    fireEvent.change(input, { target: { value: 'MacBook' } })
    fireEvent.submit(input.closest('form')!)

    expect(await screen.findByText(TOKEN)).toBeInTheDocument()
    expect(api.createMcpTokenAPI).toHaveBeenCalledWith({ name: 'MacBook' })
    expect(
      screen.getByText(
        new RegExp(
          `claude mcp add .* pixelvault .*/api/mcp --header "Authorization: Bearer ${TOKEN}"`,
        ),
      ),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Settings:connections.created.done' }),
    )
    await waitFor(() =>
      expect(screen.queryByText(TOKEN)).not.toBeInTheDocument(),
    )
    expect(screen.getByText('MacBook')).toBeInTheDocument()
    expect(screen.getByText('…DEFG')).toBeInTheDocument()
  })

  it('revokes only after the confirmation', async () => {
    api.listMcpTokensAPI.mockResolvedValue({ success: true, data: [record()] })
    api.revokeMcpTokenAPI.mockResolvedValue({ success: true, data: null })
    render(<SettingsConnectionsSection />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Settings:connections.revoke',
      }),
    )
    expect(api.revokeMcpTokenAPI).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog')
    await act(async () => {
      fireEvent.click(
        Array.from(dialog.querySelectorAll('button')).find(
          (button) => button.textContent === 'Settings:connections.revoke',
        )!,
      )
    })

    expect(api.revokeMcpTokenAPI).toHaveBeenCalledWith('t1')
    await waitFor(() =>
      expect(screen.queryByText('…a3f9')).not.toBeInTheDocument(),
    )
  })

  it('greys out create once the active-token limit is reached', async () => {
    api.listMcpTokensAPI.mockResolvedValue({
      success: true,
      data: Array.from({ length: MCP_MAX_ACTIVE_TOKENS }, (_, index) =>
        record({ id: `t${index}`, last4: String(1000 + index) }),
      ),
    })
    render(<SettingsConnectionsSection />)

    expect(
      await screen.findByText('Settings:connections.limit'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /connections.create/ }),
    ).toBeDisabled()
  })

  it('offers a retry when the list fails to load', async () => {
    api.listMcpTokensAPI
      .mockResolvedValueOnce({ success: false, error: 'offline' })
      .mockResolvedValueOnce({ success: true, data: [record()] })
    render(<SettingsConnectionsSection />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Settings:connections.retry' }),
    )
    expect(await screen.findByText('…a3f9')).toBeInTheDocument()
  })
})
