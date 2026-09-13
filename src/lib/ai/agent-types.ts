// ============================================================
// Wire contract for the external (n8n) agent provider.
//
// wacrm POSTs an `AgentRequest` to the account's agent URL and expects
// an `AgentResponse` back. Versioned so the agent side can branch if
// the contract ever changes. See docs/n8n-agent.md.
// ============================================================

import type { AdReferral } from '@/lib/whatsapp/referral'
import type { ChatMessage } from './types'

export const AGENT_CONTRACT_VERSION = 1

/** Why wacrm is calling the agent. */
export type AgentMode = 'auto_reply' | 'draft' | 'playground' | 'ping'

export type BantBudget = 'enterprise' | 'growth' | 'starter' | 'none'
export type BantAuthority = 'decision_maker' | 'influencer' | 'evaluator'
export type BantNeed = 'urgent' | 'planned' | 'exploring'
export type BantTimeline = 'immediate' | 'within_1mo' | 'within_3mo' | 'future'

/** Media attached to the inbound message, inlined so the agent never
 *  needs network access back to wacrm or a Meta token. `data_base64` is
 *  null when the file was too large or could not be downloaded. */
export interface AgentMedia {
  kind: 'image' | 'audio' | 'video' | 'document' | 'sticker'
  mime_type: string | null
  filename: string | null
  caption: string | null
  size_bytes: number | null
  data_base64: string | null
}

export interface AgentInboundMessage {
  whatsapp_message_id: string | null
  type: string
  text: string | null
  media: AgentMedia | null
}

export interface AgentRequest {
  version: typeof AGENT_CONTRACT_VERSION
  mode: AgentMode
  account_id: string | null
  conversation_id: string | null
  contact: {
    id: string
    name: string | null
    phone: string | null
  } | null
  message: AgentInboundMessage | null
  ad_referral: AdReferral | null
  /** Recent text turns, oldest first. `user` = customer. */
  history: ChatMessage[]
  /** Knowledge-base excerpts wacrm retrieved for the latest message. */
  knowledge: string[]
  /** The account's "business context & instructions" (may be null). */
  business_context: string | null
  /** True when the agent's handoff/qualification output will be acted
   *  on (auto-reply only) — drafts and the playground ignore both. */
  actions_enabled: boolean
}

/** Lead qualification the agent inferred from the conversation. Every
 *  field is optional — the agent only reports what it actually learned. */
export interface AgentQualification {
  budget: BantBudget | null
  authority: BantAuthority | null
  need: BantNeed | null
  timeline: BantTimeline | null
  /** What the lead is interested in, e.g. "facebook ads for a clinic". */
  service: string | null
  /** One-line summary for the deal notes. */
  summary: string | null
  /** The agent judged this a real sales opportunity (drives deal creation). */
  qualified: boolean
}

export interface AgentResponse {
  text: string
  handoff: boolean
  reason: string | null
  qualification: AgentQualification | null
}
