import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_RESEARCH_LIMITS,
  ASSISTANT_WEB_FIND_LIMITS,
} from '@/constants/assistant-operator'
import type { AssistantOperatorWebImage } from '@/types/assistant-operator'
import type { AssistantWebFind } from '@/types/assistant-web-finds'

import {
  buildResearchCompact,
  carriedWebFinds,
  describeWebFindLine,
  describeWebImageFindLine,
  describeWebVideoFindLine,
  judgeWebImageFind,
  parseWebFindHandle,
  researchGist,
  WEB_FIND_REF_PATTERN,
  webFindToWebImage,
  webImageToFind,
  webVideoToFind,
} from './assistant-web-finds'

/** 正文里点到的号（按出场顺序）。 */
function refsIn(text: string): number[] {
  return [...text.matchAll(WEB_FIND_REF_PATTERN)].map((match) =>
    Number(match[1]),
  )
}

describe('parseWebFindHandle：工具入参里的一整个句柄', () => {
  it('认 #3 / ＃3 / # 3（两头空白不算）', () => {
    expect(parseWebFindHandle('#3')).toBe(3)
    expect(parseWebFindHandle(' ＃12 ')).toBe(12)
    expect(parseWebFindHandle('# 7')).toBe(7)
  })

  it('⛔ 不是这个形状的一律 null：地址、素材 id、带别的字、0、超号', () => {
    for (const text of [
      'https://img.test/a.jpg#3',
      'asset-3',
      '#3a',
      '用 #3',
      '#0',
      '#12345',
      '',
      null,
      undefined,
    ])
      expect(parseWebFindHandle(text)).toBeNull()
    expect(parseWebFindHandle(`#${ASSISTANT_WEB_FIND_LIMITS.maxNumber}`)).toBe(
      ASSISTANT_WEB_FIND_LIMITS.maxNumber,
    )
  })
})

describe('WEB_FIND_REF_PATTERN：回复正文里的 #n', () => {
  it('⭐ 中日文紧贴着写也认；全角井号也认', () => {
    expect(refsIn('我觉得#3最像，＃5 也行')).toEqual([3, 5])
    expect(refsIn('#2 is the closest; #10 too.')).toEqual([2, 10])
  })

  it('⛔ C#4、#3a、&#123;、##2、超过 4 位的不算点名', () => {
    expect(refsIn('C#4 and #3a and &#123; and ##2 and #12345')).toEqual([])
  })

  it('与 [n] 资料号互不相干', () => {
    expect(refsIn('柳木 [1]，见 #2')).toEqual([2])
  })
})

describe('一行一条：给模型的那一行', () => {
  it('⭐ 图：#n · 标题 · 域名 · 宽×高 · 能不能当参考（缺哪格少哪格，⛔ 不带地址）', () => {
    const line = describeWebImageFindLine(
      {
        n: 3,
        title: '  Changli   official art ',
        domain: 'wutheringwaves.kurogames.com',
        pageUrl: 'https://wutheringwaves.kurogames.com/news/1',
        width: 1920,
        height: 1080,
      },
      true,
    )
    expect(line).toBe(
      '#3 · Changli official art · wutheringwaves.kurogames.com · 1920×1080 · usable as reference',
    )
    expect(
      describeWebImageFindLine(
        { n: 4, pageUrl: 'https://www.pixiv.net/artworks/1' },
        false,
      ),
    ).toBe('#4 · pixiv.net · view only')
    expect(line).not.toContain('https://')
  })

  it('标题过长截到 maxLineTitleChars', () => {
    const line = describeWebImageFindLine(
      { n: 1, title: 'x'.repeat(200), domain: 'a.test' },
      true,
    )
    const title = line.split(' · ')[1]!
    expect(title).toHaveLength(ASSISTANT_WEB_FIND_LIMITS.maxLineTitleChars)
    expect(title.endsWith('…')).toBe(true)
  })

  it('视频：#n · 标题 · 频道 · 平台 · 时长；别的站写域名', () => {
    expect(
      describeWebVideoFindLine({
        n: 5,
        title: 'Changli PV',
        channel: 'Wuthering Waves',
        platform: 'youtube',
        durationSeconds: 209,
      }),
    ).toBe('#5 · Changli PV · Wuthering Waves · YouTube · 3:29')
    expect(
      describeWebVideoFindLine({
        n: 6,
        title: 'Some clip',
        platform: 'other',
        domain: 'example.test',
      }),
    ).toBe('#6 · Some clip · example.test')
  })
})

describe('能不能当参考：服务端现判，⛔ 不信往返带回来的', () => {
  it('两边有一边不让用就不让用', () => {
    expect(
      judgeWebImageFind({
        domain: 'site.test',
        pageUrl: 'https://www.pinterest.com/pin/1',
      }),
    ).toBe('blocked')
    expect(judgeWebImageFind({ domain: 'site.test' })).toBe('unknownLicense')
  })

  it('⭐ 往返：面板那一份 → 本轮记录 → 准入名单，结论按域名重判', () => {
    const image: AssistantOperatorWebImage = {
      n: 2,
      imageUrl: 'https://i.pinimg.test/2.jpg',
      pageUrl: 'https://www.pinterest.com/pin/2',
      domain: 'www.pinterest.com',
      // 有人把往返的这一份改成「能用」：⛔ 不信。
      usableAsInput: true,
      sourceVerdict: 'allowed',
    }
    const find = webImageToFind(image)
    expect(find).not.toBeNull()
    expect(find).not.toHaveProperty('usableAsInput')
    const back = webFindToWebImage(find!)
    expect(back.usableAsInput).toBe(false)
    expect(back.sourceVerdict).toBe('blocked')
    expect(back.n).toBe(2)
    expect(describeWebFindLine(find!)).toContain('view only')
  })

  it('缩略图 / 来源页不合格只丢那一格，⛔ 不把整条（和它的号）丢掉', () => {
    const find = webImageToFind({
      n: 4,
      imageUrl: 'https://a.test/4.jpg',
      thumbnailUrl: `data:image/jpeg;base64,${'A'.repeat(5_000)}`,
      pageUrl: 'not a url',
      usableAsInput: true,
      sourceVerdict: 'allowed',
    })
    expect(find).toEqual({
      kind: 'image',
      n: 4,
      imageUrl: 'https://a.test/4.jpg',
    })
  })

  it('没编号的（旧内核）不进本轮记录', () => {
    expect(
      webImageToFind({
        imageUrl: 'https://a.test/1.jpg',
        usableAsInput: true,
        sourceVerdict: 'allowed',
      }),
    ).toBeNull()
    expect(
      webVideoToFind({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'PV',
        platform: 'youtube',
      }),
    ).toBeNull()
  })
})

describe('carriedWebFinds：带进下一轮的那一份', () => {
  it('⭐ 按号去重、按号排、只留最后 maxCarried 条', () => {
    const finds: AssistantWebFind[] = Array.from(
      { length: 20 },
      (_, index) => ({
        kind: 'image',
        n: 20 - index,
        imageUrl: `https://a.test/${20 - index}.jpg`,
      }),
    )
    finds.push({ kind: 'image', n: 20, imageUrl: 'https://a.test/again.jpg' })
    const carried = carriedWebFinds(finds)
    expect(carried).toHaveLength(ASSISTANT_WEB_FIND_LIMITS.maxCarried)
    expect(carried.map((find) => find.n)).toEqual(
      Array.from(
        { length: ASSISTANT_WEB_FIND_LIMITS.maxCarried },
        (_, index) => 20 - ASSISTANT_WEB_FIND_LIMITS.maxCarried + 1 + index,
      ),
    )
    // 同号以后来的为准。
    expect(carried.at(-1)).toMatchObject({
      imageUrl: 'https://a.test/again.jpg',
    })
  })
})

describe('查证的短版（附录 I §二 6）', () => {
  it('一句话摘要：空白压平、截到 maxCompactGistChars', () => {
    expect(researchGist('  柳木，\n\n十四英寸。 ')).toBe('柳木， 十四英寸。')
    const long = researchGist('字'.repeat(1_000))
    expect(long).toHaveLength(ASSISTANT_RESEARCH_LIMITS.maxCompactGistChars)
  })

  it('⭐ 一行一条 [n] 标题 · 域名 · 一句话（单源打标）+ 结论；号不变、怎么再读写清楚', () => {
    const compact = buildResearchCompact({
      goal: '罗恩的魔杖',
      evidence: [
        {
          cite: 1,
          title: 'Ronald Weasley',
          publisher: 'Harry Potter Wiki',
          url: 'https://harrypotter.fandom.com/wiki/Ronald_Weasley',
          snippet: '柳木，十四英寸，独角兽毛。'.repeat(30),
          corroboration: 2,
        },
        {
          cite: 2,
          title: 'Tag counts',
          publisher: 'Danbooru',
          snippet: 'ron_weasley 1200',
          corroboration: 1,
        },
      ],
      summary: '  柳木，十四英寸。 ',
    })
    const lines = compact.split('\n')
    expect(lines[0]).toBe(
      'verify("罗恩的魔杖") → 2 source(s), shown in full on the step right after the search; one line each now:',
    )
    expect(lines[1]).toMatch(
      /^ {2}\[1\] Ronald Weasley · harrypotter\.fandom\.com · 柳木/,
    )
    expect(lines[1]).not.toContain('single source')
    expect(lines[2]).toBe(
      '  [2] Tag counts · Danbooru · ron_weasley 1200 · single source',
    )
    expect(lines[3]).toBe('Summary: 柳木，十四英寸。')
    expect(lines[4]).toBe(
      'Cite with the same [n]. To read one of them in full again, read "[n]".',
    )
    expect(compact).not.toContain('https://')
  })
})
