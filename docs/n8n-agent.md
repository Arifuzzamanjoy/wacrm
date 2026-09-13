# External agent (n8n)

wacrm can hand the "what do we say next?" decision to your own agent
workflow in n8n instead of calling OpenAI, Anthropic or Groq directly.
wacrm stays in charge of everything else:

- **The WhatsApp number.** Meta sends messages to wacrm, and wacrm sends
  the replies, so every message shows up in the inbox marked as AI.
- **The safety gates.** Flows run first. The bot stays quiet while a
  human is assigned, and the per-conversation reply cap, the
  account-wide rate limit and human handoff all still apply.
- **The CRM.** Contacts, ad-click attribution, lead scores and deals.

The agent only receives the conversation and returns a reply.

> **Only one app can receive the number's messages.** Meta delivers
> each number's messages to a single webhook. If an n8n workflow uses
> its own WhatsApp Trigger on the same number (like `chatbot_v3`),
> deactivate it before switching wacrm to the n8n agent.

## Setup

1. **n8n.** Import or open the `chatbot_v4` workflow.
   1. Create a *Header Auth* credential named **wacrm Agent Secret**
      with header name `Authorization` and value `Bearer <secret>`.
      Generate the secret with, for example, `openssl rand -hex 32`.
   2. Publish the workflow and copy the webhook's **Production URL**.
2. **wacrm.** Go to Settings → Agent setup.
   1. Provider: **n8n agent (webhook)**. Paste the URL and the same
      secret as **Signing secret**.
   2. Click **Test agent**. wacrm sends `mode: "ping"` and expects any
      reply with `text`.
   3. Turn on the assistant and auto-reply.
   4. Optional: set **Hand back to the bot after (hours)** and
      **Create deals for qualified leads**.

The URL must be public `https://`. If n8n runs next to wacrm on a
private network, set `AI_AGENT_ALLOW_PRIVATE_URLS=true`, which also
allows `http://`.

## Request

`POST <agent URL>` with `Content-Type: application/json` and these
headers:

| Header              | Value                                                  |
| ------------------- | ------------------------------------------------------ |
| `Authorization`     | `Bearer <signing secret>`                              |
| `X-Wacrm-Signature` | `t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>` |
| `X-Wacrm-Event`     | `agent.auto_reply` / `agent.draft` / `agent.playground` / `agent.ping` |

The signature uses the same scheme as [outbound webhooks](./public-api.md#webhooks),
so a receiver that can verify an HMAC doesn't need the bearer header.

```jsonc
{
  "version": 1,
  "mode": "auto_reply",            // auto_reply | draft | playground | ping
  "actions_enabled": true,         // true only for auto_reply: handoff + qualification are acted on
  "account_id": "…",
  "conversation_id": "…",
  "contact": { "id": "…", "name": "Rahim", "phone": "8801…" },
  "message": {
    "whatsapp_message_id": "wamid…",
    "type": "audio",               // text | image | audio | video | document | sticker | …
    "text": null,                  // body or caption
    "media": {                     // null for text
      "kind": "audio",
      "mime_type": "audio/ogg",
      "filename": null,
      "caption": null,
      "size_bytes": 48211,
      "data_base64": "T2dnUw…"     // null when larger than AI_AGENT_MEDIA_MAX_BYTES (default 8 MB)
    }
  },
  "ad_referral": {                 // click-to-WhatsApp ad that opened this chat, else null
    "source_type": "ad", "source_id": "1202…", "source_url": "https://fb.me/…",
    "headline": "Get more leads", "body": "…", "media_type": "image", "ctwa_clid": "…"
  },
  "history": [{ "role": "user", "content": "…" }, { "role": "assistant", "content": "…" }],
  "knowledge": ["excerpt from the wacrm knowledge base", "…"],
  "business_context": "Settings → Business context & instructions"
}
```

`history` holds the last 20 text messages, oldest first, including the
latest one if it's text. `user` is the customer.

## Response

Reply within `AI_REQUEST_TIMEOUT_MS` (30 s by default) with:

```jsonc
{
  "text": "yes, we do. what kind of business are you running?",
  "handoff": false,
  "reason": null,                  // one sentence when handoff is true
  "qualification": {               // optional; every field nullable
    "budget": "growth",            // enterprise | growth | starter | none
    "authority": "decision_maker", // decision_maker | influencer | evaluator
    "need": "urgent",              // urgent | planned | exploring
    "timeline": "within_1mo",      // immediate | within_1mo | within_3mo | future
    "service": "facebook ads for a clinic",
    "summary": "clinic owner, wants patients, asked for pricing",
    "qualified": true
  }
}
```

wacrm also accepts a one-element array, `reply` or `output` in place of
`text`, and `"true"` in place of `true`. Unknown qualification values
are dropped.

## What wacrm does with the reply

- **`handoff: false`.** wacrm claims a reply slot and sends `text`.
- **`handoff: true`.**
  1. wacrm pauses the bot on the thread and stamps `ai_handoff_at`.
  2. It routes the chat to the configured handoff teammate and leaves a
     note that includes `reason`.
  3. It then sends `text` (e.g. "a teammate will jump in shortly"), if
     there is any.
- **`qualification`** (auto-reply only):
  - wacrm saves a `lead_score` assessment on the contact, so the inbox
    **Lead Score** panel opens pre-filled with an *AI agent* badge.
    BANT fields the agent didn't report are filled with the most
    conservative value.
  - If `qualified` is true and a deal pipeline and stage are set, wacrm
    opens one deal for the contact in that stage. It opens at most one
    open deal per contact per pipeline.
- **Handoff time limit.** When set, the next customer message after that
  many hours with no teammate reply gives the thread back to the bot.
  - The reply count resets.
  - The chat is unassigned only if it's still assigned to the handoff
    teammate.
  - Manual "Pause AI" is never undone automatically.

A failed call (error, timeout, or no `text` or `handoff`) sends nothing.
The message stays in the inbox for a human.

## Knowledge base sync

wacrm searches its own knowledge base and sends the matches in
`knowledge`, so the agent doesn't need its own vector store. To keep it
filled from a Google Doc, `chatbot_v4` has a *Knowledge sync* branch
that posts the doc to [`POST /api/v1/knowledge`](./public-api.md#knowledge-base)
with an API key that has the `knowledge:write` scope.
