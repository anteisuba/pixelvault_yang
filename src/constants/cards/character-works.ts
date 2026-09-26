/**
 * 角色页的**作品**（owner 09-26：按作品分组，作品从角色标签括号里自动取、可改）。
 *
 * Danbooru 角色标签的惯例是 `名字_(作品)`，括号里就是作品的 copyright 标签。
 * 这里只给常见作品配三语名；不在表里的把标签还原成词（`zenless_zone_zero` →
 * `Zenless Zone Zero`）。没有括号的标签（原创角色、或标签本身不带作品）归「原创」，
 * 用户可以在编辑里改。
 */
export const CHARACTER_WORK_NAMES: Record<
  string,
  { zh: string; en: string; ja: string }
> = {
  wuthering_waves: { zh: '鸣潮', en: 'Wuthering Waves', ja: '鳴潮' },
  blue_archive: { zh: '蔚蓝档案', en: 'Blue Archive', ja: 'ブルーアーカイブ' },
  genshin_impact: { zh: '原神', en: 'Genshin Impact', ja: '原神' },
  'honkai:_star_rail': {
    zh: '崩坏：星穹铁道',
    en: 'Honkai: Star Rail',
    ja: '崩壊：スターレイル',
  },
  honkai_impact_3rd: {
    zh: '崩坏3',
    en: 'Honkai Impact 3rd',
    ja: '崩壊3rd',
  },
  zenless_zone_zero: {
    zh: '绝区零',
    en: 'Zenless Zone Zero',
    ja: 'ゼンレスゾーンゼロ',
  },
  arknights: { zh: '明日方舟', en: 'Arknights', ja: 'アークナイツ' },
  azur_lane: { zh: '碧蓝航线', en: 'Azur Lane', ja: 'アズールレーン' },
  "girls'_frontline": {
    zh: '少女前线',
    en: "Girls' Frontline",
    ja: 'ドールズフロントライン',
  },
  hololive: { zh: 'hololive', en: 'hololive', ja: 'ホロライブ' },
  nijisanji: { zh: '彩虹社', en: 'Nijisanji', ja: 'にじさんじ' },
  umamusume: { zh: '赛马娘', en: 'Umamusume', ja: 'ウマ娘' },
  'fate_(series)': { zh: 'Fate', en: 'Fate', ja: 'Fate' },
  idolmaster: { zh: '偶像大师', en: 'The Idolmaster', ja: 'アイドルマスター' },
  'love_live!': { zh: 'LoveLive!', en: 'Love Live!', ja: 'ラブライブ!' },
  touhou: { zh: '东方Project', en: 'Touhou Project', ja: '東方Project' },
  vocaloid: { zh: 'VOCALOID', en: 'VOCALOID', ja: 'VOCALOID' },
  pokemon: { zh: '宝可梦', en: 'Pokémon', ja: 'ポケモン' },
}
