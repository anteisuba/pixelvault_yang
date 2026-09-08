import { beforeEach, describe, expect, it } from 'vitest'

import {
  ASSISTANT_OPERATOR_RESUME_LIMITS,
  ASSISTANT_OPERATOR_RESUME_STEP_STATE_IDS as STATES,
} from '@/constants/assistant-operator'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import {
  STUDIO_OPERATOR_RESUME,
  STUDIO_OPERATOR_RESUME_TTL_MS,
} from '@/constants/studio-assistant-operator'
import {
  clearOperatorResume,
  createResumePlan,
  failedResumeStep,
  hasUnfinishedSteps,
  markResumeStep,
  nextResumeStepNumber,
  operatorResumeStorageKey,
  readOperatorResume,
  toResumeFrom,
  writeOperatorResume,
} from '@/lib/studio-operator-resume'
import type { StudioOperatorResumePlan } from '@/types/studio-operator-resume'

const NOW = Date.parse('2026-09-08T10:00:00.000Z')

function buildPlan(
  overrides: Partial<StudioOperatorResumePlan> = {},
): StudioOperatorResumePlan {
  return {
    planId: 'plan-1',
    domain: ASSISTANT_PROTOCOL_DOMAIN_IDS.image,
    sessionId: 'session-1',
    updatedAt: new Date(NOW).toISOString(),
    steps: [
      { id: 'plan-1:0', label: '读取表单', state: STATES.done },
      { id: 'plan-1:1', label: '写提示词', state: STATES.pending },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('createResumePlan', () => {
  it('每一步都从 pending 起，id 按顺序派生自 planId', () => {
    const plan = createResumePlan({
      planId: 'plan-9',
      domain: ASSISTANT_PROTOCOL_DOMAIN_IDS.video,
      sessionId: null,
      labels: ['一', '二', '三'],
      now: NOW,
    })
    expect(plan?.steps.map((step) => step.id)).toEqual([
      'plan-9:0',
      'plan-9:1',
      'plan-9:2',
    ])
    expect(plan?.steps.every((step) => step.state === STATES.pending)).toBe(
      true,
    )
  })

  it('一步都没有时返回 null —— 空计划不该占住那一格', () => {
    expect(
      createResumePlan({
        planId: 'plan-9',
        domain: ASSISTANT_PROTOCOL_DOMAIN_IDS.image,
        sessionId: null,
        labels: [],
        now: NOW,
      }),
    ).toBeNull()
  })

  it('步数超上限时只留前 maxSteps 条', () => {
    const labels = Array.from({ length: 40 }, (_, i) => `step-${i}`)
    const plan = createResumePlan({
      planId: 'plan-9',
      domain: ASSISTANT_PROTOCOL_DOMAIN_IDS.image,
      sessionId: null,
      labels,
      now: NOW,
    })
    expect(plan?.steps).toHaveLength(ASSISTANT_OPERATOR_RESUME_LIMITS.maxSteps)
    expect(plan?.steps[0]?.label).toBe('step-0')
  })
})

describe('往返（write → read）', () => {
  it('写进去的那一份原样读得回来', () => {
    const plan = buildPlan()
    expect(writeOperatorResume('project-a', plan)).toBe(true)
    expect(readOperatorResume('project-a', NOW)).toEqual(plan)
  })

  it('按 scope 隔离：A 项目写的，B 项目读不到', () => {
    writeOperatorResume('project-a', buildPlan())
    expect(readOperatorResume('project-b', NOW)).toBeNull()
    expect(operatorResumeStorageKey('project-a')).toBe(
      `${STUDIO_OPERATOR_RESUME.keyPrefix}.project-a`,
    )
  })

  it('形状对不上的旧值整条丢掉，⛔ 不抛', () => {
    localStorage.setItem(
      operatorResumeStorageKey('project-a'),
      JSON.stringify({ planId: 'plan-1', steps: 'nope' }),
    )
    expect(() => readOperatorResume('project-a', NOW)).not.toThrow()
    expect(readOperatorResume('project-a', NOW)).toBeNull()
  })

  it('不是 JSON 的那一格也只是 null', () => {
    localStorage.setItem(operatorResumeStorageKey('project-a'), 'not json{')
    expect(readOperatorResume('project-a', NOW)).toBeNull()
  })

  it('过了保质期就不再提示', () => {
    writeOperatorResume('project-a', buildPlan())
    expect(
      readOperatorResume('project-a', NOW + STUDIO_OPERATOR_RESUME_TTL_MS + 1),
    ).toBeNull()
  })

  it('clear 之后那一格空着', () => {
    writeOperatorResume('project-a', buildPlan())
    clearOperatorResume('project-a')
    expect(readOperatorResume('project-a', NOW)).toBeNull()
  })
})

describe('进度读数', () => {
  it('nextResumeStepNumber 取第一个没做完的，1 起数', () => {
    expect(nextResumeStepNumber(buildPlan())).toBe(2)
  })

  it('中间被跳过的一步不会被漏掉', () => {
    const plan = buildPlan({
      steps: [
        { id: 'a', label: 'a', state: STATES.pending },
        { id: 'b', label: 'b', state: STATES.done },
      ],
    })
    expect(nextResumeStepNumber(plan)).toBe(1)
  })

  it('全做完了没有续跑入口', () => {
    const plan = buildPlan({
      steps: [{ id: 'a', label: 'a', state: STATES.done }],
    })
    expect(nextResumeStepNumber(plan)).toBeNull()
    expect(hasUnfinishedSteps(plan)).toBe(false)
  })

  it('failed 也算没跑完，并且拿得到那句原因', () => {
    const plan = buildPlan({
      steps: [
        { id: 'a', label: 'a', state: STATES.done },
        { id: 'b', label: 'b', state: STATES.failed, reason: '模型超时' },
      ],
    })
    expect(hasUnfinishedSteps(plan)).toBe(true)
    expect(failedResumeStep(plan)?.reason).toBe('模型超时')
  })
})

describe('toResumeFrom', () => {
  it('只带 done 的那几步，按原顺序', () => {
    const plan = buildPlan({
      steps: [
        { id: 'a', label: '读表单', state: STATES.done },
        { id: 'b', label: '搜参考', state: STATES.failed, reason: 'x' },
        { id: 'c', label: '写提示词', state: STATES.done },
      ],
    })
    expect(toResumeFrom(plan)).toEqual({
      planId: 'plan-1',
      completedSteps: [
        { id: 'a', label: '读表单' },
        { id: 'c', label: '写提示词' },
      ],
    })
  })

  it('带上那一步的产物 id —— 提示里把它们当既有上下文', () => {
    const plan = buildPlan({
      steps: [
        {
          id: 'a',
          label: '生成 4 张',
          state: STATES.done,
          artifactIds: ['gen-1', 'gen-2'],
        },
      ],
    })
    expect(toResumeFrom(plan)?.completedSteps[0]?.artifactIds).toEqual([
      'gen-1',
      'gen-2',
    ])
  })

  it('一步都没做完 = 不是续跑', () => {
    const plan = buildPlan({
      steps: [{ id: 'a', label: 'a', state: STATES.pending }],
    })
    expect(toResumeFrom(plan)).toBeNull()
  })
})

describe('markResumeStep', () => {
  it('标 done 并记下产物', () => {
    const next = markResumeStep(
      buildPlan(),
      'plan-1:1',
      { state: STATES.done, artifactIds: ['gen-7'] },
      NOW + 1000,
    )
    expect(next.steps[1]).toMatchObject({
      state: STATES.done,
      artifactIds: ['gen-7'],
    })
    expect(next.updatedAt).toBe(new Date(NOW + 1000).toISOString())
  })

  it('标 failed 时留下原因；再成功时那句原因被抹掉', () => {
    const failed = markResumeStep(
      buildPlan(),
      'plan-1:1',
      { state: STATES.failed, reason: '没钱了' },
      NOW,
    )
    expect(failed.steps[1]?.reason).toBe('没钱了')
    const recovered = markResumeStep(
      failed,
      'plan-1:1',
      { state: STATES.done },
      NOW,
    )
    expect(recovered.steps[1]?.reason).toBeUndefined()
  })

  it('不认识的 stepId 原样返回同一个引用', () => {
    const plan = buildPlan()
    expect(markResumeStep(plan, 'nope', { state: STATES.done }, NOW)).toBe(plan)
  })
})

describe('firstUnfinishedStepId', () => {
  it('取第一个还没有结论的那一步 —— failed 也算没有结论', async () => {
    const { firstUnfinishedStepId } =
      await import('@/lib/studio-operator-resume')
    const plan = buildPlan({
      steps: [
        { id: 'a', label: 'a', state: STATES.done },
        { id: 'b', label: 'b', state: STATES.failed, reason: 'x' },
        { id: 'c', label: 'c', state: STATES.pending },
      ],
    })
    expect(firstUnfinishedStepId(plan)).toBe('b')
  })

  it('全做完了返回 null', async () => {
    const { firstUnfinishedStepId } =
      await import('@/lib/studio-operator-resume')
    expect(
      firstUnfinishedStepId(
        buildPlan({ steps: [{ id: 'a', label: 'a', state: STATES.done }] }),
      ),
    ).toBeNull()
  })
})
