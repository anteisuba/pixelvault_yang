import { describe, expect, it } from 'vitest'

import { mergeTagNames, parseCsv } from './import-danbooru-tag-names'

describe('import-danbooru-tag-names', () => {
  it('认引号里的逗号与 BOM', () => {
    expect(parseCsv('﻿tag,zh\r\nlong_hair,"长发, 长头发"\n')).toEqual([
      ['tag', 'zh'],
      ['long_hair', '长发, 长头发'],
    ])
  })

  it('中文那份给中文名 / 别名 / 注释，日文那份给日文名；tag 的空格换回下划线', () => {
    const rows = mergeTagNames(
      [
        ['tag', 'category', 'aliases', 'zh', 'count', 'notes'],
        [
          'hatsune_miku',
          '4',
          '初音|Miku',
          '初音未来',
          '143963',
          'VOCALOID 虚拟歌姬',
        ],
      ],
      [
        ['hatsune miku', '4', '150000', '', '初音ミク'],
        ['long hair', '0', '6000000', '', '長髪'],
        ['no translation', '0', '5', '', ''],
      ],
    )
    expect(rows).toEqual([
      {
        tag: 'hatsune_miku',
        category: 4,
        count: 150000,
        zh: '初音未来',
        zhNote: 'VOCALOID 虚拟歌姬',
        ja: '初音ミク',
        searchText: '初音未来\n初音\nmiku\n初音ミク',
      },
      {
        tag: 'long_hair',
        category: 0,
        count: 6000000,
        zh: null,
        zhNote: null,
        ja: '長髪',
        searchText: '長髪',
      },
    ])
  })
})
