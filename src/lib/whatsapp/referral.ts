// ============================================================
// Click-to-WhatsApp ad referral — pure, no I/O.
//
// When a customer opens a chat by tapping a Meta ad, the first inbound
// message carries a `referral` block (ad id, headline, click id…). We
// keep it so every lead is traceable to the ad that produced it and so
// the AI agent knows what the customer already saw.
// ============================================================

/** Meta's raw `messages[].referral` shape (all fields optional). */
export interface WhatsAppReferral {
  source_url?: string
  source_id?: string
  source_type?: string
  headline?: string
  body?: string
  media_type?: string
  image_url?: string
  video_url?: string
  thumbnail_url?: string
  ctwa_clid?: string
}

/** Normalized referral as stored on `contacts.ad_referral` and
 *  `messages.referral`. */
export interface AdReferral {
  source_type: string | null
  source_id: string | null
  source_url: string | null
  headline: string | null
  body: string | null
  media_type: string | null
  ctwa_clid: string | null
}

const MAX_FIELD_LEN = 1000

function str(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, MAX_FIELD_LEN) : null
}

/**
 * Normalize Meta's referral block. Returns null when there is no block
 * or it carries neither an ad id nor a click id — a referral without
 * either can't be attributed to anything.
 */
export function parseReferral(raw: unknown): AdReferral | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as WhatsAppReferral
  const referral: AdReferral = {
    source_type: str(r.source_type),
    source_id: str(r.source_id),
    source_url: str(r.source_url),
    headline: str(r.headline),
    body: str(r.body),
    media_type: str(r.media_type),
    ctwa_clid: str(r.ctwa_clid),
  }
  if (!referral.source_id && !referral.ctwa_clid) return null
  return referral
}
