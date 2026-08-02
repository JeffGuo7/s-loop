export function assembleRuntimeSystemPrompt({
  agentSystemPrompt,
  agentSkillsBlock,
  surfacePrompt,
  fallbackPrompt = 'You are a helpful AI assistant. Follow the available safety, permission, and tool rules.',
} = {}) {
  const basePrompt = String(agentSystemPrompt || '').trim() || String(fallbackPrompt || '').trim()
  return [basePrompt, agentSkillsBlock, surfacePrompt]
    .map((section) => String(section || '').trim())
    .filter(Boolean)
    .join('\n\n')
}
