import { AiError } from '../types'
import {
  AGENT_CONTRACT_VERSION,
  type AgentQualification,
  type AgentRequest,
  type AgentResponse,
  type BantAuthority,
  type BantBudget,
  type BantNeed,
  type BantTimeline,
} from '../agent-types'
import { buildSignatureHeader } from '@/lib/webhooks/sign'
import { isDeliverableUrl } from '@/lib/webhooks/ssrf'
import { providerHttpError, toNetworkError } from './shared'

// ============================================================
// External agent (n8n) provider.
//
// Instead of calling an LLM, wacrm POSTs the conversation to the
// account's own agent workflow and reads back `{ text, handoff, reason,
// qualification }`. wacrm keeps ownership of the WhatsApp number, the
// send, and every auto-reply gate — the agent only decides what to say.
//
// Every request is signed exactly like outbound event webhooks
// (`X-Wacrm-Signature: t=…,v1=HMAC-SHA256(secret, "t.body")`) and also
// carries `Authorization: Bearer <secret>` so an n8n Webhook node can
// authenticate it with a plain Header Auth credential.
// ============================================================

/** Cap on how much of the agent's reply we accept (WhatsApp's text
 *  limit is 4096 characters). */
const MAX_REPLY_CHARS = 4096
const MAX_REASON_CHARS = 500
const MAX_FIELD_CHARS = 300

/**
 * Whether wacrm may call `rawUrl` as an agent endpoint. HTTPS to a
 * publicly-routable host only — the URL is admin-controlled and the
 * server makes the request, so this is the same SSRF guard outbound
 * webhooks use. Self-hosters running n8n next to wacrm on a private
 * network can opt out with `AI_AGENT_ALLOW_PRIVATE_URLS=true`.
 */
export async function isAllowedAgentUrl(rawUrl: string): Promise<boolean> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  const allowPrivate = process.env.AI_AGENT_ALLOW_PRIVATE_URLS === 'true'
  if (url.protocol !== 'https:' && !(allowPrivate && url.protocol === 'http:')) {
    return false
  }
  if (allowPrivate) return true
  return isDeliverableUrl(rawUrl)
}

export interface CallAgentArgs {
  url: string
  /** Shared signing secret (the account's decrypted `api_key`). */
  secret: string
  request: AgentRequest
  timeoutMs: number
  /** Injectable clock for the signature timestamp (tests). */
  nowSeconds?: number
}

/** POST one request to the agent and return its parsed reply. Throws
 *  `AiError` on any network / HTTP / contract failure. */
export async function callAgent(args: CallAgentArgs): Promise<AgentResponse> {
  const { url, secret, request, timeoutMs } = args

  if (!(await isAllowedAgentUrl(url))) {
    throw new AiError(
      'The agent URL is not allowed. Use a public https:// URL.',
      { code: 'agent_url_not_allowed', status: 400 },
    )
  }

  const body = JSON.stringify(request)
  const ts = args.nowSeconds ?? Math.floor(Date.now() / 1000)

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
        'X-Wacrm-Event': `agent.${request.mode}`,
        'X-Wacrm-Signature': buildSignatureHeader(body, secret, ts),
      },
      body,
      // A public URL must not 3xx-bounce us to an internal address.
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (res.status >= 300 && res.status < 400) {
    throw new AiError('The agent URL redirected; use the final URL.', {
      code: 'agent_redirect',
      status: 502,
    })
  }
  if (!res.ok) {
    throw await providerHttpError('The n8n agent', res)
  }

  const json = await res.json().catch(() => null)
  const parsed = parseAgentResponse(json)
  if (!parsed) {
    throw new AiError(
      'The agent returned no usable reply. Expected JSON like { "text": "...", "handoff": false }.',
      { code: 'empty_response' },
    )
  }
  return parsed
}

/** Build the request body for one agent call. */
export function buildAgentRequest(
  fields: Omit<AgentRequest, 'version'>,
): AgentRequest {
  return { version: AGENT_CONTRACT_VERSION, ...fields }
}

// ------------------------------------------------------------
// Response parsing — tolerant of how n8n tends to shape output.
// ------------------------------------------------------------

function clip(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

function truthy(value: unknown): boolean {
  return value === true || value === 'true' || value === 1
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null
}

const BUDGETS: readonly BantBudget[] = ['enterprise', 'growth', 'starter', 'none']
const AUTHORITIES: readonly BantAuthority[] = ['decision_maker', 'influencer', 'evaluator']
const NEEDS: readonly BantNeed[] = ['urgent', 'planned', 'exploring']
const TIMELINES: readonly BantTimeline[] = ['immediate', 'within_1mo', 'within_3mo', 'future']

/** Normalize the agent's qualification block, dropping unknown values.
 *  Returns null when it carries nothing usable. */
export function parseQualification(raw: unknown): AgentQualification | null {
  if (!raw || typeof raw !== 'object') return null
  const q = raw as Record<string, unknown>
  const out: AgentQualification = {
    budget: oneOf(q.budget, BUDGETS),
    authority: oneOf(q.authority, AUTHORITIES),
    need: oneOf(q.need, NEEDS),
    timeline: oneOf(q.timeline, TIMELINES),
    service: clip(q.service, MAX_FIELD_CHARS),
    summary: clip(q.summary, MAX_FIELD_CHARS),
    qualified: truthy(q.qualified),
  }
  const empty =
    !out.budget &&
    !out.authority &&
    !out.need &&
    !out.timeline &&
    !out.service &&
    !out.summary &&
    !out.qualified
  return empty ? null : out
}

/**
 * Parse whatever the agent sent back into an `AgentResponse`. Accepts a
 * bare object, a one-element array (n8n "all incoming items"), and a
 * `text` / `reply` / `output` string. Returns null when there's neither
 * reply text nor a handoff — nothing we could act on.
 */
export function parseAgentResponse(raw: unknown): AgentResponse | null {
  const obj = Array.isArray(raw) ? raw[0] : raw
  if (!obj || typeof obj !== 'object') return null
  const r = obj as Record<string, unknown>

  const text = clip(r.text ?? r.reply ?? r.output, MAX_REPLY_CHARS) ?? ''
  const handoff = truthy(r.handoff)
  if (!text && !handoff) return null

  return {
    text,
    handoff,
    reason: clip(r.reason, MAX_REASON_CHARS),
    qualification: parseQualification(r.qualification),
  }
}
