import { describe, expect, it } from 'vitest'

import { planLoraCandidateSearch } from '@/services/lora/lora-candidate-intent'

describe('planLoraCandidateSearch — 该搜的', () => {
  it('「找一个鸣潮长离的 lora」→ 搜，且检索词只剩主语', () => {
    const plan = planLoraCandidateSearch('帮我找一个鸣潮长离的 lora')
    expect(plan.shouldSearch).toBe(true)
    // 脚手架（帮我 / 找一个）和 `lora` 本身都剥掉：两个源已经按 LoRA 过滤，
    // 把 "lora" 留在词里只会把 HF 的命中拉向仓库名带 lora 的那批。
    expect(plan.query).toBe('鸣潮长离的')
    expect(plan.reason).toBe('lora discovery intent')
  })

  it('英文的「recommend a lora for ...」同样命中', () => {
    const plan = planLoraCandidateSearch(
      'can you recommend a LoRA for 90s cel-shaded anime?',
    )
    expect(plan.shouldSearch).toBe(true)
    expect(plan.query.toLowerCase()).toContain('cel-shaded anime')
    expect(plan.query.toLowerCase()).not.toContain('lora')
  })

  it('指名 civitai 时不需要出现 lora 这个词', () => {
    const plan = planLoraCandidateSearch('civitai 上有没有赛博朋克霓虹的')
    expect(plan.shouldSearch).toBe(true)
  })

  it('「有没有角色模型」这类复合名词也算', () => {
    expect(
      planLoraCandidateSearch('有没有适合画古风的角色模型').shouldSearch,
    ).toBe(true)
  })
})

describe('planLoraCandidateSearch — 不该搜的', () => {
  it('提到 LoRA 但不是要找另一把 —— 不搜', () => {
    const plan = planLoraCandidateSearch('我挂了两个 LoRA，你能看到吗？')
    expect(plan.shouldSearch).toBe(false)
    expect(plan.reason).toBe('lora mentioned, but not as a request to find one')
    expect(plan.query).toBe('')
  })

  it('纯创作请求 —— 不搜（每轮都搜就是花钱买噪音）', () => {
    expect(
      planLoraCandidateSearch('帮我写一个赛博朋克的提示词').shouldSearch,
    ).toBe(false)
  })

  it('⛔ 裸的「模型」不触发 —— 那是 [[setup]] 的地盘', () => {
    const plan = planLoraCandidateSearch('有没有别的模型可以试试？')
    expect(plan.shouldSearch).toBe(false)
    expect(plan.reason).toBe('no lora discovery signal')
  })

  it('剥完脚手架没有主语 —— 不注入，让助手照协议先反问', () => {
    const plan = planLoraCandidateSearch('推荐个 lora')
    expect(plan.shouldSearch).toBe(false)
    expect(plan.reason).toBe('lora request has no searchable subject yet')
  })

  it('空消息', () => {
    expect(planLoraCandidateSearch('   ').shouldSearch).toBe(false)
  })
})

// 2026-08-22 真机抓到的自相矛盾路径：助手自己反问「重新搜索 LoRA，请告诉我
// 关键词」，用户照做只打关键词，严格闸判「没有 LoRA 信号」于是不搜 —— 提示语
// 本身就是让他只打关键词的。
describe('planLoraCandidateSearch — 续问态（上一句是找 LoRA）', () => {
  it('⭐ 真机原案：上一句要 LoRA，这一句只给关键词 → 搜', () => {
    const plan = planLoraCandidateSearch('重新搜，关键词用 illustrious style', {
      previousUserText: '推荐一个适合画水彩插画风格的 LoRA',
    })
    expect(plan.shouldSearch).toBe(true)
    expect(plan.reason).toBe('lora discovery follow-up')
    expect(plan.query.toLowerCase()).toContain('illustrious style')
  })

  it('⭐ 最常见那条流：「推荐个 lora」→ 反问 → 用户答一个纯风格词', () => {
    // 上一句自己是 `lora request has no searchable subject yet`（没搜），
    // 但它**表达过**找 LoRA 的意图 —— 续问态认的是意图不是那一轮搜没搜成。
    const first = planLoraCandidateSearch('推荐个 lora')
    expect(first.shouldSearch).toBe(false)

    const plan = planLoraCandidateSearch('水彩插画', {
      previousUserText: '推荐个 lora',
    })
    expect(plan.shouldSearch).toBe(true)
    expect(plan.query).toBe('水彩插画')
  })

  it('⛔ 提到 LoRA 却不是要另一把 —— 续问态**不接管**，原判据说了算', () => {
    // 这条是防退化的：上一轮刚给完推荐卡，用户接着问「这把的触发词是什么」，
    // 塞一堆新候选是打断。带名词面的句子一律留给原判据。
    const plan = planLoraCandidateSearch('这个 LoRA 的触发词是什么', {
      previousUserText: '有没有水彩风格的 LoRA',
    })
    expect(plan.shouldSearch).toBe(false)
    expect(plan.reason).toBe('lora mentioned, but not as a request to find one')
  })

  it('⛔ 只续一轮：上一句自己是续问态时，不再往下传染', () => {
    // `hasLoraDiscoveryIntent` 不递归 —— 上一句「水彩插画」既无名词面也无动词面，
    // 所以它不能给再下一句授权。否则一次 LoRA 请求会让整段对话每轮都打源。
    const plan = planLoraCandidateSearch('那再亮一点', {
      previousUserText: '水彩插画',
    })
    expect(plan.shouldSearch).toBe(false)
    expect(plan.reason).toBe('no lora discovery signal')
  })

  it('上一句与 LoRA 无关时，续问态不生效', () => {
    const plan = planLoraCandidateSearch('illustrious style', {
      previousUserText: '帮我把这段提示词改得更简洁',
    })
    expect(plan.shouldSearch).toBe(false)
  })

  it('续问那一句剥完没有主语 —— 也不搜（理由与首轮分开，便于查日志）', () => {
    const plan = planLoraCandidateSearch('请给我推荐一个', {
      previousUserText: '推荐个 lora',
    })
    expect(plan.shouldSearch).toBe(false)
    expect(plan.reason).toBe('lora follow-up has no searchable subject')
  })

  it('不传上一句时行为与改动前逐字一致', () => {
    const plan = planLoraCandidateSearch('illustrious style')
    expect(plan.shouldSearch).toBe(false)
    expect(plan.reason).toBe('no lora discovery signal')
  })
})
