import { describe, it, expect } from 'vitest'
import { buildHandoffSummary, isHandoffExpired } from './handoff'

const HOUR = 60 * 60 * 1000
const HANDOFF_AT = '2026-09-13T00:00:00.000Z'
const T0 = Date.parse(HANDOFF_AT)

describe('isHandoffExpired', () => {
  it('never expires without a time limit or a stamped handoff', () => {
    expect(
      isHandoffExpired({ handoffAt: HANDOFF_AT, lastHumanReplyAt: null, timeoutHours: null, now: T0 + 1000 * HOUR }),
    ).toBe(false)
    expect(
      isHandoffExpired({ handoffAt: null, lastHumanReplyAt: null, timeoutHours: 6, now: T0 + 1000 * HOUR }),
    ).toBe(false)
  })

  it('expires once the limit passes with no human reply', () => {
    expect(
      isHandoffExpired({ handoffAt: HANDOFF_AT, lastHumanReplyAt: null, timeoutHours: 6, now: T0 + 5 * HOUR }),
    ).toBe(false)
    expect(
      isHandoffExpired({ handoffAt: HANDOFF_AT, lastHumanReplyAt: null, timeoutHours: 6, now: T0 + 6 * HOUR }),
    ).toBe(true)
  })

  it('restarts the clock on a human reply after the handoff', () => {
    const human = new Date(T0 + 4 * HOUR).toISOString()
    expect(
      isHandoffExpired({ handoffAt: HANDOFF_AT, lastHumanReplyAt: human, timeoutHours: 6, now: T0 + 8 * HOUR }),
    ).toBe(false)
    expect(
      isHandoffExpired({ handoffAt: HANDOFF_AT, lastHumanReplyAt: human, timeoutHours: 6, now: T0 + 10 * HOUR }),
    ).toBe(true)
  })

  it('ignores a human reply from before the handoff', () => {
    const before = new Date(T0 - 48 * HOUR).toISOString()
    expect(
      isHandoffExpired({ handoffAt: HANDOFF_AT, lastHumanReplyAt: before, timeoutHours: 6, now: T0 + 7 * HOUR }),
    ).toBe(true)
  })
})

describe('buildHandoffSummary with an agent reason', () => {
  it('includes the reason before the quoted message', () => {
    expect(
      buildHandoffSummary({
        messages: [{ role: 'user', content: 'i want a refund' }],
        replyCount: 1,
        reason: 'billing dispute',
      }),
    ).toBe('🤖 AI agent handed off after 1 reply: billing dispute. Last customer message: “i want a refund”')
  })
})
