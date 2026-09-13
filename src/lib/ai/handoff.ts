import type { ChatMessage } from './types'

/** Longest the quoted customer message runs before we ellipsize it —
 *  keeps the internal note to a glanceable one-liner. */
const MAX_QUOTE_LEN = 160

/**
 * Build the short internal note the auto-reply bot leaves on a
 * conversation when it hands off to a human. Deterministic — composed
 * from context we already have (no extra LLM call / token spend), so it
 * can't fail or add latency to the handoff.
 *
 * Reads as, e.g.:
 *   "🤖 AI agent handed off after 2 replies. Last customer message:
 *    “can I speak to a manager about my refund?”"
 *
 * `replyCount` is the bot's auto-reply tally for the thread (0 when it
 * bailed on the very first inbound without answering).
 */
export function buildHandoffSummary(args: {
  messages: ChatMessage[]
  replyCount: number
  /** The agent's own reason, when it gave one (external agent). */
  reason?: string | null
}): string {
  const { messages, replyCount, reason } = args

  const lastCustomer = [...messages]
    .reverse()
    .find((m) => m.role === 'user' && m.content.trim())

  const replies =
    replyCount === 0
      ? 'without replying'
      : `after ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`

  const why = reason?.trim()
  const base = why
    ? `🤖 AI agent handed off ${replies}: ${truncate(why, MAX_QUOTE_LEN)}.`
    : `🤖 AI agent handed off ${replies}.`

  if (!lastCustomer) return base

  const quote = truncate(lastCustomer.content.trim(), MAX_QUOTE_LEN)
  return `${base} Last customer message: “${quote}”`
}

function truncate(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ')
  if (collapsed.length <= max) return collapsed
  return `${collapsed.slice(0, max - 1).trimEnd()}…`
}

/**
 * Whether a bot handoff has timed out and the bot may take the thread
 * back. The clock restarts on every human reply, so a conversation a
 * teammate is actively working never gets the bot back mid-thread.
 * `timeoutHours` null/0 means handoffs never expire.
 */
export function isHandoffExpired(args: {
  handoffAt: string | null
  lastHumanReplyAt: string | null
  timeoutHours: number | null
  now: number
}): boolean {
  const { handoffAt, lastHumanReplyAt, timeoutHours, now } = args
  if (!handoffAt || !timeoutHours || timeoutHours <= 0) return false
  const handoffMs = Date.parse(handoffAt)
  if (!Number.isFinite(handoffMs)) return false
  const humanMs = lastHumanReplyAt ? Date.parse(lastHumanReplyAt) : NaN
  const since = Number.isFinite(humanMs) ? Math.max(handoffMs, humanMs) : handoffMs
  return now - since >= timeoutHours * 60 * 60 * 1000
}
