/**
 * 她在对话里说话（②c，聊天并回对话）—— 气泡节奏、念出来的语气标签、学说法。
 *
 * 原来跟着配音间的聊天（`/studio/audio`）走；10-26 聊天房间删了，留下的这几样对话还在用。
 */

/**
 * 像发消息一样（10-26「更像真人」F）：后一个气泡前「正在输入…」停一会儿，前一个越长停得越久（封顶）。
 * 10-26 用户定（样件 F）：500ms + 每字 70ms；封顶只防一行写成一大段时干等。
 */
export const CHAT_BUBBLE_PAUSE = {
  baseMs: 500,
  perCharMs: 70,
  maxMs: 4000,
} as const

/**
 * Fish Drama 3 认的成对标签：只改包在里面的那几个字（念出来的语气）。
 */
export const DRAMA_PAIRED_TAGS = [
  'whisper',
  'emphasis',
  'soft',
  'fast',
  'slow',
  'stress',
  'forceful',
] as const

/**
 * 学说法（F）：你在对话里每说这么多句，她从你最近的话里挑几个口头禅记到角色卡上；
 * 一次看最近多少句你的话、最多记几个、每句最多读多少字。
 */
export const CHAT_LEARN_PHRASES = {
  everyUserLines: 8,
  readUserLines: 30,
  maxNewPerRun: 4,
  lineMaxChars: 2_000,
} as const

/**
 * 配音台「语气」菜单（用户 10-27：情绪要齐）：Fish 官方标记表照抄，点一个就把 `[标记]` 插到光标处。
 * 表在 https://docs.fish.audio/developer-guide/core-features/emotions ；S2.1 / Drama 3 都认，
 * 写在句首管整句、句中管从那儿往后，音效后面要跟着那声的字（`[laughing] 哈哈`）。
 * `id` 是文案键，`tag` 是写进台词的那个词（⛔ 自造词，表里查不到的不放）。
 */
export const VOICE_CUE_GROUPS = [
  {
    id: 'emotion',
    cues: [
      'happy',
      'sad',
      'angry',
      'excited',
      'calm',
      'nervous',
      'confident',
      'surprised',
      'satisfied',
      'delighted',
      'scared',
      'worried',
      'upset',
      'frustrated',
      'depressed',
      'empathetic',
      'embarrassed',
      'disgusted',
      'moved',
      'proud',
      'relaxed',
      'grateful',
      'curious',
      'sarcastic',
    ].map((tag) => ({ id: tag, tag })),
  },
  {
    id: 'emotionMore',
    cues: [
      'disdainful',
      'unhappy',
      'anxious',
      'hysterical',
      'indifferent',
      'uncertain',
      'doubtful',
      'confused',
      'disappointed',
      'regretful',
      'guilty',
      'ashamed',
      'jealous',
      'envious',
      'hopeful',
      'optimistic',
      'pessimistic',
      'nostalgic',
      'lonely',
      'bored',
      'contemptuous',
      'sympathetic',
      'compassionate',
      'determined',
      'resigned',
    ].map((tag) => ({ id: tag, tag })),
  },
  {
    id: 'tone',
    cues: [
      { id: 'hurried', tag: 'in a hurry tone' },
      { id: 'shouting', tag: 'shouting' },
      { id: 'screaming', tag: 'screaming' },
      { id: 'whispering', tag: 'whispering' },
      { id: 'soft', tag: 'soft tone' },
      { id: 'emphasis', tag: 'emphasis' },
    ],
  },
  {
    id: 'sound',
    cues: [
      { id: 'laughing', tag: 'laughing' },
      { id: 'chuckling', tag: 'chuckling' },
      { id: 'sobbing', tag: 'sobbing' },
      { id: 'cryingLoudly', tag: 'crying loudly' },
      { id: 'sighing', tag: 'sighing' },
      { id: 'groaning', tag: 'groaning' },
      { id: 'panting', tag: 'panting' },
      { id: 'gasping', tag: 'gasping' },
      { id: 'yawning', tag: 'yawning' },
      { id: 'snoring', tag: 'snoring' },
      { id: 'clearThroat', tag: 'clear throat' },
    ],
  },
  {
    id: 'pause',
    cues: [
      { id: 'shortPause', tag: 'break' },
      { id: 'longPause', tag: 'long-break' },
    ],
  },
] as const satisfies readonly {
  id: string
  cues: readonly { id: string; tag: string }[]
}[]
