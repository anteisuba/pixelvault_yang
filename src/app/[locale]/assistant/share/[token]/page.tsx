'use client'

import { useEffect, useState } from 'react'

import { getSharedAssistantConversationAPI } from '@/lib/api-client/assistant-conversation'
import type { SharedAssistantConversationRecord } from '@/types/assistant-conversation'

export default function AssistantSharePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>
}) {
  const [token, setToken] = useState<string | null>(null)
  const [locale, setLocale] = useState('en')
  const [conversation, setConversation] =
    useState<SharedAssistantConversationRecord | null>(null)
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')

  useEffect(() => {
    let active = true
    void params.then(({ locale: nextLocale, token: nextToken }) => {
      if (!active) return
      setLocale(nextLocale)
      setToken(nextToken)
      void getSharedAssistantConversationAPI(nextToken).then((result) => {
        if (!active) return
        if (!result.success) {
          setStatus('error')
          return
        }
        setConversation(result.data)
        setStatus('ready')
      })
    })
    return () => {
      active = false
    }
  }, [params])

  const copy =
    locale === 'zh'
      ? {
          title: '历史对话',
          share: '分享只读链接',
          loading: '正在加载对话…',
          error: '此助手分享链接已失效',
          user: '用户',
          assistant: '助手',
        }
      : locale === 'ja'
        ? {
            title: '会話履歴',
            share: '読み取り専用リンクを共有',
            loading: '会話を読み込んでいます…',
            error: 'このアシスタント共有リンクは利用できません',
            user: 'ユーザー',
            assistant: 'アシスタント',
          }
        : {
            title: 'Conversation history',
            share: 'Share read-only link',
            loading: 'Loading conversation…',
            error: 'This assistant share link is no longer available',
            user: 'User',
            assistant: 'Assistant',
          }

  return (
    <main className="min-h-svh bg-background px-4 py-8 text-foreground sm:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 border-b border-border/60 pb-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            PixelVault · Assistant
          </p>
          <h1 className="mt-2 text-xl font-semibold">
            {conversation?.title ?? copy.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.share}</p>
        </header>

        {status === 'loading' ? (
          <p className="rounded-xl border border-border/60 bg-card p-6 text-sm text-muted-foreground">
            {copy.loading}
          </p>
        ) : status === 'error' || !conversation || !token ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
            {copy.error}
          </p>
        ) : (
          <ol className="space-y-3">
            {conversation.messages.map((message, index) => (
              <li
                key={message.id ?? `${message.role}-${index}`}
                className={
                  message.role === 'user'
                    ? 'ml-8 rounded-2xl bg-primary/10 px-4 py-3 text-sm'
                    : 'mr-8 rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm'
                }
              >
                <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {message.role === 'user' ? copy.user : copy.assistant}
                </p>
                <p className="whitespace-pre-wrap leading-6">
                  {message.content}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  )
}
