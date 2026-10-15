import { beforeEach, describe, expect, it } from 'vitest'

import { URL_READER, URL_READER_BLOCK_SIGNALS } from '@/constants/web-search'

import {
  detectBlockedPage,
  htmlToReadableText,
  isReadHostBlocked,
  markReadHostBlocked,
  parseJinaReaderOutput,
  readHostBlockOf,
  readHostOf,
  resetReadHostBlocks,
} from './read-url-blocks'

/** 一篇正常的长文：谈到 Cloudflare / captcha / 403 / 「Just a moment」都很平常。 */
const LONG_ARTICLE = [
  '# How we moved our CDN to Cloudflare',
  'Last year our forum was hammered by bots, so we put Cloudflare in front of it and turned on a captcha for new sign-ups.',
  'Some users saw "Just a moment..." for a second or two, and a few got HTTP 403 Forbidden from the WAF until we tuned the rules.',
  'Access denied errors dropped to almost nothing once we allow-listed the API paths. '.repeat(
    10,
  ),
  'The rest of this post walks through the migration step by step. '.repeat(30),
].join('\n\n')

describe('parseJinaReaderOutput：Jina 正文前的那几行头', () => {
  it('⭐ 拆出标题、Warning 与正文（头里夹空行也认）', () => {
    const parsed = parseJinaReaderOutput(
      [
        'Title: Just a moment...',
        '',
        'URL Source: https://www.example.test/post',
        '',
        'Warning: Target URL returned error 403: Forbidden',
        '',
        'Markdown Content:',
        'Verification successful. Waiting for www.example.test to respond...',
      ].join('\n'),
    )
    expect(parsed).toEqual({
      title: 'Just a moment...',
      warnings: ['Target URL returned error 403: Forbidden'],
      body: 'Verification successful. Waiting for www.example.test to respond...',
    })
  })

  it('没有头（别的返回格式）= 整段都是正文', () => {
    expect(parseJinaReaderOutput('  hello world  ')).toEqual({
      title: null,
      warnings: [],
      body: 'hello world',
    })
  })

  it('⛔ 正文里写到「Markdown Content:」「Warning:」的不算头', () => {
    const raw =
      'An article about readers.\n\nMarkdown Content:\nis what Jina prints.\nWarning: not a header'
    expect(parseJinaReaderOutput(raw)).toEqual({
      title: null,
      warnings: [],
      body: raw,
    })
  })
})

describe('detectBlockedPage：挡住你的那一页', () => {
  it('⭐ 站点状态码（401 / 403 / 429 / 451）= 挡了；Jina 头里写着的目标站状态也算', () => {
    for (const status of [401, 403, 429, 451])
      expect(detectBlockedPage({ status, body: '' })).toEqual({
        blocked: true,
        reason: 'status',
        detail: `HTTP ${status}`,
      })
    expect(
      detectBlockedPage({
        body: LONG_ARTICLE,
        warnings: ['Target URL returned error 429: Too Many Requests'],
      }),
    ).toMatchObject({ blocked: true, reason: 'status', detail: 'HTTP 429' })
  })

  it('⛔ 404 / 500 不是「被挡」（那是页不在 / 站坏了）', () => {
    expect(detectBlockedPage({ status: 404, body: 'Not found' })).toEqual({
      blocked: false,
    })
    expect(
      detectBlockedPage({
        body: 'ok',
        warnings: ['Target URL returned error 404: Not Found'],
      }),
    ).toEqual({ blocked: false })
  })

  it.each([
    [
      'Cloudflare 五秒盾',
      {
        title: 'Just a moment...',
        body: 'www.example.test\n\nVerifying you are human. This may take a few seconds.\n\nwww.example.test needs to review the security of your connection before proceeding.\n\nRay ID: 8a1b2c3d4e5f\n\nPerformance & security by Cloudflare',
      },
    ],
    [
      '验证通过、等跳转那一页',
      {
        body: 'Verification successful. Waiting for www.example.test to respond...',
      },
    ],
    [
      'Attention Required',
      {
        title: 'Attention Required! | Cloudflare',
        body: 'Sorry, you have been blocked\n\nYou are unable to access example.test',
      },
    ],
    [
      'Akamai Access Denied',
      {
        title: 'Access Denied',
        body: 'You don\'t have permission to access "http://www.example.test/" on this server.\n\nReference #18.6f2c1c17.1697000000.1a2b3c',
      },
    ],
    ['中文验证码', { body: '请输入验证码以继续访问\n\n看不清？换一张' }],
    ['中文安全验证', { body: '请完成安全验证后继续访问本站。' }],
    [
      '日文（拒否 + Forbidden）',
      { body: 'アクセスが拒否されました（403 Forbidden）' },
    ],
    [
      'Cloudflare 1020',
      {
        title:
          'Access denied | www.example.test used Cloudflare to restrict access',
        body: 'Access denied\n\nError code 1020\n\nYou do not have access to www.example.test.\n\nThe site owner may have set restrictions that prevent you from accessing the site.\n\n- Ray ID: 8a1b2c3d4e5f\n\nPerformance & security by Cloudflare',
      },
    ],
    [
      '只有几样弱信号凑在一起（短页）',
      { body: 'Error 1020\n\nCloudflare Ray ID: 7f2a9c3b' },
    ],
    [
      'captcha + forbidden（短页）',
      { body: 'Forbidden. Please solve the captcha to continue.' },
    ],
  ])('⭐ 挑战页判得出来：%s', (_name, page) => {
    expect(detectBlockedPage(page)).toMatchObject({
      blocked: true,
      reason: 'challenge',
    })
  })

  it('⛔ 正常长文谈到 Cloudflare / captcha / 403 / Just a moment 不判', () => {
    expect(LONG_ARTICLE.length).toBeGreaterThan(
      URL_READER_BLOCK_SIGNALS.maxBodyChars,
    )
    expect(
      detectBlockedPage({ title: 'Moving to Cloudflare', body: LONG_ARTICLE }),
    ).toEqual({ blocked: false })
  })

  it('⛔ 短页只沾一样弱信号不判（谈到 Cloudflare 很平常）', () => {
    expect(
      detectBlockedPage({
        title: 'Cloudflare outage',
        body: 'Cloudflare had a short outage this morning; most sites were back within an hour.',
      }),
    ).toEqual({ blocked: false })
    expect(
      detectBlockedPage({ body: '时夜：黑色长发，金色瞳孔，改良中式长衫。' }),
    ).toEqual({ blocked: false })
  })

  it('⛔ 讲报错的短文开头写着「Access denied / 访问被拒绝」不判（那是弱信号，要再沾一样）', () => {
    expect(
      detectBlockedPage({
        title: 'How to fix "Access denied" when opening a shared folder',
        body: 'Access denied usually means the folder permissions do not include your account. Open Properties, then Security, and add yourself.',
      }),
    ).toEqual({ blocked: false })
    expect(
      detectBlockedPage({
        body: '访问被拒绝怎么办？先检查账号权限，再看共享设置。',
      }),
    ).toEqual({ blocked: false })
  })

  it('⛔ 弱信号凑够两样也要正文够短（weakMarkerMaxBodyChars）', () => {
    const body = `Cloudflare Turnstile is a captcha alternative. ${'It runs a few checks in the background. '.repeat(40)}`
    expect(body.length).toBeGreaterThan(
      URL_READER_BLOCK_SIGNALS.weakMarkerMaxBodyChars,
    )
    expect(body.length).toBeLessThanOrEqual(
      URL_READER_BLOCK_SIGNALS.maxBodyChars,
    )
    expect(detectBlockedPage({ body })).toEqual({ blocked: false })
  })

  it('⛔ 整句挑战语只看标题与开头：短页结尾引用一句不判', () => {
    const body = `${'正文讲的是别的事。'.repeat(80)}\n\n（引用：Just a moment...）`
    expect(body.length).toBeLessThanOrEqual(
      URL_READER_BLOCK_SIGNALS.maxBodyChars,
    )
    expect(detectBlockedPage({ body })).toEqual({ blocked: false })
  })

  it('判据表全小写（判定前文字转小写，大写的条目永远命中不了）', () => {
    for (const marker of URL_READER_BLOCK_SIGNALS.strongMarkers)
      expect(marker).toBe(marker.toLowerCase())
    for (const marker of URL_READER_BLOCK_SIGNALS.weakMarkers)
      expect(marker.source.replace(/\\[SDWB]/g, '')).toBe(
        marker.source.replace(/\\[SDWB]/g, '').toLowerCase(),
      )
  })
})

describe('被挡的站记一阵（进程内）', () => {
  beforeEach(() => {
    resetReadHostBlocks()
  })

  const NOW = 1_000_000

  it('⭐ 记 blockedHostTtlMs：之内算挡，到期就忘', () => {
    markReadHostBlocked(
      'https://www.example.test/a',
      { reason: 'challenge', detail: 'just a moment...', readerOnly: false },
      NOW,
    )
    expect(isReadHostBlocked('https://example.test/b', NOW + 1)).toBe(true)
    expect(
      isReadHostBlocked(
        'https://example.test/b',
        NOW + URL_READER.blockedHostTtlMs - 1,
      ),
    ).toBe(true)
    expect(
      isReadHostBlocked(
        'https://example.test/b',
        NOW + URL_READER.blockedHostTtlMs,
      ),
    ).toBe(false)
    expect(readHostBlockOf('https://example.test/b', NOW)).toBeNull()
  })

  it('只挡 Jina 的（readerOnly）不算「这个站被挡」，但记得住', () => {
    markReadHostBlocked(
      'example.test',
      { reason: 'status', detail: 'HTTP 403', readerOnly: true },
      NOW,
    )
    expect(isReadHostBlocked('https://example.test/x', NOW)).toBe(false)
    expect(readHostBlockOf('https://example.test/x', NOW)).toMatchObject({
      readerOnly: true,
      detail: 'HTTP 403',
    })
  })

  it('认不出的地址 / 没地址一律不算', () => {
    expect(isReadHostBlocked(undefined)).toBe(false)
    expect(isReadHostBlocked('https://')).toBe(false)
    expect(readHostOf('HTTPS://WWW.Example.TEST/a')).toBe('example.test')
  })

  it('表满了先丢最早到期的那个（⛔ 不无限长）', () => {
    for (let index = 0; index <= URL_READER.maxBlockedHosts; index += 1)
      markReadHostBlocked(
        `host-${index}.test`,
        { reason: 'challenge', detail: 'x', readerOnly: false },
        NOW + index,
      )
    const later = NOW + URL_READER.maxBlockedHosts
    expect(isReadHostBlocked('host-0.test', later)).toBe(false)
    expect(isReadHostBlocked('host-1.test', later)).toBe(true)
    expect(
      isReadHostBlocked(`host-${URL_READER.maxBlockedHosts}.test`, later),
    ).toBe(true)
  })
})

describe('htmlToReadableText：直连读回来的 HTML → 字', () => {
  it('⭐ 标题、段落分开；脚本 / 样式 / head 整段丢；实体解码', () => {
    const { title, text } = htmlToReadableText(
      `<!doctype html><html><head><title>时夜 &amp; 角色</title><style>p{color:red}</style><script>var x = "<p>no</p>"</script></head>
      <body><!-- nav --><nav>首页</nav><h1>时夜</h1><p>黑色长发&nbsp;金色瞳孔&#12290;</p><ul><li>改良中式长衫</li><li>双刃</li></ul>
      <noscript>enable js</noscript></body></html>`,
    )
    expect(title).toBe('时夜 & 角色')
    expect(text).toContain('时夜\n\n黑色长发 金色瞳孔。')
    expect(text).toContain('- 改良中式长衫')
    expect(text).not.toContain('color:red')
    expect(text).not.toContain('no</p>')
    expect(text).not.toContain('enable js')
    expect(text).not.toContain('nav')
  })

  it('没闭合的那一段 = 后面全丢；大小写混写的标签照样认', () => {
    expect(
      htmlToReadableText(
        '<P>前面</P><SCRIPT>var a = 1</SCRIPT><p>中间</p><svg><path d="M0"/>后面',
      ).text,
    ).toBe('前面\n\n中间')
    expect(
      htmlToReadableText('<p>正文</p><!-- 没闭合的注释 <p>x</p>').text,
    ).toBe('正文')
  })

  it('⛔ 外站 HTML 再刁钻也是线性的（几十万个没闭合的 `<svg` / `<a` / `<!--`）', () => {
    const hostile = `<p>ok</p>${'<a'.repeat(200_000)}${'<svg'.repeat(100_000)}${'<!--'.repeat(100_000)}`
    const started = performance.now()
    const { text } = htmlToReadableText(hostile)
    expect(performance.now() - started).toBeLessThan(1_000)
    expect(text.startsWith('ok')).toBe(true)
  })
})
