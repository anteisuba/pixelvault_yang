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
