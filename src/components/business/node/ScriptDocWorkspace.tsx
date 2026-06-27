'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Clock,
  Film,
  Loader2,
  Lock,
  Mic,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Users,
  Wand2,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import type { LucideIcon } from 'lucide-react'

import { NODE_STUDIO_PLACEHOLDER_TOAST } from '@/constants/node-studio'
import {
  DEFAULT_SCRIPT_DOC_DEPTH,
  SCRIPT_DOC_DEPTHS,
  SCRIPT_DOC_DEPTH_IDS,
  SCRIPT_DOC_FOCUS_KIND_IDS,
  SCRIPT_DOC_LIMITS,
  SCRIPT_DOC_STAGE_IDS,
  type ScriptDocDepth,
  type ScriptDocStage,
} from '@/constants/script-doc'
import {
  addDialogue,
  addRole,
  addShot,
  applyFocusedResult,
  focusLockKeys,
  mergeLockedFields,
  removeDialogue,
  removeRole,
  removeShot,
  scriptDocLockKey,
  setDialogueLine,
  setDialogueSpeaker,
  setDocText,
  setRoleField,
  setShotField,
  type ScriptDocRoleField,
  type ScriptDocShotField,
  type ScriptDocTextField,
} from '@/lib/script-doc-edit'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { isTouchPrimary } from '@/lib/touch'
import { useNodeScriptDoc } from '@/hooks/use-node-script-doc'
import type { AssistantConversationMessage } from '@/hooks/use-assistant-conversation'
import type { AppLocale } from '@/i18n/routing'
import type {
  ScriptDoc,
  ScriptDocClarifyingQuestion,
  ScriptDocFocus,
} from '@/types/script-doc'

import { ClarifyingQuestionCard } from './ClarifyingQuestionCard'
import { useNodeWorkflowActions } from './NodeWorkflowActionsContext'

interface ScriptDocWorkspaceProps {
  scriptDoc: ScriptDoc | undefined
  messages: AssistantConversationMessage[]
  locale: AppLocale
  apiKeyId?: string
}

const TOAST_OPTIONS = {
  duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
  position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
} as const

type StepState = 'active' | 'done' | 'pending'

type WorkspaceView = 'edit' | 'read'

const VIEW_OPTIONS = [
  { id: 'edit', labelKey: 'scriptDocViewEdit' },
  { id: 'read', labelKey: 'scriptDocViewRead' },
] as const

const DEPTH_LABEL_KEYS: Record<ScriptDocDepth, string> = {
  [SCRIPT_DOC_DEPTH_IDS.simple]: 'scriptDocDepthSimple',
  [SCRIPT_DOC_DEPTH_IDS.standard]: 'scriptDocDepthStandard',
  [SCRIPT_DOC_DEPTH_IDS.cinematic]: 'scriptDocDepthCinematic',
}

const DEPTH_HINT_KEYS: Record<ScriptDocDepth, string> = {
  [SCRIPT_DOC_DEPTH_IDS.simple]: 'scriptDocDepthSimpleHint',
  [SCRIPT_DOC_DEPTH_IDS.standard]: 'scriptDocDepthStandardHint',
  [SCRIPT_DOC_DEPTH_IDS.cinematic]: 'scriptDocDepthCinematicHint',
}

/**
 * E1 expanded ⤢ right pane: the assistant's ScriptDoc made real.
 *
 * Two-gate flow — confirm OUTLINE (story), then SHOT breakdown (camera), then
 * project. A depth preset scales how much the script brain fills. Every field is
 * hand-editable (manual edits never call the LLM); fields the user touches are
 * locked so a whole-doc AI regeneration keeps them (`mergeLockedFields`).
 */
export function ScriptDocWorkspace({
  scriptDoc,
  messages,
  locale,
  apiKeyId,
}: ScriptDocWorkspaceProps) {
  const t = useTranslations('StudioNode.dock')
  const {
    setScriptDoc,
    applyScriptDocToGraph,
    focusGeneratedNodes,
    scriptDocStage,
    scriptDocDepth,
    scriptDocLocks,
    setScriptDocStage,
    setScriptDocDepth,
    setScriptDocLocks,
  } = useNodeWorkflowActions()
  const { draft, isDrafting, error } = useNodeScriptDoc()

  // Stage / depth / locks persist on the project state (survive reloads); only
  // the read-vs-edit view is ephemeral local UI.
  const stage = scriptDocStage ?? SCRIPT_DOC_STAGE_IDS.outline
  const depth = scriptDocDepth ?? DEFAULT_SCRIPT_DOC_DEPTH
  const [view, setView] = useState<WorkspaceView>('edit')
  const lockedKeys = useMemo<ReadonlySet<string>>(
    () => new Set(scriptDocLocks ?? []),
    [scriptDocLocks],
  )

  // Only non-empty turns are worth sending; the streaming placeholder carries
  // an empty content string until the first chunk lands.
  const apiMessages = useMemo(
    () =>
      messages
        .filter((message) => message.content.trim().length > 0)
        .map((message) => ({ role: message.role, content: message.content })),
    [messages],
  )

  const [pendingQuestions, setPendingQuestions] = useState<
    ScriptDocClarifyingQuestion[] | null
  >(null)
  const [answerTurns, setAnswerTurns] = useState<
    { role: 'user'; content: string }[]
  >([])

  const hasContent = Boolean(
    scriptDoc && (scriptDoc.roles.length > 0 || scriptDoc.shots.length > 0),
  )
  const shotsHaveCamera = Boolean(
    scriptDoc?.shots.some((shot) => (shot.camera?.trim().length ?? 0) > 0),
  )
  const isShotStage = stage === SCRIPT_DOC_STAGE_IDS.shots

  const lockField = useCallback(
    (key: string) => {
      if (lockedKeys.has(key)) return
      setScriptDocLocks([...lockedKeys, key])
    },
    [lockedKeys, setScriptDocLocks],
  )

  const unlockField = useCallback(
    (key: string) => {
      if (!lockedKeys.has(key)) return
      setScriptDocLocks([...lockedKeys].filter((existing) => existing !== key))
    },
    [lockedKeys, setScriptDocLocks],
  )

  // Hand-edit of a single field → persist + lock it (AI won't overwrite later).
  const handleCommitField = useCallback(
    (nextDoc: ScriptDoc, key: string) => {
      setScriptDoc(nextDoc)
      lockField(key)
    },
    [lockField, setScriptDoc],
  )

  // Add / remove a role, shot, or dialogue line — structural, never locked.
  const handleStructuralEdit = useCallback(
    (nextDoc: ScriptDoc) => {
      setScriptDoc(nextDoc)
    },
    [setScriptDoc],
  )

  // One draft round at the given stage/depth. A whole-doc draft keeps locked
  // fields via mergeLockedFields; a focus draft splices only the focused module.
  const runDraft = useCallback(
    async (
      stageToRun: ScriptDocStage,
      extraTurns: { role: 'user'; content: string }[],
      focus?: ScriptDocFocus,
    ) => {
      const result = await draft({
        messages: [...apiMessages, ...extraTurns],
        scriptDoc,
        stage: stageToRun,
        depth,
        focus,
        locale,
        apiKeyId,
      })
      if (!result) return
      if (result.kind === 'questions') {
        setPendingQuestions(result.questions)
        return
      }
      setPendingQuestions(null)

      // Focus edit: splice ONLY the focused module back in (deterministic), then
      // release that module's manual locks — the user asked AI to redo it.
      if (focus && scriptDoc) {
        setScriptDoc(applyFocusedResult(scriptDoc, result.scriptDoc, focus))
        const cleared = focusLockKeys(scriptDoc, focus)
        if (cleared.length > 0) {
          const clearedSet = new Set(cleared)
          setScriptDocLocks(
            [...lockedKeys].filter((key) => !clearedSet.has(key)),
          )
        }
        return
      }

      setScriptDoc(
        scriptDoc
          ? mergeLockedFields(result.scriptDoc, scriptDoc, lockedKeys)
          : result.scriptDoc,
      )
    },
    [
      apiKeyId,
      apiMessages,
      depth,
      draft,
      locale,
      lockedKeys,
      scriptDoc,
      setScriptDoc,
      setScriptDocLocks,
    ],
  )

  // Targeted edit from a module's ✨ box: roles edits run at the outline stage
  // (cast isn't a shot-stage concern); a shot edit uses the current stage so it
  // rewrites story in the outline stage and camera in the shot stage.
  const handleFocusEdit = useCallback(
    async (focus: ScriptDocFocus, instruction: string) => {
      const focusStage =
        focus.kind === SCRIPT_DOC_FOCUS_KIND_IDS.roles
          ? SCRIPT_DOC_STAGE_IDS.outline
          : stage
      await runDraft(
        focusStage,
        [{ role: 'user', content: instruction }],
        focus,
      )
    },
    [runDraft, stage],
  )

  const handleDraftOutline = useCallback(async () => {
    if (apiMessages.length === 0) {
      toast.info(t('scriptDocNeedChat'), TOAST_OPTIONS)
      return
    }
    setAnswerTurns([])
    await runDraft(SCRIPT_DOC_STAGE_IDS.outline, [])
  }, [apiMessages.length, runDraft, t])

  const handleBreakShots = useCallback(async () => {
    await runDraft(SCRIPT_DOC_STAGE_IDS.shots, [])
  }, [runDraft])

  const handleSubmitAnswers = useCallback(
    async (summary: string) => {
      const nextTurns = [
        ...answerTurns,
        { role: 'user' as const, content: summary },
      ]
      setAnswerTurns(nextTurns)
      setPendingQuestions(null)
      await runDraft(stage, nextTurns)
    },
    [answerTurns, runDraft, stage],
  )

  const handleConfirmOutline = useCallback(() => {
    if (!hasContent) {
      toast.info(t('scriptDocApplyEmpty'), TOAST_OPTIONS)
      return
    }
    setScriptDocStage(SCRIPT_DOC_STAGE_IDS.shots)
  }, [hasContent, setScriptDocStage, t])

  const handleApply = useCallback(() => {
    const result = applyScriptDocToGraph()
    if (result.refusal) {
      toast.info(t('scriptDocApplyEmpty'), TOAST_OPTIONS)
      return
    }
    if (
      result.created === 0 &&
      result.updated === 0 &&
      result.removed === 0 &&
      result.removedEdges === 0
    ) {
      toast.info(t('scriptDocApplyNothing'), TOAST_OPTIONS)
      return
    }
    focusGeneratedNodes?.()
    toast.success(
      t('scriptDocApplyResult', {
        created: result.created,
        updated: result.updated,
        removed: result.removed,
        skipped: result.skipped,
      }),
      TOAST_OPTIONS,
    )
  }, [applyScriptDocToGraph, focusGeneratedNodes, t])

  const steps: { key: string; label: string; state: StepState }[] = [
    {
      key: SCRIPT_DOC_STAGE_IDS.outline,
      label: t('scriptDocStepOutline'),
      state: isShotStage ? 'done' : 'active',
    },
    {
      key: SCRIPT_DOC_STAGE_IDS.shots,
      label: t('scriptDocStepShots'),
      state: isShotStage ? 'active' : 'pending',
    },
    { key: 'nodes', label: t('scriptDocStepNodes'), state: 'pending' },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b border-node-panel-inner px-4 py-3">
        <nav
          aria-label={t('scriptDoc')}
          className="flex items-center gap-1.5 text-2xs font-semibold"
        >
          {steps.map((step, index) => (
            <div key={step.key} className="flex items-center gap-1.5">
              {index > 0 ? (
                <ChevronRight className="size-3 text-node-subtle" aria-hidden />
              ) : null}
              <span
                className={cn(
                  'inline-flex items-center gap-1.5',
                  step.state === 'active'
                    ? 'text-node-foreground'
                    : 'text-node-subtle',
                )}
                aria-current={step.state === 'active' ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'inline-flex size-4 items-center justify-center rounded-full text-[10px]',
                    step.state === 'active' &&
                      'bg-node-foreground text-node-canvas',
                    step.state === 'done' &&
                      'bg-node-panel-inner text-node-foreground',
                    step.state === 'pending' &&
                      'border border-node-panel-inner text-node-subtle',
                  )}
                >
                  {step.state === 'done' ? (
                    <Check className="size-2.5" aria-hidden />
                  ) : (
                    index + 1
                  )}
                </span>
                {step.label}
              </span>
            </div>
          ))}
        </nav>

        <div>
          <div className="flex items-center justify-between gap-2">
            <div
              role="group"
              aria-label={t('scriptDocStepOutline')}
              className="inline-flex rounded-xl border border-node-panel-inner bg-node-panel-soft p-0.5"
            >
              {SCRIPT_DOC_DEPTHS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={depth === id}
                  onClick={() => setScriptDocDepth(id)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-2xs font-semibold transition-colors',
                    depth === id
                      ? 'bg-node-foreground text-node-canvas'
                      : 'text-node-muted hover:text-node-foreground',
                  )}
                >
                  {t(DEPTH_LABEL_KEYS[id])}
                </button>
              ))}
            </div>
            {scriptDoc && !pendingQuestions ? (
              <div
                role="group"
                aria-label={t('scriptDocViewRead')}
                className="inline-flex rounded-xl border border-node-panel-inner bg-node-panel-soft p-0.5"
              >
                {VIEW_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={view === option.id}
                    onClick={() => setView(option.id)}
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-2xs font-semibold transition-colors',
                      view === option.id
                        ? 'bg-node-foreground text-node-canvas'
                        : 'text-node-muted hover:text-node-foreground',
                    )}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <p className="mt-1.5 text-2xs leading-4 text-node-subtle">
            {t(DEPTH_HINT_KEYS[depth])}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {pendingQuestions ? (
          <ClarifyingQuestionCard
            questions={pendingQuestions}
            isSubmitting={isDrafting}
            onSubmit={handleSubmitAnswers}
          />
        ) : scriptDoc ? (
          view === 'read' ? (
            <ScriptDocReader scriptDoc={scriptDoc} />
          ) : (
            <ScriptDocEditor
              scriptDoc={scriptDoc}
              lockedKeys={lockedKeys}
              isDrafting={isDrafting}
              onCommitField={handleCommitField}
              onStructuralEdit={handleStructuralEdit}
              onUnlock={unlockField}
              onFocusEdit={handleFocusEdit}
            />
          )
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-semibold text-node-foreground">
              {t('scriptDocEmptyTitle')}
            </p>
            <p className="max-w-xs text-xs leading-5 text-node-subtle">
              {t('scriptDocEmptyHint')}
            </p>
          </div>
        )}

        {error ? (
          <div className="mt-3 flex gap-2 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs leading-5 text-red-100">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0">{error}</p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-node-panel-inner px-4 py-3">
        {isShotStage ? (
          <ShotStageActions
            isDrafting={isDrafting}
            hasContent={hasContent}
            onBack={() => setScriptDocStage(SCRIPT_DOC_STAGE_IDS.outline)}
            onBreak={handleBreakShots}
            onConfirm={handleApply}
            backLabel={t('scriptDocBackToOutline')}
            breakLabel={
              shotsHaveCamera
                ? t('scriptDocRebreakShots')
                : t('scriptDocBreakShots')
            }
            confirmLabel={t('scriptDocConfirmShots')}
          />
        ) : (
          <OutlineStageActions
            isDrafting={isDrafting}
            hasContent={hasContent}
            onDraft={handleDraftOutline}
            onConfirm={handleConfirmOutline}
            draftLabel={scriptDoc ? t('scriptDocUpdate') : t('scriptDocDraft')}
            confirmLabel={t('scriptDocConfirmOutline')}
          />
        )}
      </div>
    </div>
  )
}

interface ScriptDocEditorProps {
  scriptDoc: ScriptDoc
  lockedKeys: ReadonlySet<string>
  isDrafting: boolean
  onCommitField(nextDoc: ScriptDoc, key: string): void
  onStructuralEdit(nextDoc: ScriptDoc): void
  onUnlock(key: string): void
  onFocusEdit(focus: ScriptDocFocus, instruction: string): Promise<void>
}

function ScriptDocEditor({
  scriptDoc,
  lockedKeys,
  isDrafting,
  onCommitField,
  onStructuralEdit,
  onUnlock,
  onFocusEdit,
}: ScriptDocEditorProps) {
  const t = useTranslations('StudioNode.dock')
  const lockHint = t('scriptDocLockHint')
  const [focusTarget, setFocusTarget] = useState<ScriptDocFocus | null>(null)

  const handleFocusSubmit = async (focus: ScriptDocFocus, text: string) => {
    await onFocusEdit(focus, text)
    setFocusTarget(null)
  }

  const roleNameById = useMemo(
    () => new Map(scriptDoc.roles.map((role) => [role.id, role.name])),
    [scriptDoc.roles],
  )

  const fieldProps = (
    key: string,
    value: string,
    commit: (v: string) => void,
  ) => ({
    value,
    lockHint,
    locked: lockedKeys.has(key),
    onUnlock: () => onUnlock(key),
    onCommit: commit,
  })

  const docField = (field: ScriptDocTextField, value: string) => {
    const key = scriptDocLockKey.doc(field)
    return fieldProps(key, value, (v) =>
      onCommitField(setDocText(scriptDoc, field, v), key),
    )
  }
  const roleField = (
    roleId: string,
    field: ScriptDocRoleField,
    value: string,
  ) => {
    const key = scriptDocLockKey.role(roleId, field)
    return fieldProps(key, value, (v) =>
      onCommitField(setRoleField(scriptDoc, roleId, field, v), key),
    )
  }
  const shotField = (
    shotId: string,
    field: ScriptDocShotField,
    value: string,
  ) => {
    const key = scriptDocLockKey.shot(shotId, field)
    return fieldProps(key, value, (v) =>
      onCommitField(setShotField(scriptDoc, shotId, field, v), key),
    )
  }
  const lineField = (lineId: string, value: string) => {
    const key = scriptDocLockKey.line(lineId)
    return fieldProps(key, value, (v) =>
      onCommitField(setDialogueLine(scriptDoc, lineId, v), key),
    )
  }

  // Materialize an absent optional field (undefined → '') so it renders as an
  // editable input. Structural (unlocked): the user can then type it, or leave
  // it empty for the AI to fill on the next regeneration.
  const materializeDoc = (field: ScriptDocTextField) =>
    onStructuralEdit(setDocText(scriptDoc, field, ''))
  const materializeRole = (roleId: string, field: ScriptDocRoleField) =>
    onStructuralEdit(setRoleField(scriptDoc, roleId, field, ''))
  const materializeShot = (shotId: string, field: ScriptDocShotField) =>
    onStructuralEdit(setShotField(scriptDoc, shotId, field, ''))

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <EditableText
          {...docField('title', scriptDoc.title)}
          required
          ariaLabel={t('scriptDocFieldTitle')}
          placeholder={t('scriptDocFieldTitle')}
          maxLength={SCRIPT_DOC_LIMITS.titleMaxLength}
          className="text-base font-semibold leading-6"
        />
        <EditableText
          {...docField('logline', scriptDoc.logline)}
          multiline
          ariaLabel={t('scriptDocFieldLogline')}
          placeholder={t('scriptDocFieldLogline')}
          maxLength={SCRIPT_DOC_LIMITS.loglineMaxLength}
          className="text-xs leading-5 text-node-muted"
        />
        {scriptDoc.styleNote !== undefined ? (
          <EditableText
            {...docField('styleNote', scriptDoc.styleNote)}
            ariaLabel={t('scriptDocFieldStyle')}
            placeholder={t('scriptDocFieldStyle')}
            maxLength={SCRIPT_DOC_LIMITS.styleNoteMaxLength}
            className="text-2xs text-node-subtle"
          />
        ) : null}
        {scriptDoc.targetDuration !== undefined ? (
          <div className="flex items-center gap-1.5 text-2xs text-node-subtle">
            <Clock className="size-3 shrink-0" aria-hidden />
            <EditableText
              {...docField('targetDuration', scriptDoc.targetDuration)}
              ariaLabel={t('scriptDocFieldDuration')}
              placeholder={t('scriptDocFieldDuration')}
              maxLength={SCRIPT_DOC_LIMITS.targetDurationMaxLength}
              className="text-2xs"
            />
          </div>
        ) : null}
        {scriptDoc.background !== undefined ? (
          <div className="rounded-xl border border-node-panel-inner bg-node-panel-soft px-2 py-1.5">
            <p className="px-1.5 text-2xs font-semibold uppercase tracking-nav-dense text-node-subtle">
              {t('scriptDocBackgroundLabel')}
            </p>
            <EditableText
              {...docField('background', scriptDoc.background)}
              multiline
              ariaLabel={t('scriptDocBackgroundLabel')}
              placeholder={t('scriptDocBackgroundLabel')}
              maxLength={SCRIPT_DOC_LIMITS.backgroundMaxLength}
              className="text-2xs leading-4 text-node-muted"
            />
          </div>
        ) : null}
        <MissingFieldChips
          items={[
            scriptDoc.styleNote === undefined
              ? {
                  key: 'styleNote',
                  label: t('scriptDocFieldStyle'),
                  onAdd: () => materializeDoc('styleNote'),
                }
              : null,
            scriptDoc.background === undefined
              ? {
                  key: 'background',
                  label: t('scriptDocBackgroundLabel'),
                  onAdd: () => materializeDoc('background'),
                }
              : null,
            scriptDoc.targetDuration === undefined
              ? {
                  key: 'targetDuration',
                  label: t('scriptDocFieldDuration'),
                  onAdd: () => materializeDoc('targetDuration'),
                }
              : null,
          ]}
        />
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
            <Users className="size-3.5" />
            {t('scriptDocRolesLabel', { count: scriptDoc.roles.length })}
          </div>
          <div className="flex items-center gap-1">
            <FocusButton
              label={t('scriptDocFocusButton')}
              active={focusTarget?.kind === SCRIPT_DOC_FOCUS_KIND_IDS.roles}
              disabled={isDrafting}
              onClick={() =>
                setFocusTarget((prev) =>
                  prev?.kind === SCRIPT_DOC_FOCUS_KIND_IDS.roles
                    ? null
                    : { kind: SCRIPT_DOC_FOCUS_KIND_IDS.roles },
                )
              }
            />
            <AddButton
              label={t('scriptDocAddRole')}
              onClick={() =>
                onStructuralEdit(addRole(scriptDoc, t('scriptDocNewRole')))
              }
            />
          </div>
        </div>
        {focusTarget?.kind === SCRIPT_DOC_FOCUS_KIND_IDS.roles ? (
          <FocusBox
            placeholder={t('scriptDocFocusPlaceholder')}
            sendLabel={t('scriptDocFocusSend')}
            cancelLabel={t('scriptDocFocusCancel')}
            onSubmit={(text) =>
              handleFocusSubmit({ kind: SCRIPT_DOC_FOCUS_KIND_IDS.roles }, text)
            }
            onCancel={() => setFocusTarget(null)}
          />
        ) : null}
        <div className="space-y-1.5">
          {scriptDoc.roles.map((role) => (
            <div
              key={role.id}
              className="rounded-xl border border-node-panel-inner bg-node-panel-soft px-2 py-2"
            >
              <div className="flex items-start gap-1">
                <EditableText
                  {...roleField(role.id, 'name', role.name)}
                  required
                  ariaLabel={t('scriptDocFieldRoleName')}
                  placeholder={t('scriptDocFieldRoleName')}
                  maxLength={SCRIPT_DOC_LIMITS.fieldMaxLength}
                  className="flex-1 text-sm font-semibold"
                />
                <DeleteButton
                  label={t('scriptDocDelete')}
                  onClick={() =>
                    onStructuralEdit(removeRole(scriptDoc, role.id))
                  }
                />
              </div>
              <EditableText
                {...roleField(role.id, 'description', role.description)}
                multiline
                ariaLabel={t('scriptDocFieldRoleDescription')}
                placeholder={t('scriptDocFieldRoleDescription')}
                maxLength={SCRIPT_DOC_LIMITS.fieldMaxLength}
                className="text-2xs leading-4 text-node-muted"
              />
              {role.personality !== undefined ? (
                <EditableText
                  {...roleField(role.id, 'personality', role.personality)}
                  multiline
                  ariaLabel={t('scriptDocFieldRolePersonality')}
                  placeholder={t('scriptDocFieldRolePersonality')}
                  maxLength={SCRIPT_DOC_LIMITS.fieldMaxLength}
                  className="text-2xs leading-4 text-node-subtle"
                />
              ) : null}
              {role.goal !== undefined ? (
                <EditableText
                  {...roleField(role.id, 'goal', role.goal)}
                  multiline
                  ariaLabel={t('scriptDocFieldRoleGoal')}
                  placeholder={t('scriptDocFieldRoleGoal')}
                  maxLength={SCRIPT_DOC_LIMITS.fieldMaxLength}
                  className="text-2xs leading-4 text-node-subtle"
                />
              ) : null}
              <MissingFieldChips
                items={[
                  role.personality === undefined
                    ? {
                        key: 'personality',
                        label: t('scriptDocFieldRolePersonality'),
                        onAdd: () => materializeRole(role.id, 'personality'),
                      }
                    : null,
                  role.goal === undefined
                    ? {
                        key: 'goal',
                        label: t('scriptDocFieldRoleGoal'),
                        onAdd: () => materializeRole(role.id, 'goal'),
                      }
                    : null,
                ]}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
            <Film className="size-3.5" />
            {t('scriptDocShotsLabel', { count: scriptDoc.shots.length })}
          </div>
          <AddButton
            label={t('scriptDocAddShot')}
            onClick={() =>
              onStructuralEdit(addShot(scriptDoc, t('scriptDocNewShot')))
            }
          />
        </div>
        <div className="space-y-2">
          {scriptDoc.shots.map((shot, index) => (
            <div
              key={shot.id}
              className="space-y-2 rounded-xl border border-node-panel-inner bg-node-panel-soft px-2 py-2.5"
            >
              <div className="flex items-start gap-1.5">
                <span className="mt-1.5 text-2xs font-semibold text-node-subtle">
                  {index + 1}
                </span>
                <EditableText
                  {...shotField(shot.id, 'summary', shot.summary)}
                  required
                  multiline
                  ariaLabel={t('scriptDocFieldShotSummary')}
                  placeholder={t('scriptDocFieldShotSummary')}
                  maxLength={SCRIPT_DOC_LIMITS.fieldMaxLength}
                  className="flex-1 text-xs leading-5 text-node-foreground"
                />
                <FocusButton
                  label={t('scriptDocFocusButton')}
                  active={
                    focusTarget?.kind === SCRIPT_DOC_FOCUS_KIND_IDS.shot &&
                    focusTarget.id === shot.id
                  }
                  disabled={isDrafting}
                  onClick={() =>
                    setFocusTarget((prev) =>
                      prev?.kind === SCRIPT_DOC_FOCUS_KIND_IDS.shot &&
                      prev.id === shot.id
                        ? null
                        : { kind: SCRIPT_DOC_FOCUS_KIND_IDS.shot, id: shot.id },
                    )
                  }
                />
                <DeleteButton
                  label={t('scriptDocDelete')}
                  onClick={() =>
                    onStructuralEdit(removeShot(scriptDoc, shot.id))
                  }
                />
              </div>
              {focusTarget?.kind === SCRIPT_DOC_FOCUS_KIND_IDS.shot &&
              focusTarget.id === shot.id ? (
                <FocusBox
                  placeholder={t('scriptDocFocusPlaceholder')}
                  sendLabel={t('scriptDocFocusSend')}
                  cancelLabel={t('scriptDocFocusCancel')}
                  onSubmit={(text) =>
                    handleFocusSubmit(
                      { kind: SCRIPT_DOC_FOCUS_KIND_IDS.shot, id: shot.id },
                      text,
                    )
                  }
                  onCancel={() => setFocusTarget(null)}
                />
              ) : null}
              {shot.emotion !== undefined ? (
                <EditableText
                  {...shotField(shot.id, 'emotion', shot.emotion)}
                  ariaLabel={t('scriptDocFieldShotEmotion')}
                  placeholder={t('scriptDocFieldShotEmotion')}
                  maxLength={SCRIPT_DOC_LIMITS.emotionMaxLength}
                  className="text-[10px] text-node-subtle"
                />
              ) : null}
              {shot.camera !== undefined ? (
                <EditableText
                  {...shotField(shot.id, 'camera', shot.camera)}
                  multiline
                  ariaLabel={t('scriptDocFieldShotCamera')}
                  placeholder={t('scriptDocFieldShotCamera')}
                  maxLength={SCRIPT_DOC_LIMITS.fieldMaxLength}
                  className="text-2xs leading-4 text-node-subtle"
                />
              ) : null}
              <MissingFieldChips
                items={[
                  shot.emotion === undefined
                    ? {
                        key: 'emotion',
                        label: t('scriptDocFieldShotEmotion'),
                        onAdd: () => materializeShot(shot.id, 'emotion'),
                      }
                    : null,
                  shot.camera === undefined
                    ? {
                        key: 'camera',
                        label: t('scriptDocFieldShotCamera'),
                        onAdd: () => materializeShot(shot.id, 'camera'),
                      }
                    : null,
                ]}
              />
              <div className="space-y-1 border-t border-node-panel-inner pt-2">
                {shot.dialogue.map((line) => {
                  const speakerExists = scriptDoc.roles.some(
                    (role) => role.id === line.speakerRoleId,
                  )
                  return (
                    <div key={line.id} className="flex items-start gap-1">
                      <Mic
                        className="mt-1.5 size-3 shrink-0 text-node-subtle"
                        aria-hidden
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <select
                          aria-label={t('scriptDocFieldSpeaker')}
                          value={line.speakerRoleId}
                          onChange={(event) =>
                            onStructuralEdit(
                              setDialogueSpeaker(
                                scriptDoc,
                                line.id,
                                event.target.value,
                              ),
                            )
                          }
                          className="w-fit rounded-md bg-transparent px-1 py-0.5 text-2xs font-semibold text-node-foreground outline-none hover:bg-node-panel-inner/40 focus:bg-node-panel-inner/60"
                        >
                          {scriptDoc.roles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                          {speakerExists ? null : (
                            <option value={line.speakerRoleId}>
                              {roleNameById.get(line.speakerRoleId) ??
                                line.speakerRoleId}
                            </option>
                          )}
                        </select>
                        <EditableText
                          {...lineField(line.id, line.line)}
                          required
                          ariaLabel={t('scriptDocFieldLine')}
                          placeholder={t('scriptDocFieldLine')}
                          maxLength={SCRIPT_DOC_LIMITS.lineMaxLength}
                          className="text-2xs leading-4 text-node-muted"
                        />
                      </div>
                      <DeleteButton
                        label={t('scriptDocDelete')}
                        onClick={() =>
                          onStructuralEdit(
                            removeDialogue(scriptDoc, shot.id, line.id),
                          )
                        }
                      />
                    </div>
                  )
                })}
                {scriptDoc.roles.length > 0 ? (
                  <AddButton
                    label={t('scriptDocAddLine')}
                    onClick={() =>
                      onStructuralEdit(
                        addDialogue(
                          scriptDoc,
                          shot.id,
                          scriptDoc.roles[0]!.id,
                          t('scriptDocNewLine'),
                        ),
                      )
                    }
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

/**
 * Read-through view: the ScriptDoc rendered top-to-bottom like a screenplay so
 * the creator can judge it as a script, not a form. Read-only — editing lives
 * in the card view.
 */
function ScriptDocReader({ scriptDoc }: { scriptDoc: ScriptDoc }) {
  const t = useTranslations('StudioNode.dock')
  const roleNameById = useMemo(
    () => new Map(scriptDoc.roles.map((role) => [role.id, role.name])),
    [scriptDoc.roles],
  )

  return (
    <article className="space-y-4">
      <header className="space-y-1">
        <h3 className="text-base font-semibold leading-6 text-node-foreground">
          {scriptDoc.title}
        </h3>
        {scriptDoc.logline ? (
          <p className="text-xs leading-5 text-node-muted">
            {scriptDoc.logline}
          </p>
        ) : null}
        {scriptDoc.targetDuration ? (
          <p className="text-2xs text-node-subtle">
            {scriptDoc.targetDuration}
          </p>
        ) : null}
      </header>

      {scriptDoc.styleNote ? (
        <p className="text-2xs italic leading-4 text-node-subtle">
          {scriptDoc.styleNote}
        </p>
      ) : null}
      {scriptDoc.background ? (
        <p className="text-2xs leading-4 text-node-muted">
          {scriptDoc.background}
        </p>
      ) : null}

      {scriptDoc.roles.length > 0 ? (
        <p className="text-2xs leading-4 text-node-subtle">
          <span className="font-semibold text-node-muted">
            {t('scriptDocRolesLabel', { count: scriptDoc.roles.length })}
          </span>
          {' — '}
          {scriptDoc.roles.map((role) => role.name).join(' · ')}
        </p>
      ) : null}

      <div className="space-y-3">
        {scriptDoc.shots.map((shot, index) => (
          <section key={shot.id} className="space-y-1">
            <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
              {`${t('scriptDocStepShots')} ${index + 1}`}
              {shot.sceneLabel ? ` · ${shot.sceneLabel}` : ''}
            </p>
            <p className="text-xs leading-5 text-node-foreground">
              {shot.summary}
            </p>
            {shot.emotion ? (
              <p className="text-[10px] text-node-subtle">{shot.emotion}</p>
            ) : null}
            {shot.camera ? (
              <p className="text-2xs italic leading-4 text-node-subtle">
                {shot.camera}
              </p>
            ) : null}
            {shot.dialogue.length > 0 ? (
              <div className="space-y-1.5 pl-4 pt-0.5">
                {shot.dialogue.map((line) => (
                  <div key={line.id}>
                    <p className="text-2xs font-semibold text-node-foreground">
                      {roleNameById.get(line.speakerRoleId) ??
                        line.speakerRoleId}
                    </p>
                    <p className="text-2xs leading-4 text-node-muted">
                      {line.line}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </article>
  )
}

function EditableText({
  value,
  onCommit,
  ariaLabel,
  placeholder,
  multiline = false,
  required = false,
  maxLength,
  locked = false,
  onUnlock,
  lockHint,
  className,
}: {
  value: string
  onCommit(value: string): void
  ariaLabel: string
  placeholder?: string
  multiline?: boolean
  required?: boolean
  maxLength?: number
  locked?: boolean
  onUnlock?(): void
  lockHint?: string
  className?: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    setDraft(value)
  }, [value])

  const commit = () => {
    if (required && draft.trim().length === 0) {
      setDraft(value)
      return
    }
    if (draft !== value) onCommit(draft)
  }

  const fieldClass = cn(
    'w-full rounded-md bg-transparent px-1.5 py-1 text-node-foreground outline-none transition-colors placeholder:text-node-subtle hover:bg-node-panel-inner/40 focus:bg-node-panel-inner/60 focus:ring-1 focus:ring-node-edge',
    locked && 'pr-6',
    className,
  )

  return (
    <div className="relative">
      {multiline ? (
        <textarea
          aria-label={ariaLabel}
          value={draft}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={1}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          ref={(el) => {
            if (el) {
              el.style.height = 'auto'
              el.style.height = `${el.scrollHeight}px`
            }
          }}
          onInput={(event) => {
            const el = event.currentTarget
            el.style.height = 'auto'
            el.style.height = `${el.scrollHeight}px`
          }}
          className={cn(fieldClass, 'resize-none')}
        />
      ) : (
        <input
          aria-label={ariaLabel}
          value={draft}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
          className={fieldClass}
        />
      )}
      {locked && onUnlock ? (
        <button
          type="button"
          onClick={onUnlock}
          aria-label={lockHint}
          title={lockHint}
          className="absolute right-1 top-1 inline-flex size-4 items-center justify-center rounded text-node-subtle hover:text-node-foreground"
        >
          <Lock className="size-3" />
        </button>
      ) : null}
    </div>
  )
}

interface ChipItem {
  key: string
  label: string
  onAdd(): void
}

/** Compact "＋ field" chips for optional fields the doc doesn't carry yet, so a
 * leaner depth can still gain any field by hand (progressive disclosure). */
function MissingFieldChips({ items }: { items: (ChipItem | null)[] }) {
  const present = items.filter((item): item is ChipItem => item !== null)
  if (present.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 pt-0.5">
      {present.map((item) => (
        <AddButton key={item.key} label={item.label} onClick={item.onAdd} />
      ))}
    </div>
  )
}

function FocusButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string
  active: boolean
  disabled?: boolean
  onClick(): void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-40',
        active
          ? 'bg-node-foreground text-node-canvas'
          : 'text-node-subtle hover:bg-node-panel-inner hover:text-node-foreground',
      )}
    >
      <Sparkles className="size-3.5" />
    </button>
  )
}

/** Inline instruction box for a targeted AI edit. Manages its own busy state by
 * awaiting onSubmit; the parent closes it once the promise resolves. */
function FocusBox({
  placeholder,
  sendLabel,
  cancelLabel,
  onSubmit,
  onCancel,
}: {
  placeholder: string
  sendLabel: string
  cancelLabel: string
  onSubmit(text: string): Promise<void>
  onCancel(): void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setBusy(true)
    await onSubmit(trimmed)
    setBusy(false)
  }

  return (
    <div className="flex items-start gap-1 rounded-xl border border-node-edge bg-node-panel-soft p-1.5">
      <textarea
        autoFocus={!isTouchPrimary()}
        value={text}
        rows={1}
        placeholder={placeholder}
        maxLength={SCRIPT_DOC_LIMITS.maxMessageLength}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void submit()
          }
        }}
        className="min-h-7 flex-1 resize-none rounded-md bg-transparent px-1.5 py-1 text-2xs text-node-foreground outline-none placeholder:text-node-subtle"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || text.trim().length === 0}
        aria-label={sendLabel}
        title={sendLabel}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-lg bg-node-foreground text-node-canvas disabled:bg-node-panel-inner disabled:text-node-subtle"
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Send className="size-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label={cancelLabel}
        title={cancelLabel}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-lg text-node-subtle hover:bg-node-panel-inner hover:text-node-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

function AddButton({ label, onClick }: { label: string; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border border-node-panel-inner px-2 py-0.5 text-2xs font-semibold text-node-muted transition-colors hover:border-node-edge hover:text-node-foreground"
    >
      <Plus className="size-3" aria-hidden />
      {label}
    </button>
  )
}

function DeleteButton({ label, onClick }: { label: string; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-lg text-node-subtle transition-colors hover:bg-node-panel-inner hover:text-red-300"
    >
      <Trash2 className="size-3.5" />
    </button>
  )
}

const SECONDARY_BUTTON_CLASS =
  'h-10 flex-1 rounded-2xl border border-node-panel-inner bg-node-panel-soft text-xs font-semibold text-node-foreground hover:border-node-edge hover:bg-node-panel-inner disabled:text-node-subtle'

const PRIMARY_BUTTON_CLASS =
  'h-10 flex-1 rounded-2xl bg-node-foreground text-xs font-semibold text-node-canvas hover:bg-node-foreground/90 disabled:bg-node-panel-inner disabled:text-node-subtle'

function OutlineStageActions({
  isDrafting,
  hasContent,
  onDraft,
  onConfirm,
  draftLabel,
  confirmLabel,
}: {
  isDrafting: boolean
  hasContent: boolean
  onDraft(): void
  onConfirm(): void
  draftLabel: string
  confirmLabel: string
}) {
  return (
    <>
      <Button
        type="button"
        onClick={onDraft}
        disabled={isDrafting}
        className={SECONDARY_BUTTON_CLASS}
      >
        {isDrafting ? (
          <Loader2 className="mr-1.5 size-4 animate-spin" />
        ) : (
          <Wand2 className="mr-1.5 size-4" />
        )}
        {draftLabel}
      </Button>
      <Button
        type="button"
        onClick={onConfirm}
        disabled={!hasContent || isDrafting}
        className={PRIMARY_BUTTON_CLASS}
      >
        {confirmLabel}
        <ArrowRight className="ml-1.5 size-4" />
      </Button>
    </>
  )
}

function ShotStageActions({
  isDrafting,
  hasContent,
  onBack,
  onBreak,
  onConfirm,
  backLabel,
  breakLabel,
  confirmLabel,
}: {
  isDrafting: boolean
  hasContent: boolean
  onBack(): void
  onBreak(): void
  onConfirm(): void
  backLabel: string
  breakLabel: string
  confirmLabel: string
}) {
  const BreakIcon: LucideIcon = isDrafting ? Loader2 : Wand2
  return (
    <>
      <Button
        type="button"
        onClick={onBack}
        aria-label={backLabel}
        title={backLabel}
        className="h-10 rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 text-node-muted hover:border-node-edge hover:bg-node-panel-inner"
      >
        <ArrowLeft className="size-4" />
      </Button>
      <Button
        type="button"
        onClick={onBreak}
        disabled={isDrafting}
        className={SECONDARY_BUTTON_CLASS}
      >
        <BreakIcon
          className={cn('mr-1.5 size-4', isDrafting && 'animate-spin')}
        />
        {breakLabel}
      </Button>
      <Button
        type="button"
        onClick={onConfirm}
        disabled={!hasContent || isDrafting}
        className={PRIMARY_BUTTON_CLASS}
      >
        <Sparkles className="mr-1.5 size-4" />
        {confirmLabel}
      </Button>
    </>
  )
}
