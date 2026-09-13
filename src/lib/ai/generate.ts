import {
  AiError,
  type AiConfig,
  type AiUsage,
  type ChatMessage,
  type GenerateResult,
} from './types'
import { HANDOFF_SENTINEL, aiRequestTimeoutMs } from './defaults'
import { generateOpenAi } from './providers/openai'
import { generateAnthropic } from './providers/anthropic'
import { generateGroq } from './providers/groq'
import { buildAgentRequest, callAgent } from './providers/n8n'
import type { AgentRequest } from './agent-types'

export interface GenerateArgs {
  config: AiConfig
  /** Fully-built system prompt (see `buildSystemPrompt`). */
  systemPrompt: string
  /** Recent conversation turns, oldest first. */
  messages: ChatMessage[]
  /**
   * Extra context for the external agent provider (`n8n`): the caller's
   * mode, the contact, the inbound message + media, ad attribution and
   * retrieved knowledge. Ignored by the LLM providers, which only need
   * `systemPrompt` + `messages`.
   */
  agent?: Partial<
    Omit<AgentRequest, 'version' | 'history' | 'business_context'>
  >
}

/**
 * Generate the next reply from the account's configured provider.
 * Dispatches to the right adapter, then parses the handoff sentinel out
 * of the raw text. Throws `AiError` on any provider/network failure.
 */
export async function generateReply(args: GenerateArgs): Promise<GenerateResult> {
  const { config, systemPrompt, messages } = args
  const timeoutMs = aiRequestTimeoutMs()
  const providerArgs = {
    apiKey: config.apiKey,
    model: config.model,
    systemPrompt,
    messages,
    timeoutMs,
  }

  let result: { text: string; usage: AiUsage | null }
  switch (config.provider) {
    case 'openai':
      result = await generateOpenAi(providerArgs)
      break
    case 'anthropic':
      result = await generateAnthropic(providerArgs)
      break
    case 'groq':
      result = await generateGroq(providerArgs)
      break
    case 'n8n':
      return generateExternalAgent(args, timeoutMs)
    default:
      throw new AiError(`Unsupported AI provider: ${config.provider}`, {
        code: 'unsupported_provider',
        status: 400,
      })
  }

  return parseGeneration(result.text, result.usage)
}

/**
 * Ask the account's external agent for the next reply. The agent gets
 * the business context and conversation as structured data rather than
 * wacrm's prompt scaffold — it owns its own persona and instructions.
 */
async function generateExternalAgent(
  args: GenerateArgs,
  timeoutMs: number,
): Promise<GenerateResult> {
  const { config, messages, agent } = args
  if (!config.agentUrl) {
    throw new AiError('No agent URL is configured.', {
      code: 'agent_url_missing',
      status: 400,
    })
  }

  const response = await callAgent({
    url: config.agentUrl,
    secret: config.apiKey,
    timeoutMs,
    request: buildAgentRequest({
      mode: agent?.mode ?? 'draft',
      account_id: agent?.account_id ?? null,
      conversation_id: agent?.conversation_id ?? null,
      contact: agent?.contact ?? null,
      message: agent?.message ?? null,
      ad_referral: agent?.ad_referral ?? null,
      history: messages,
      knowledge: agent?.knowledge ?? [],
      business_context: config.systemPrompt,
      actions_enabled: agent?.actions_enabled ?? false,
    }),
  })

  // The agent can also signal a handoff with the text sentinel, same as
  // the LLM providers — honour either.
  const parsed = parseGeneration(response.text, null)
  return {
    ...parsed,
    handoff: parsed.handoff || response.handoff,
    reason: response.reason,
    qualification: response.qualification,
  }
}

/**
 * Split the raw model output into `{ text, handoff, usage }`. The
 * sentinel can appear alone or trailing a partial reply; either way we
 * treat the turn as a handoff and strip the marker from any remaining
 * text. `usage` is passed straight through (null when the provider
 * didn't report it).
 */
export function parseGeneration(
  raw: string,
  usage: AiUsage | null = null,
): GenerateResult {
  const handoff = raw.includes(HANDOFF_SENTINEL)
  const text = raw.split(HANDOFF_SENTINEL).join('').trim()
  return { text, handoff, usage }
}
