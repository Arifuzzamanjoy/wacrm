import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AiConfig } from './types'

// Shared, hoisted mock state so the module mocks can close over it.
const h = vi.hoisted(() => ({
  loadAiConfig: vi.fn(),
  buildConversationContext: vi.fn(),
  retrieveKnowledge: vi.fn(),
  generateReply: vi.fn(),
  engineSendText: vi.fn(),
  applyAgentQualification: vi.fn(),
  loadAgentMedia: vi.fn(),
  state: {
    conv: null as Record<string, unknown> | null,
    autoResponders: [] as { id: string }[],
    claim: true as boolean,
    updatePayload: null as Record<string, unknown> | null,
    updates: [] as Record<string, unknown>[],
    rpcCalls: [] as { name: string; args: unknown }[],
    contact: { name: 'Rahim', phone: '8801700000000' } as Record<string, unknown> | null,
    lastHumanAt: null as string | null,
  },
}))

vi.mock('./config', () => ({ loadAiConfig: h.loadAiConfig }))
vi.mock('./context', () => ({ buildConversationContext: h.buildConversationContext }))
vi.mock('./knowledge', () => ({ retrieveKnowledge: h.retrieveKnowledge }))
vi.mock('./generate', () => ({ generateReply: h.generateReply }))
vi.mock('./qualification', () => ({ applyAgentQualification: h.applyAgentQualification }))
vi.mock('./agent-media', () => ({ loadAgentMedia: h.loadAgentMedia }))
vi.mock('@/lib/flows/meta-send', () => ({ engineSendText: h.engineSendText }))
vi.mock('./admin-client', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      // One chainable fake per table. Filters are no-ops; the terminal
      // call resolves with the per-table state the test set up.
      const chain: Record<string, unknown> = {}
      const self = () => chain
      chain.select = self
      chain.eq = self
      chain.in = self
      chain.order = self
      chain.limit = () =>
        table === 'automations'
          ? Promise.resolve({ data: h.state.autoResponders, error: null })
          : chain
      chain.maybeSingle = () => {
        if (table === 'contacts') {
          return Promise.resolve({ data: h.state.contact, error: null })
        }
        if (table === 'messages') {
          return Promise.resolve({
            data: h.state.lastHumanAt ? { created_at: h.state.lastHumanAt } : null,
            error: null,
          })
        }
        return Promise.resolve({ data: h.state.conv, error: null })
      }
      chain.update = (payload: Record<string, unknown>) => {
        h.state.updatePayload = payload
        h.state.updates.push(payload)
        return { eq: () => Promise.resolve({ error: null }) }
      }
      return chain
    },
    rpc: (name: string, args: unknown) => {
      h.state.rpcCalls.push({ name, args })
      return Promise.resolve({ data: h.state.claim, error: null })
    },
  }),
}))

import { dispatchInboundToAiReply } from './auto-reply'

const ARGS = {
  accountId: 'acct-1',
  conversationId: 'conv-1',
  contactId: 'contact-1',
  configOwnerUserId: 'user-1',
}

function aiConfig(overrides: Partial<AiConfig> = {}): AiConfig {
  return {
    provider: 'openai',
    model: 'gpt-test',
    apiKey: 'sk-test',
    systemPrompt: null,
    isActive: true,
    autoReplyEnabled: true,
    autoReplyMaxPerConversation: 3,
    handoffAgentId: null,
    embeddingsApiKey: null,
    agentUrl: null,
    handoffTimeoutHours: null,
    dealPipelineId: null,
    dealStageId: null,
    ...overrides,
  }
}

beforeEach(() => {
  h.state.conv = {
    assigned_agent_id: null,
    ai_autoreply_disabled: false,
    ai_reply_count: 0,
  }
  h.state.autoResponders = []
  h.state.claim = true
  h.state.updatePayload = null
  h.state.updates = []
  h.state.rpcCalls = []
  h.state.contact = { name: 'Rahim', phone: '8801700000000' }
  h.state.lastHumanAt = null
  h.applyAgentQualification.mockReset()
  h.loadAgentMedia.mockReset()
  h.loadAiConfig.mockResolvedValue(aiConfig())
  h.buildConversationContext.mockResolvedValue([{ role: 'user', content: 'hi' }])
  h.retrieveKnowledge.mockResolvedValue([])
  h.generateReply.mockResolvedValue({ text: 'Hello!', handoff: false })
  h.engineSendText.mockResolvedValue({ whatsapp_message_id: 'm1' })
})

describe('dispatchInboundToAiReply — eligibility gates', () => {
  it('claims a slot and sends on the happy path', async () => {
    await dispatchInboundToAiReply(ARGS)
    expect(h.state.rpcCalls).toEqual([
      {
        name: 'claim_ai_reply_slot',
        args: { conversation_id: 'conv-1', max_replies: 3 },
      },
    ])
    expect(h.engineSendText).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-1', text: 'Hello!' }),
    )
  })

  it('grounds the reply in retrieved knowledge', async () => {
    h.retrieveKnowledge.mockResolvedValue(['Returns accepted within 30 days.'])
    await dispatchInboundToAiReply(ARGS)
    expect(h.retrieveKnowledge).toHaveBeenCalled()
    const systemPrompt = h.generateReply.mock.calls[0][0].systemPrompt as string
    expect(systemPrompt).toContain('Returns accepted within 30 days.')
  })

  it('stands down when an active message-level automation exists', async () => {
    h.state.autoResponders = [{ id: 'auto-1' }]
    await dispatchInboundToAiReply(ARGS)
    expect(h.generateReply).not.toHaveBeenCalled()
    expect(h.engineSendText).not.toHaveBeenCalled()
  })

  it('does not send when the atomic slot claim loses the race', async () => {
    h.state.claim = false
    await dispatchInboundToAiReply(ARGS)
    // It still attempts the claim, but the send is skipped.
    expect(h.state.rpcCalls).toHaveLength(1)
    expect(h.engineSendText).not.toHaveBeenCalled()
  })

  it('skips when AI is off / not configured', async () => {
    h.loadAiConfig.mockResolvedValue(null)
    await dispatchInboundToAiReply(ARGS)
    expect(h.generateReply).not.toHaveBeenCalled()
    expect(h.engineSendText).not.toHaveBeenCalled()
  })

  it('skips when auto-reply is disabled for the account', async () => {
    h.loadAiConfig.mockResolvedValue(aiConfig({ autoReplyEnabled: false }))
    await dispatchInboundToAiReply(ARGS)
    expect(h.engineSendText).not.toHaveBeenCalled()
  })

  it('skips when a human agent is assigned', async () => {
    h.state.conv = {
      assigned_agent_id: 'agent-9',
      ai_autoreply_disabled: false,
      ai_reply_count: 0,
    }
    await dispatchInboundToAiReply(ARGS)
    expect(h.engineSendText).not.toHaveBeenCalled()
  })

  it('skips when auto-reply was disabled on this conversation', async () => {
    h.state.conv = {
      assigned_agent_id: null,
      ai_autoreply_disabled: true,
      ai_reply_count: 0,
    }
    await dispatchInboundToAiReply(ARGS)
    expect(h.engineSendText).not.toHaveBeenCalled()
  })

  it('skips when the per-conversation cap is reached', async () => {
    h.state.conv = {
      assigned_agent_id: null,
      ai_autoreply_disabled: false,
      ai_reply_count: 3,
    }
    await dispatchInboundToAiReply(ARGS)
    expect(h.engineSendText).not.toHaveBeenCalled()
  })

  it('skips when there is nothing to reply to', async () => {
    h.buildConversationContext.mockResolvedValue([])
    await dispatchInboundToAiReply(ARGS)
    expect(h.generateReply).not.toHaveBeenCalled()
    expect(h.engineSendText).not.toHaveBeenCalled()
  })
})

describe('dispatchInboundToAiReply — handoff', () => {
  it('disables auto-reply, writes a summary, and does not send on handoff', async () => {
    h.generateReply.mockResolvedValue({ text: '', handoff: true })
    await dispatchInboundToAiReply(ARGS)
    expect(h.engineSendText).not.toHaveBeenCalled()
    expect(h.state.rpcCalls).toHaveLength(0)
    expect(h.state.updatePayload).toMatchObject({ ai_autoreply_disabled: true })
    expect(h.state.updatePayload?.ai_handoff_summary).toContain(
      'AI agent handed off',
    )
    // No handoff target configured → conversation left unassigned.
    expect(h.state.updatePayload).not.toHaveProperty('assigned_agent_id')
  })

  it('routes to the configured handoff agent on handoff', async () => {
    h.loadAiConfig.mockResolvedValue(aiConfig({ handoffAgentId: 'agent-7' }))
    h.generateReply.mockResolvedValue({ text: '', handoff: true })
    await dispatchInboundToAiReply(ARGS)
    expect(h.state.updatePayload).toMatchObject({
      ai_autoreply_disabled: true,
      assigned_agent_id: 'agent-7',
    })
  })
})

// ------------------------------------------------------------
// External (n8n) agent provider.
// ------------------------------------------------------------

const AGENT_CONFIG = {
  provider: 'n8n' as const,
  model: 'n8n-agent',
  apiKey: 'signing-secret',
  agentUrl: 'https://n8n.example.com/webhook/wacrm-agent',
}

const IMAGE_INBOUND = {
  whatsappMessageId: 'wamid.img',
  type: 'image',
  text: '',
  media: { id: 'media-1', kind: 'image' as const, mimeType: 'image/jpeg', filename: null, caption: null },
}

describe('dispatchInboundToAiReply — media-only messages', () => {
  it('leaves caption-less media alone for LLM providers', async () => {
    await dispatchInboundToAiReply({ ...ARGS, inbound: IMAGE_INBOUND })
    expect(h.generateReply).not.toHaveBeenCalled()
    expect(h.engineSendText).not.toHaveBeenCalled()
  })

  it('sends media, contact and ad context to the external agent', async () => {
    h.loadAiConfig.mockResolvedValue(aiConfig(AGENT_CONFIG))
    h.buildConversationContext.mockResolvedValue([])
    const media = { kind: 'image', mime_type: 'image/jpeg', filename: null, caption: null, size_bytes: 3, data_base64: 'AAAA' }
    h.loadAgentMedia.mockResolvedValue(media)
    const referral = { source_type: 'ad', source_id: 'ad-1', source_url: null, headline: 'More leads', body: null, media_type: null, ctwa_clid: 'clid' }

    await dispatchInboundToAiReply({
      ...ARGS,
      inbound: IMAGE_INBOUND,
      referral,
      accessToken: 'meta-token',
    })

    expect(h.loadAgentMedia).toHaveBeenCalledWith(IMAGE_INBOUND.media, 'meta-token')
    // No text to search the knowledge base with.
    expect(h.retrieveKnowledge).not.toHaveBeenCalled()
    const agent = h.generateReply.mock.calls[0][0].agent
    expect(agent).toMatchObject({
      mode: 'auto_reply',
      actions_enabled: true,
      conversation_id: 'conv-1',
      contact: { id: 'contact-1', name: 'Rahim', phone: '8801700000000' },
      message: { whatsapp_message_id: 'wamid.img', type: 'image', text: null, media },
      ad_referral: referral,
    })
    expect(h.engineSendText).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Hello!', aiGenerated: true }),
    )
  })
})

describe('dispatchInboundToAiReply — external agent actions', () => {
  beforeEach(() => {
    h.loadAiConfig.mockResolvedValue(aiConfig(AGENT_CONFIG))
  })

  it('applies the qualification the agent reports', async () => {
    const qualification = { budget: 'growth', authority: null, need: 'urgent', timeline: null, service: 'meta ads', summary: null, qualified: true }
    h.generateReply.mockResolvedValue({ text: 'got it', handoff: false, qualification })

    await dispatchInboundToAiReply(ARGS)

    expect(h.applyAgentQualification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        contactId: 'contact-1',
        conversationId: 'conv-1',
        contactName: 'Rahim',
        qualification,
      }),
    )
    expect(h.engineSendText).toHaveBeenCalled()
  })

  it('pauses, stamps the handoff, then sends the agent\'s handoff line', async () => {
    h.generateReply.mockResolvedValue({
      text: 'a teammate will jump in shortly',
      handoff: true,
      reason: 'asked for a human',
    })

    await dispatchInboundToAiReply(ARGS)

    expect(h.state.rpcCalls).toHaveLength(0)
    expect(h.state.updatePayload).toMatchObject({ ai_autoreply_disabled: true })
    expect(typeof h.state.updatePayload?.ai_handoff_at).toBe('string')
    expect(h.state.updatePayload?.ai_handoff_summary).toContain('asked for a human')
    expect(h.engineSendText).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'a teammate will jump in shortly' }),
    )
  })

  it('does not send handoff text for LLM providers', async () => {
    h.loadAiConfig.mockResolvedValue(aiConfig())
    h.generateReply.mockResolvedValue({ text: 'leftover', handoff: true })
    await dispatchInboundToAiReply(ARGS)
    expect(h.engineSendText).not.toHaveBeenCalled()
  })
})

describe('dispatchInboundToAiReply — handoff time limit', () => {
  const HOUR = 60 * 60 * 1000
  const handedOff = (hoursAgo: number) => ({
    assigned_agent_id: 'agent-7',
    ai_autoreply_disabled: true,
    ai_reply_count: 3,
    ai_handoff_at: new Date(Date.now() - hoursAgo * HOUR).toISOString(),
  })

  beforeEach(() => {
    h.loadAiConfig.mockResolvedValue(
      aiConfig({ handoffTimeoutHours: 6, handoffAgentId: 'agent-7' }),
    )
  })

  it('gives an expired handoff back to the bot and replies', async () => {
    h.state.conv = handedOff(7)
    await dispatchInboundToAiReply(ARGS)
    expect(h.state.updates[0]).toEqual({
      ai_autoreply_disabled: false,
      ai_handoff_at: null,
      ai_handoff_summary: null,
      ai_reply_count: 0,
      assigned_agent_id: null,
    })
    expect(h.engineSendText).toHaveBeenCalled()
  })

  it('keeps the handoff while a human replied recently', async () => {
    h.state.conv = handedOff(7)
    h.state.lastHumanAt = new Date(Date.now() - 1 * HOUR).toISOString()
    await dispatchInboundToAiReply(ARGS)
    expect(h.state.updates).toHaveLength(0)
    expect(h.engineSendText).not.toHaveBeenCalled()
  })

  it('keeps a thread someone else picked up assigned to them', async () => {
    h.state.conv = { ...handedOff(7), assigned_agent_id: 'agent-2' }
    await dispatchInboundToAiReply(ARGS)
    expect(h.state.updates[0]).not.toHaveProperty('assigned_agent_id')
    expect(h.engineSendText).not.toHaveBeenCalled()
  })

  it('never releases a manual pause', async () => {
    h.state.conv = { ...handedOff(100), ai_handoff_at: null }
    await dispatchInboundToAiReply(ARGS)
    expect(h.state.updates).toHaveLength(0)
    expect(h.engineSendText).not.toHaveBeenCalled()
  })
})
