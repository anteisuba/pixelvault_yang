import { describe, expect, it } from 'vitest'

import { resolveSiteName, webHostOf } from './outing-site-name'

describe('outing-site-name', () => {
  it('名册里的网页站按名册写的站名；子域名也认', () => {
    expect(resolveSiteName('zh.moegirl.org.cn')).toEqual({
      kind: 'label',
      label: '萌娘百科',
    })
    expect(resolveSiteName('jikipedia.com')).toEqual({
      kind: 'label',
      label: '小鸡词典',
    })
    expect(resolveSiteName('xyz.fandom.com')).toEqual({
      kind: 'label',
      label: 'wiki',
    })
  })

  it('现有来源按域名认回来源（站名由界面语言决定）', () => {
    expect(resolveSiteName('bilibili.com')).toEqual({
      kind: 'source',
      source: 'bilibili',
    })
    expect(resolveSiteName('danbooru.donmai.us')).toEqual({
      kind: 'source',
      source: 'danbooru',
    })
  })

  it('认不出的显示域名；域名只做后缀匹配，不会被前缀蹭上', () => {
    expect(resolveSiteName('example.org')).toEqual({
      kind: 'host',
      host: 'example.org',
    })
    expect(resolveSiteName('notbilibili.com')).toEqual({
      kind: 'host',
      host: 'notbilibili.com',
    })
  })

  it('webHostOf 去掉 www.，非 http(s) 的当不是链接', () => {
    expect(webHostOf('https://www.zhihu.com/q/1')).toBe('zhihu.com')
    expect(webHostOf('javascript:alert(1)')).toBeNull()
    expect(webHostOf('not a url')).toBeNull()
  })
})
