import type { UserApiKeyRecord } from '@/types'

type DefaultCandidate = Pick<UserApiKeyRecord, 'isDefault' | 'createdAt'>

/**
 * 一组 key 里算默认的那把：用户标过的 › 最新的。设置页的「默认」小标与生成时
 * 字节走哪一站共用这一条（`docs/design/bytedance-channel.md`），⛔ 别处另写顺序。
 */
export function pickDefaultApiKey<T extends DefaultCandidate>(
  keys: readonly T[],
): T | undefined {
  const marked = keys.find((key) => key.isDefault)
  if (marked) return marked
  return [...keys].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )[0]
}
