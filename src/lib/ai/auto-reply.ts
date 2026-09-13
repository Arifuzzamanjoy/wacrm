import { supabaseAdmin } from './admin-client'
import { loadAiConfig } from './config'
import { buildConversationContext } from './context'
import { retrieveKnowledge } from './knowledge'
import { generateReply } from './generate'
import { buildSystemPrompt } from './defaults'
import { buildHandoffSummary, isHandoffExpired } from './handoff'
import { logAiUsage } from './usage'
import { latestUserMessage } from './query'
import { applyAgentQualification } from './qualification'
import { loadAgentMedia, type InboundMediaRef } from './agent-media'
import type { AgentInboundMessage } from './agent-types'
import type { AiConfig } from './types'
import type { AdReferral } from '@/lib/whatsapp/referral'
import { engineSendText } from '@/lib/flows/meta-send'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

/** The inbound message that triggered this dispatch. */
export interface InboundForAi {
  whatsappMessageId: string
  /** WhatsApp message type (`text`, `image`, `audio`, `document`, …). */
  type: string
  /** Text body or media caption; empty for caption-less media. */
  text: string
  media: InboundMediaRef | null
}

interface DispatchArgs {
  /** Tenancy key — drives config, contact, and whatsapp_config lookups. */
  accountId: string
  conversationId: string
  contactId: string
  /** The account's WhatsApp config owner, used for the outbound send's
   *  audit columns (mirrors how the flow runner passes it through). */
  configOwnerUserId: string
  /** The triggering message. Media-only messages are answered only by
   *  the external agent; the LLM providers need text. */
  inbound?: InboundForAi
  /** Click-to-WhatsApp ad attribution carried by this message, if any. */
  referral?: AdReferral | null
  /** Meta access token, used to inline media for the external agent. */
  accessToken?: string
}

interface ConversationGateRow {
  assigned_agent_id: string | null
  ai_autoreply_disabled: boolean
  ai_reply_count: number
  ai_handoff_at: string | null
}

/**
 * AI auto-reply for a freshly-arrived inbound message.
 *
 * Invoked from the WhatsApp webhook's `after()` block, only when no
 * deterministic flow consumed the message (flows win). Mirrors the flow
 * runner's contract: it owns its try/catch and NEVER throws — a failing
 * or slow LLM call must not affect the webhook's 200 to Meta.
 *
 * Eligibility gates (any → silent no-op):
 *   - AI off / auto-reply disabled for the account
 *   - a human agent is assigned (they own the thread)
 *   - auto-reply was disabled for this conversation (prior handoff),
 *     unless that handoff has passed the account's handoff time limit
 *   - the per-conversation reply cap is reached
 *   - there's nothing to reply to
 *
 * The 24h WhatsApp session window is inherently open here — we're
 * reacting to a customer message that just landed — so no separate
 * window check is needed.
 */
export async function dispatchInboundToAiReply(
  args: DispatchArgs,
): Promise<void> {
  const { accountId, conversationId, contactId, configOwnerUserId, inbound } = args

  try {
    const db = supabaseAdmin()

    const config = await loadAiConfig(db, accountId)
    if (!config || !config.autoReplyEnabled) return

    const isExternalAgent = config.provider === 'n8n'
    // LLM providers only model text, so a caption-less photo or voice
    // note has nothing for them to answer. The external agent can
    // transcribe / look at the media itself.
    if (inbound && !inbound.text.trim() && !(isExternalAgent && inbound.media)) {
      return
    }

    // Deterministic, user-configured responders win over the LLM — the
    // caller already excludes messages a Flow consumed. Message-level
    // automations (`new_message_received` / `keyword_match`) are
    // dispatched independently for this same inbound and may send their
    // own reply, so if the account has any active one we stand down to
    // avoid double-texting the customer. (Relationship triggers like
    // `first_inbound_message` don't count — they're not per-message
    // auto-responders.)
    const { data: autoResponders } = await db
      .from('automations')
      .select('id')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .in('trigger_type', ['new_message_received', 'keyword_match'])
      .limit(1)
    if (autoResponders && autoResponders.length > 0) return

    const { data: convData, error: convErr } = await db
      .from('conversations')
      .select('assigned_agent_id, ai_autoreply_disabled, ai_reply_count, ai_handoff_at')
      .eq('id', conversationId)
      .maybeSingle()
    if (convErr || !convData) return
    const conv = await releaseExpiredHandoff(
      db,
      conversationId,
      convData as ConversationGateRow,
      config,
    )

    if (conv.assigned_agent_id) return // a human owns this thread
    if (conv.ai_autoreply_disabled) return // handed off / turned off here
    // Cheap early-out; the authoritative cap check is the atomic claim
    // below (this read can race a concurrent inbound).
    if (conv.ai_reply_count >= config.autoReplyMaxPerConversation) return

    const messages = await buildConversationContext(db, conversationId)
    if (messages.length === 0 && !(isExternalAgent && inbound?.media)) return

    // Account-wide throttle on the shared BYO key. The per-conversation
    // cap bounds one thread; this bounds a burst across many threads (a
    // marketing blast landing 200 replies at once) so we never run the
    // owner's key past the provider's rate limit. Over the limit → skip
    // the auto-reply; the inbound still sits in the inbox for a human.
    const acctLimit = checkRateLimit(
      `ai-autoreply:${accountId}`,
      RATE_LIMITS.aiAutoReplyAccount,
    )
    if (!acctLimit.success) {
      console.warn(
        `[ai auto-reply] account ${accountId} hit the per-account rate limit — skipping this inbound.`,
      )
      return
    }

    // Ground the reply in the account's knowledge base (best-effort).
    const query = latestUserMessage(messages) || inbound?.text || ''
    const knowledge = query.trim()
      ? await retrieveKnowledge(db, accountId, config, query)
      : []

    const systemPrompt = buildSystemPrompt({
      userPrompt: config.systemPrompt,
      mode: 'auto_reply',
      knowledge,
    })

    let contactName: string | null = null
    let agent: Parameters<typeof generateReply>[0]['agent']
    if (isExternalAgent) {
      const { data: contact } = await db
        .from('contacts')
        .select('name, phone')
        .eq('id', contactId)
        .eq('account_id', accountId)
        .maybeSingle()
      contactName = (contact?.name as string | null) ?? null
      agent = {
        mode: 'auto_reply',
        actions_enabled: true,
        account_id: accountId,
        conversation_id: conversationId,
        contact: {
          id: contactId,
          name: contactName,
          phone: (contact?.phone as string | null) ?? null,
        },
        message: inbound ? await toAgentMessage(inbound, args.accessToken) : null,
        ad_referral: args.referral ?? null,
        knowledge,
      }
    }

    const { text, handoff, usage, reason, qualification } = await generateReply({
      config,
      systemPrompt,
      messages,
      agent,
    })

    // Record token spend on the account's BYO key. Fire-and-forget so it
    // never adds latency to the customer-facing send: `logAiUsage`
    // swallows its own errors, so the floating promise can't reject.
    // Logged regardless of handoff — the provider call happened either
    // way.
    void logAiUsage(db, {
      accountId,
      conversationId,
      mode: 'auto_reply',
      provider: config.provider,
      model: config.model,
      usage,
    })

    // What the agent learned about the lead is worth keeping even when
    // it hands the thread to a human — arguably more so.
    if (qualification) {
      await applyAgentQualification(db, {
        accountId,
        contactId,
        conversationId,
        contactName,
        configOwnerUserId,
        qualification,
        config,
      })
    }

    if (handoff || !text) {
      // The model can't (or shouldn't) answer — stop auto-replying on
      // this thread and hand it to a human. We (a) pause the bot here
      // (sticky until re-enabled or the handoff time limit passes),
      // (b) route the conversation to the configured handoff agent —
      // null leaves it in the shared queue — and (c) leave a short
      // internal note so whoever picks it up has context. Assigning
      // fires the `on_conversation_assigned` trigger, which notifies the
      // agent.
      const summary = buildHandoffSummary({
        messages,
        replyCount: conv.ai_reply_count ?? 0,
        reason,
      })
      const update: Record<string, unknown> = {
        ai_autoreply_disabled: true,
        ai_handoff_summary: summary,
        ai_handoff_at: new Date().toISOString(),
      }
      // Only set the assignee when a target is configured AND the thread
      // isn't already owned — never stomp an existing human assignment.
      if (config.handoffAgentId && !conv.assigned_agent_id) {
        update.assigned_agent_id = config.handoffAgentId
      }
      await db.from('conversations').update(update).eq('id', conversationId)

      // An agent may hand off *and* tell the customer someone will take
      // over. Send that line after the thread is already paused; the
      // handoff note and routing above are what matter if it fails.
      if (handoff && text && isExternalAgent) {
        await engineSendText({
          accountId,
          userId: configOwnerUserId,
          conversationId,
          contactId,
          text,
          aiGenerated: true,
        }).catch((err) =>
          console.error('[ai auto-reply] handoff message failed:', err),
        )
      }
      return
    }

    // Atomically claim a reply slot: the cap check + increment happen in
    // one UPDATE, so concurrent inbounds can never overshoot the cap. If
    // another inbound just took the last slot, `claimed` is false and we
    // skip the send. (We consume a slot slightly before the send lands —
    // fail-safe: under-reply rather than over-reply.)
    const { data: claimed, error: claimErr } = await db.rpc(
      'claim_ai_reply_slot',
      {
        conversation_id: conversationId,
        max_replies: config.autoReplyMaxPerConversation,
      },
    )
    if (claimErr) {
      // A real error here (vs. losing the cap race) is almost always a
      // deploy issue — e.g. `claim_ai_reply_slot` not EXECUTE-able by the
      // service role, or the migration not applied. Log it loudly: a
      // silent return makes "auto-reply never fires" undiagnosable.
      console.error('[ai auto-reply] claim_ai_reply_slot failed:', claimErr)
      return
    }
    if (claimed !== true) return // lost the per-conversation cap race

    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text,
      aiGenerated: true,
    })
  } catch (err) {
    console.error('[ai auto-reply] dispatch failed:', err)
  }
}

async function toAgentMessage(
  inbound: InboundForAi,
  accessToken: string | undefined,
): Promise<AgentInboundMessage> {
  return {
    whatsapp_message_id: inbound.whatsappMessageId,
    type: inbound.type,
    text: inbound.text.trim() || null,
    media: inbound.media ? await loadAgentMedia(inbound.media, accessToken) : null,
  }
}

/**
 * If this conversation's bot handoff has passed the account's handoff
 * time limit, give the thread back to the bot and return the updated
 * gate row. Only bot handoffs carry `ai_handoff_at`, so a teammate's
 * manual "pause AI" is never undone. An assignment is released only when
 * it is still the one the handoff made — a thread someone else picked
 * up stays theirs.
 */
async function releaseExpiredHandoff(
  db: ReturnType<typeof supabaseAdmin>,
  conversationId: string,
  conv: ConversationGateRow,
  config: AiConfig,
): Promise<ConversationGateRow> {
  if (!conv.ai_autoreply_disabled || !conv.ai_handoff_at || !config.handoffTimeoutHours) {
    return conv
  }

  const { data: lastHuman } = await db
    .from('messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'agent')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const expired = isHandoffExpired({
    handoffAt: conv.ai_handoff_at,
    lastHumanReplyAt: (lastHuman?.created_at as string | undefined) ?? null,
    timeoutHours: config.handoffTimeoutHours,
    now: Date.now(),
  })
  if (!expired) return conv

  const releaseAssignment =
    !!conv.assigned_agent_id && conv.assigned_agent_id === config.handoffAgentId
  const update: Record<string, unknown> = {
    ai_autoreply_disabled: false,
    ai_handoff_at: null,
    ai_handoff_summary: null,
    ai_reply_count: 0,
  }
  if (releaseAssignment) update.assigned_agent_id = null

  const { error } = await db
    .from('conversations')
    .update(update)
    .eq('id', conversationId)
  if (error) {
    console.error('[ai auto-reply] handoff release failed:', error)
    return conv
  }

  return {
    assigned_agent_id: releaseAssignment ? null : conv.assigned_agent_id,
    ai_autoreply_disabled: false,
    ai_reply_count: 0,
    ai_handoff_at: null,
  }
}
