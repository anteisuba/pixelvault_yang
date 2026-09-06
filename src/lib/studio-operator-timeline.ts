import { ASSISTANT_OPERATOR_TOOL_IDS } from '@/constants/assistant-operator'

export function isOperatorResearchTool(tool: string): boolean {
  return (
    tool === ASSISTANT_OPERATOR_TOOL_IDS.searchWeb ||
    tool === ASSISTANT_OPERATOR_TOOL_IDS.readState ||
    tool === ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders ||
    tool === ASSISTANT_OPERATOR_TOOL_IDS.readProjectRules
  )
}

export type OperatorTimelinePresentation = 'research' | 'message' | 'result'

export function groupOperatorResearch(
  kinds: readonly OperatorTimelinePresentation[],
) {
  const folded = kinds.map((kind) => kind === 'research')
  for (let index = kinds.length - 2; index >= 0; index--) {
    if (kinds[index] === 'message' && folded[index + 1]) folded[index] = true
  }
  const groups: { research: boolean; indexes: number[] }[] = []
  for (let index = 0; index < kinds.length; index++) {
    const research = folded[index] ?? false
    const previous = groups.at(-1)
    if (research && previous?.research) previous.indexes.push(index)
    else groups.push({ research, indexes: [index] })
  }
  return groups
}
