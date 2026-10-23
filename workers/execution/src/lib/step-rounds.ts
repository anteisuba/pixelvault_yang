import type { WorkflowStep } from 'cloudflare:workers'

/**
 * 同一段步骤要再跑一轮时用：Workflows 按步骤名缓存结果，名字不变引擎只会把上一轮
 * 的结果原样还回来。给每个步骤名加个后缀，这一轮才是真的重跑。
 */
export function suffixStepNames(
  step: WorkflowStep,
  suffix: string,
): WorkflowStep {
  return {
    do: ((name: string, ...rest: unknown[]) =>
      (step.do as (...args: unknown[]) => Promise<unknown>)(
        `${name}${suffix}`,
        ...rest,
      )) as WorkflowStep['do'],
    sleep: (name, duration) => step.sleep(`${name}${suffix}`, duration),
  }
}
