// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { pinDocumentTitlePrefix } from '@/lib/document-title-prefix'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  document.title = ''
})

describe('pinDocumentTitlePrefix', () => {
  it('流式 metadata 晚到把标题换掉：名字自己补回去', async () => {
    document.title = 'ANTEI'
    const release = pinDocumentTitlePrefix('Denia')
    expect(document.title).toBe('Denia · ANTEI')
    // Next 晚到的 <title>
    document.title = '角色 — ANTEI'
    await flush()
    expect(document.title).toBe('Denia · 角色 — ANTEI')
    release()
    expect(document.title).toBe('角色 — ANTEI')
  })

  it('撤掉后不再补', async () => {
    document.title = '角色 — ANTEI'
    pinDocumentTitlePrefix('Denia')()
    document.title = '素材 — ANTEI'
    await flush()
    expect(document.title).toBe('素材 — ANTEI')
  })
})
