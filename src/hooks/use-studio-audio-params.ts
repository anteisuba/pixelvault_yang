'use client'

import { useCallback, useMemo } from 'react'

import { useStudioForm } from '@/contexts/studio-context'
import type { StudioAudioAdvancedSettings } from '@/components/business/studio/StudioAudioParams'

/**
 * 把 `StudioAudioParams` 那 40 个受控 props 拼出来，从 context 读、往 reducer 写。
 *
 * ## 为什么要有这个 hook
 *
 * 这坨拼装以前整段长在 `StudioDockPanelArea` 里 —— 一个 `onChangeAdvanced` 展开成
 * 14 个 `if (settings.x !== undefined) dispatch(...)`，占了那个文件三分之一。
 * 只要参数面板换个宿主（2026-08-23 切片 D：朗读进浮层、停顿与高级各进一个折叠
 * 行、声音那页跟着音色库），这坨就得跟着复制一遍 —— 复制几份就漂移几份。
 *
 * ⚠ 组件仍是受控的（props 进、回调出），没有改成直接读 context：它同时被工作台
 * 参数栏与音色库面板消费，受控接口是它能被搬来搬去的原因，不是负担。真正的负担
 * 是**拼装散落在宿主里**，所以搬的是拼装。
 */
export function useStudioAudioParamsProps() {
  const { state, dispatch } = useStudioForm()

  const advanced = useMemo<StudioAudioAdvancedSettings>(
    () => ({
      style: state.audioEmotion,
      volume: state.audioVolume,
      normalizeLoudness: state.audioNormalizeLoudness,
      normalizeText: state.audioNormalizeText,
      withTimestamps: state.audioWithTimestamps,
      format: state.audioFormat,
      sampleRate: state.audioSampleRate,
      mp3Bitrate: state.audioMp3Bitrate,
      opusBitrate: state.audioOpusBitrate,
      latency: state.audioLatency,
      temperature: state.audioTemperature,
      topP: state.audioTopP,
      chunkLength: state.audioChunkLength,
      repetitionPenalty: state.audioRepetitionPenalty,
      speakerVoiceIds: state.audioSpeakerVoiceIds,
    }),
    [
      state.audioEmotion,
      state.audioVolume,
      state.audioNormalizeLoudness,
      state.audioNormalizeText,
      state.audioWithTimestamps,
      state.audioFormat,
      state.audioSampleRate,
      state.audioMp3Bitrate,
      state.audioOpusBitrate,
      state.audioLatency,
      state.audioTemperature,
      state.audioTopP,
      state.audioChunkLength,
      state.audioRepetitionPenalty,
      state.audioSpeakerVoiceIds,
    ],
  )

  /**
   * 一次可能带来任意几个字段 —— 逐字段判 `!== undefined` 再派发。
   *
   * ⚠ 不能把整个 settings 一把 dispatch：每个字段是独立的 reducer action，
   * 而且 `undefined` 与「设成默认值」是两回事，合并会把没动过的字段一起改写。
   */
  const onChangeAdvanced = useCallback(
    (settings: Partial<StudioAudioAdvancedSettings>) => {
      if (settings.style !== undefined) {
        dispatch({ type: 'SET_AUDIO_EMOTION', payload: settings.style })
      }
      if (settings.volume !== undefined) {
        dispatch({ type: 'SET_AUDIO_VOLUME', payload: settings.volume })
      }
      if (settings.normalizeLoudness !== undefined) {
        dispatch({
          type: 'SET_AUDIO_NORMALIZE_LOUDNESS',
          payload: settings.normalizeLoudness,
        })
      }
      if (settings.normalizeText !== undefined) {
        dispatch({
          type: 'SET_AUDIO_NORMALIZE_TEXT',
          payload: settings.normalizeText,
        })
      }
      if (settings.withTimestamps !== undefined) {
        dispatch({
          type: 'SET_AUDIO_WITH_TIMESTAMPS',
          payload: settings.withTimestamps,
        })
      }
      if (settings.format !== undefined) {
        dispatch({ type: 'SET_AUDIO_FORMAT', payload: settings.format })
      }
      if (settings.sampleRate !== undefined) {
        dispatch({
          type: 'SET_AUDIO_SAMPLE_RATE',
          payload: settings.sampleRate,
        })
      }
      if (settings.mp3Bitrate !== undefined) {
        dispatch({
          type: 'SET_AUDIO_MP3_BITRATE',
          payload: settings.mp3Bitrate,
        })
      }
      if (settings.opusBitrate !== undefined) {
        dispatch({
          type: 'SET_AUDIO_OPUS_BITRATE',
          payload: settings.opusBitrate,
        })
      }
      if (settings.latency !== undefined) {
        dispatch({ type: 'SET_AUDIO_LATENCY', payload: settings.latency })
      }
      if (settings.temperature !== undefined) {
        dispatch({
          type: 'SET_AUDIO_TEMPERATURE',
          payload: settings.temperature,
        })
      }
      if (settings.topP !== undefined) {
        dispatch({ type: 'SET_AUDIO_TOP_P', payload: settings.topP })
      }
      if (settings.chunkLength !== undefined) {
        dispatch({
          type: 'SET_AUDIO_CHUNK_LENGTH',
          payload: settings.chunkLength,
        })
      }
      if (settings.repetitionPenalty !== undefined) {
        dispatch({
          type: 'SET_AUDIO_REPETITION_PENALTY',
          payload: settings.repetitionPenalty,
        })
      }
      if (settings.speakerVoiceIds !== undefined) {
        dispatch({
          type: 'SET_AUDIO_SPEAKER_VOICE_IDS',
          payload: settings.speakerVoiceIds,
        })
      }
    },
    [dispatch],
  )

  const onChangePace = useCallback(
    (pace: string) => dispatch({ type: 'SET_AUDIO_PACE', payload: pace }),
    [dispatch],
  )
  const onChangeExpressiveness = useCallback(
    (value: string) =>
      dispatch({ type: 'SET_AUDIO_EXPRESSIVENESS', payload: value }),
    [dispatch],
  )
  const onChangePauseMarkers = useCallback(
    (markers: string[]) =>
      dispatch({ type: 'SET_AUDIO_PAUSE_MARKERS', payload: markers }),
    [dispatch],
  )
  const onChangeAudioReferenceUpload = useCallback(
    (payload: { url: string; fileName: string } | null) =>
      dispatch({ type: 'SET_AUDIO_REFERENCE_UPLOAD', payload }),
    [dispatch],
  )
  const onChangeAudioReferenceText = useCallback(
    (text: string) =>
      dispatch({ type: 'SET_AUDIO_REFERENCE_TEXT', payload: text }),
    [dispatch],
  )

  return {
    voiceCardId: state.voiceCardId,
    pace: state.audioPace,
    expressiveness: state.audioExpressiveness,
    pauseMarkers: state.audioPauseMarkers,
    advanced,
    onChangePace,
    onChangeExpressiveness,
    onChangePauseMarkers,
    onChangeAdvanced,
    audioReferenceUrl: state.audioReferenceUrl,
    audioReferenceFileName: state.audioReferenceFileName,
    audioReferenceText: state.audioReferenceText,
    onChangeAudioReferenceUpload,
    onChangeAudioReferenceText,
  }
}
