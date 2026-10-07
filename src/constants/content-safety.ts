/**
 * 公开闸的词表（2026-10-06 owner 定：只做提示词检查）。
 *
 * 规则只有一条：提示词里**同时**出现未成年词与性相关词，作品就不能设为公开
 * （画廊、创作者主页、sitemap 都只读 `isPublic`，所以拦住写入就拦住了所有公开面）。
 * 判据见 `lib/content-safety.ts`。
 *
 * ⚠ 只看正向提示词，⛔ 不看负面提示词：负面里写 `child, nsfw` 恰恰是在排除它们。
 * ⚠ 词表宁可多拦：被拦只是不能公开，作品照样留在自己的素材库里。
 * ⚠ 「少女」「girl」不进未成年词表 —— 动漫提示词里几乎每张都有，拦它等于关掉画廊。
 * ⚠ 只拦提示词；提示词正常而画面有问题的拦不住。开放给别人公开发布之前，
 *   必须另加按图片判断的审核。
 */

/** 拉丁词按词边界匹配（`_` 视同空格，所以 `young_girl` 也会命中）。 */
export const PUBLISH_BLOCK_MINOR_TERMS = [
  'child',
  'children',
  'kid',
  'kids',
  'toddler',
  'infant',
  // ⛔ 不放 `baby`：`baby blue`、`baby face` 太常见。
  'loli',
  'lolicon',
  'shota',
  'shotacon',
  'little girl',
  'little boy',
  'young girl',
  'young boy',
  'preteen',
  'underage',
  'minor',
  'schoolgirl',
  'schoolboy',
  'elementary school',
  'middle school',
  'kindergarten',
  // CJK 按子串匹配
  '幼女',
  '幼童',
  '幼児',
  '萝莉',
  '蘿莉',
  'ロリ',
  'ショタ',
  '正太',
  '儿童',
  '兒童',
  '小孩',
  '女童',
  '男童',
  '子供',
  '子ども',
  '小学生',
  '中学生',
  '未成年',
] as const

export const PUBLISH_BLOCK_SEXUAL_TERMS = [
  'nsfw',
  'nude',
  'nudity',
  'naked',
  'topless',
  'bottomless',
  'nipple',
  'nipples',
  'areola',
  'areolae',
  'pussy',
  'vagina',
  'penis',
  'cum',
  'sex',
  'sexy',
  'sexual',
  'explicit',
  'erotic',
  'porn',
  'hentai',
  'lewd',
  'panties',
  'pantyshot',
  'upskirt',
  'downblouse',
  'cleavage',
  'lingerie',
  'underwear',
  'bra',
  'breasts',
  'ass',
  'spread legs',
  'masturbation',
  'groping',
  // 本身就是未成年性内容的类型名：两张表都放，单独出现也拦。
  'lolicon',
  'shotacon',
  // CJK 按子串匹配
  '色情',
  '裸体',
  '裸體',
  '全裸',
  '乳头',
  '乳首',
  '内裤',
  '内衣',
  '下着',
  '性交',
  'エロ',
  'おっぱい',
  'パンツ',
  'ロリコン',
] as const

/** 拦下时 API 回给前端的错误码（visibility 路由与批量路由共用）。 */
export const PUBLISH_BLOCKED_ERROR_CODE = 'CONTENT_NOT_PUBLISHABLE'

/**
 * 「先搜再画」出的图不能公开：Gemini API 条款只许把带搜索的结果给提交提示词
 * 的本人看。与上面那条分开，是因为前端要说的原因不同。
 */
export const PUBLISH_BLOCKED_SEARCH_GROUNDED_ERROR_CODE =
  'SEARCH_GROUNDED_NOT_PUBLISHABLE'
