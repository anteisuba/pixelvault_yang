'use client'

import { useState, useCallback } from 'react'

import { generationFeedbackAPI } from '@/lib/api-client'
import type { ConversationMessage } from '@/types'

interface ConversationState {
  isLoading: boolean
  messages: ConversationMessage[]
  refinedPrompt: string | null
  negativeAdditions: string[]
  done: boolean
  error: string | null
}

const INITIAL_STATE: ConversationState = {
  isLoading: false,
  messages: [],
  refinedPrompt: null,
  negativeAdditions: [],
  done: false,
  error: null,
}

export function useGenerationFeedback() {
  const [state, setState] = useState<ConversationState>(INITIAL_STATE)

  /** Start the conversation — AI analyzes the image and asks first questions */
  const startConversation = useCallback(
    async (
      imageUrl: string,
      originalPrompt: string,
      locale: string,
      apiKeyId?: string,
    ) => {
      setState({ ...INITIAL_STATE, isLoading: true })

      const response = await generationFeedbackAPI({
        imageUrl,
        originalPrompt,
        messages: [],
        locale,
        apiKeyId,
      })

      if (response.success && response.data) {
        const aiMessage: ConversationMessage = {
          role: 'assistant',
          content: response.data.reply,
        }
        setState({
          isLoading: false,
          messages: [aiMessage],
          refinedPrompt: response.data.refinedPrompt,
          negativeAdditions: response.data.negativeAdditions,
          done: response.data.done,
          error: null,
        })
      } else {
        setState({
          ...INITIAL_STATE,
          error: response.error ?? 'Failed to start conversation',
        })
      }
    },
    [],
  )

  /** Send a user reply and get AI's next response */
  const sendReply = useCallback(
    async (
      imageUrl: string,
      originalPrompt: string,
      userMessage: string,
      locale: string,
      apiKeyId?: string,
    ) => {
      const userMsg: ConversationMessage = {
        role: 'user',
        content: userMessage,
      }
      const updatedMessages = [...state.messages, userMsg]

      setState((prev) => ({
        ...prev,
        isLoading: true,
        messages: updatedMessages,
        error: null,
      }))

      const response = await generationFeedbackAPI({
        imageUrl,
        originalPrompt,
        messages: updatedMessages,
        locale,
        apiKeyId,
      })

      if (response.success && response.data) {
        const aiMessage: ConversationMessage = {
          role: 'assistant',
          content: response.data.reply,
        }
        setState((prev) => ({
          isLoading: false,
          messages: [...prev.messages, aiMessage],
          refinedPrompt: response.data!.refinedPrompt,
          negativeAdditions: response.data!.negativeAdditions,
          done: response.data!.done,
          error: null,
        }))
      } else {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: response.error ?? 'Failed to get response',
        }))
      }
    },
    [state.messages],
  )

  const reset = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  return {
    ...state,
    startConversation,
    sendReply,
    reset,
  }
}
