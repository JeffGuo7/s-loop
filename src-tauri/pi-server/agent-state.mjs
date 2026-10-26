import { createInitialSystemMessage, toToolDeclaration } from '@earendil-works/pi-ai'

/**
 * Replace an agent's system prompt.
 *
 * pi 1.4 exposes `AgentState.systemPrompt` as a read-only getter: the prompt is
 * replayed from the transcript's system messages. Assigning to it throws
 * "Cannot set property systemPrompt of # which has only a getter". Rebuild the
 * leading system message instead, keeping every non-system message intact.
 *
 * The replacement carries the current tool declarations so the model sees the
 * same tool surface it had after the last `state.tools` assignment.
 */
export function setAgentSystemPrompt(agent, prompt, tools = []) {
  if (!agent) return
  if (agent.state.systemPrompt === prompt) return

  const systemMessage = createInitialSystemMessage(
    prompt,
    tools.map(toToolDeclaration),
  )
  const rest = agent.state.messages.filter((message) => message.role !== 'system')
  agent.state.messages = systemMessage ? [systemMessage, ...rest] : rest
}
