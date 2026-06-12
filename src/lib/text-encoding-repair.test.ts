import { describe, expect, it } from 'vitest'

import { repairUtf8Mojibake } from './text-encoding-repair'

describe('repairUtf8Mojibake', () => {
  it('repairs Civitai mojibake Chinese metadata', () => {
    expect(repairUtf8Mojibake('ææ¥æ¹èç»æ«å°å²ä»£çäºº')).toBe(
      '明日方舟终末地岁代理人',
    )
    expect(repairUtf8Mojibake('éç¨æ´æ°å¿«waiIllustriousSDXL_v160')).toBe(
      '通用更新快waiIllustriousSDXL_v160',
    )
  })

  it('leaves normal text unchanged', () => {
    expect(
      repairUtf8Mojibake(
        'detached sleeves, dragon girl, green hair, sleeveless dress',
      ),
    ).toBe('detached sleeves, dragon girl, green hair, sleeveless dress')
    expect(repairUtf8Mojibake('明日方舟终末地岁代理人')).toBe(
      '明日方舟终末地岁代理人',
    )
  })

  it('repairs CP1252-style accent mojibake without touching valid accents', () => {
    expect(repairUtf8Mojibake('CafÃ©')).toBe('Café')
    expect(repairUtf8Mojibake('Café')).toBe('Café')
  })
})
