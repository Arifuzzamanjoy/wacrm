import { downloadMedia, getMediaUrl } from '@/lib/whatsapp/meta-api'
import type { AgentMedia } from './agent-types'

// ============================================================
// Inline inbound media for the external agent.
//
// The agent gets the file bytes base64-encoded in the request, so it
// needs no Meta token and no network path back to wacrm (n8n often runs
// somewhere that can't reach a self-hosted CRM). Files over the size cap
// are sent as metadata only — the agent can still say "please send it
// as a smaller file".
// ============================================================

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024

/** Largest file inlined into an agent request. Override with
 *  `AI_AGENT_MEDIA_MAX_BYTES`. */
export function agentMediaMaxBytes(): number {
  const raw = Number(process.env.AI_AGENT_MEDIA_MAX_BYTES)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_BYTES
}

export interface InboundMediaRef {
  id: string
  kind: AgentMedia['kind']
  mimeType: string | null
  filename: string | null
  caption: string | null
}

/**
 * Download one inbound media object from Meta and package it for the
 * agent. Never throws: a failed or oversized download yields metadata
 * with `data_base64: null`.
 */
export async function loadAgentMedia(
  ref: InboundMediaRef,
  accessToken: string | undefined,
): Promise<AgentMedia> {
  const base: AgentMedia = {
    kind: ref.kind,
    mime_type: ref.mimeType,
    filename: ref.filename,
    caption: ref.caption,
    size_bytes: null,
    data_base64: null,
  }
  if (!accessToken) return base

  try {
    const { url, mimeType } = await getMediaUrl({ mediaId: ref.id, accessToken })
    const { buffer, contentType } = await downloadMedia({
      downloadUrl: url,
      accessToken,
    })
    const out: AgentMedia = {
      ...base,
      mime_type: ref.mimeType ?? mimeType ?? contentType,
      size_bytes: buffer.length,
    }
    if (buffer.length > agentMediaMaxBytes()) return out
    return { ...out, data_base64: buffer.toString('base64') }
  } catch (err) {
    console.error(
      `[ai agent media] could not download ${ref.id}:`,
      err instanceof Error ? err.message : err,
    )
    return base
  }
}
