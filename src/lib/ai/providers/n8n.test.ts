import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  buildAgentRequest,
  callAgent,
  isAllowedAgentUrl,
  parseAgentResponse,
  parseQualification,
} from './n8n'
import { verifySignatureHeader } from '@/lib/webhooks/sign'
import { AiError } from '../types'

// A public IP literal skips DNS in the SSRF guard, keeping tests offline.
const PUBLIC_URL = 'https://93.184.215.14/webhook/wacrm-agent'
const SECRET = 'test-secret'

const REQUEST = buildAgentRequest({
  mode: 'auto_reply',
  account_id: 'acct-1',
  conversation_id: 'conv-1',
  contact: { id: 'contact-1', name: 'Rahim', phone: '8801700000000' },
  message: { whatsapp_message_id: 'wamid.1', type: 'text', text: 'hi', media: null },
  ad_referral: null,
  history: [{ role: 'user', content: 'hi' }],
  knowledge: [],
  business_context: null,
  actions_enabled: true,
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.AI_AGENT_ALLOW_PRIVATE_URLS
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('parseAgentResponse', () => {
  it('reads a plain object', () => {
    expect(parseAgentResponse({ text: ' hello ', handoff: false })).toEqual({
      text: 'hello',
      handoff: false,
      reason: null,
      qualification: null,
    })
  })

  it('unwraps a one-element array and accepts reply / output aliases', () => {
    expect(parseAgentResponse([{ reply: 'yo' }])?.text).toBe('yo')
    expect(parseAgentResponse({ output: 'sup' })?.text).toBe('sup')
  })

  it('accepts a handoff without text, with a string boolean', () => {
    expect(parseAgentResponse({ handoff: 'true', reason: 'wants a human' })).toMatchObject({
      text: '',
      handoff: true,
      reason: 'wants a human',
    })
  })

  it('returns null when there is nothing to act on', () => {
    expect(parseAgentResponse({ text: '   ' })).toBeNull()
    expect(parseAgentResponse(null)).toBeNull()
    expect(parseAgentResponse('ok')).toBeNull()
  })

  it('clips over-long replies to the WhatsApp text limit', () => {
    expect(parseAgentResponse({ text: 'a'.repeat(5000) })?.text).toHaveLength(4096)
  })
})

describe('parseQualification', () => {
  it('keeps known BANT values and drops unknown ones', () => {
    expect(
      parseQualification({
        budget: 'growth',
        authority: 'ceo',
        need: 'urgent',
        timeline: 'within_1mo',
        service: 'facebook ads',
        qualified: true,
      }),
    ).toEqual({
      budget: 'growth',
      authority: null,
      need: 'urgent',
      timeline: 'within_1mo',
      service: 'facebook ads',
      summary: null,
      qualified: true,
    })
  })

  it('returns null for an empty block', () => {
    expect(parseQualification({ budget: 'huge', qualified: false })).toBeNull()
    expect(parseQualification(undefined)).toBeNull()
  })
})

describe('isAllowedAgentUrl', () => {
  it('allows public https URLs', async () => {
    expect(await isAllowedAgentUrl(PUBLIC_URL)).toBe(true)
  })

  it('rejects plain http, private addresses and junk', async () => {
    expect(await isAllowedAgentUrl('http://93.184.215.14/hook')).toBe(false)
    expect(await isAllowedAgentUrl('https://127.0.0.1/hook')).toBe(false)
    expect(await isAllowedAgentUrl('https://10.0.0.5/hook')).toBe(false)
    expect(await isAllowedAgentUrl('https://n8n.local/hook')).toBe(false)
    expect(await isAllowedAgentUrl('not a url')).toBe(false)
  })

  it('lets self-hosters opt in to private URLs', async () => {
    process.env.AI_AGENT_ALLOW_PRIVATE_URLS = 'true'
    expect(await isAllowedAgentUrl('http://n8n:5678/webhook/x')).toBe(true)
  })
})

describe('callAgent', () => {
  it('signs the exact body it sends and parses the reply', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        text: 'got it',
        handoff: false,
        qualification: { need: 'planned', qualified: false },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await callAgent({
      url: PUBLIC_URL,
      secret: SECRET,
      request: REQUEST,
      timeoutMs: 1000,
      nowSeconds: 1_700_000_000,
    })

    expect(result.text).toBe('got it')
    expect(result.qualification?.need).toBe('planned')

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(url).toBe(PUBLIC_URL)
    expect(init.redirect).toBe('manual')
    expect(headers.Authorization).toBe(`Bearer ${SECRET}`)
    expect(headers['X-Wacrm-Event']).toBe('agent.auto_reply')
    expect(
      verifySignatureHeader(
        headers['X-Wacrm-Signature'],
        init.body as string,
        SECRET,
        1_700_000_000,
      ),
    ).toBe(true)
    expect(JSON.parse(init.body as string)).toMatchObject({ version: 1, mode: 'auto_reply' })
  })

  it('refuses a disallowed URL without calling fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      callAgent({ url: 'https://127.0.0.1/x', secret: SECRET, request: REQUEST, timeoutMs: 1000 }),
    ).rejects.toMatchObject({ code: 'agent_url_not_allowed' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps a 401 from the webhook to invalid_key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'nope' }, 401)))
    await expect(
      callAgent({ url: PUBLIC_URL, secret: SECRET, request: REQUEST, timeoutMs: 1000 }),
    ).rejects.toMatchObject({ code: 'invalid_key' })
  })

  it('treats a redirect as an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://x' } })),
    )
    await expect(
      callAgent({ url: PUBLIC_URL, secret: SECRET, request: REQUEST, timeoutMs: 1000 }),
    ).rejects.toMatchObject({ code: 'agent_redirect' })
  })

  it('rejects a reply without text or handoff', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true })))
    const err = await callAgent({
      url: PUBLIC_URL,
      secret: SECRET,
      request: REQUEST,
      timeoutMs: 1000,
    }).catch((e) => e)
    expect(err).toBeInstanceOf(AiError)
    expect(err.code).toBe('empty_response')
  })
})
