// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReasoningLevelSelector } from '../src/components/chat/ReasoningLevelSelector'
import i18n from '../src/i18n'
import { useAppStore } from '../src/stores/appStore'

describe('ReasoningLevelSelector', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    useAppStore.setState({
      providerConfigs: {
        deepseek: {
          apiKey: '',
          baseUrl: 'https://api.deepseek.com',
          model: 'deepseek-v4-pro',
        },
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      reasoning: true,
      supportedThinkingLevels: ['off', 'high', 'max'],
      recommendedThinkingLevel: 'high',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows only levels supported by the selected model and persists the choice', async () => {
    render(
      <ReasoningLevelSelector
        providerId="deepseek"
        modelId="deepseek-v4-pro"
        providerApi="openai-completions"
        baseUrl="https://api.deepseek.com"
      />,
    )

    const trigger = await screen.findByRole('button', { name: /reasoning: high/i })
    expect(trigger.querySelector('.lucide-gauge')).toBeInTheDocument()
    fireEvent.click(trigger)

    expect(screen.getByRole('button', { name: /reasoning level: off/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reasoning level: high/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reasoning level: max/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reasoning level: medium/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /reasoning level: max/i }))

    await waitFor(() => {
      expect(useAppStore.getState().providerConfigs.deepseek.reasoningEfforts).toEqual({
        'deepseek-v4-pro': 'max',
      })
    })
  })

  it('disables the control for a non-reasoning model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      reasoning: false,
      supportedThinkingLevels: ['off'],
      recommendedThinkingLevel: 'off',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    render(
      <ReasoningLevelSelector
        providerId="deepseek"
        modelId="ordinary-chat-model"
        baseUrl="https://api.deepseek.com"
      />,
    )

    expect(await screen.findByRole('button', { name: /reasoning: off/i })).toBeDisabled()
  })
})
