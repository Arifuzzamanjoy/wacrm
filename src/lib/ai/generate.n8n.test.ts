import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AiConfig } from './types'

const h = vi.hoisted(() => ({ callAgent: vi.fn() }))

vi.mock('./providers/n8n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./providers/n8n')>()),
  callAgent: h.callAgent,
}))

import { generateReply } from './generate'

function agentConfig(overrides: Partial<AiConfig> = {}): AiConfig {
  return {
    provider: 'n8n',
    model: 'n8n-agent',
    apiKey: 'signing-secret',
    systemPrompt: 'we sell paid ads',
    isActive: true,
    autoReplyEnabled: true,
    autoReplyMaxPerConversation: 3,
    handoffAgentId: null,
    embeddingsApiKey: null,
    agentUrl: 'https://n8n.example.com/webhook/wacrm-agent',
    handoffTimeoutHours: null,
    dealPipelineId: null,
    dealStageId: null,
    ...overrides,
  }
}

const MESSAGES = [{ role: 'user' as const, content: 'how much for facebook ads?' }]

beforeEach(() => {
  h.callAgent.mockReset()
  h.callAgent.mockResolvedValue({ text: 'depends on budget', handoff: false, reason: null, qualification: null })
})

describe('generateReply — n8n provider', () => {
  it('sends the conversation and business context as structured data', async () => {
    await generateReply({
      config: agentConfig(),
      systemPrompt: 'wacrm scaffold (not sent to the agent)',
      messages: MESSAGES,
      agent: { mode: 'auto_reply', conversation_id: 'conv-1', knowledge: ['pricing starts at 15k'] },
    })

    const args = h.callAgent.mock.calls[0][0]
    expect(args.url).toBe('https://n8n.example.com/webhook/wacrm-agent')
    expect(args.secret).toBe('signing-secret')
    expect(args.request).toMatchObject({
      version: 1,
      mode: 'auto_reply',
      conversation_id: 'conv-1',
      history: MESSAGES,
      knowledge: ['pricing starts at 15k'],
      business_context: 'we sell paid ads',
      actions_enabled: false,
    })
    expect(JSON.stringify(args.request)).not.toContain('wacrm scaffold')
  })

  it('defaults to draft mode when no agent context is given', async () => {
    await generateReply({ config: agentConfig(), systemPrompt: '', messages: MESSAGES })
    expect(h.callAgent.mock.calls[0][0].request.mode).toBe('draft')
  })

  it('passes reason and qualification through and honours the text sentinel', async () => {
    const qualification = { budget: null, authority: null, need: 'urgent', timeline: null, service: null, summary: null, qualified: false }
    h.callAgent.mockResolvedValue({ text: '[[HANDOFF]]', handoff: false, reason: 'refund', qualification })

    const result = await generateReply({ config: agentConfig(), systemPrompt: '', messages: MESSAGES })

    expect(result).toEqual({ text: '', handoff: true, usage: null, reason: 'refund', qualification })
  })

  it('fails clearly when no agent URL is configured', async () => {
    await expect(
      generateReply({ config: agentConfig({ agentUrl: null }), systemPrompt: '', messages: MESSAGES }),
    ).rejects.toMatchObject({ code: 'agent_url_missing' })
    expect(h.callAgent).not.toHaveBeenCalled()
  })
})
