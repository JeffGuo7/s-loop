import type { ProviderConfig, ReasoningLevel } from '../types'

export interface ModelReasoningCapabilities {
  reasoning: boolean
  supportedThinkingLevels: ReasoningLevel[]
  recommendedThinkingLevel: ReasoningLevel
}

export function getReasoningPreference(
  config: ProviderConfig | undefined,
  modelID: string,
  capabilities: ModelReasoningCapabilities,
): ReasoningLevel {
  const stored = config?.reasoningEfforts?.[modelID]
  return stored && capabilities.supportedThinkingLevels.includes(stored)
    ? stored
    : capabilities.recommendedThinkingLevel
}

export function setReasoningPreference(
  config: ProviderConfig,
  modelID: string,
  level: ReasoningLevel,
): ProviderConfig {
  return {
    ...config,
    reasoningEfforts: {
      ...config.reasoningEfforts,
      [modelID]: level,
    },
  }
}
