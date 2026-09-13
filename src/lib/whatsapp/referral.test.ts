import { describe, it, expect } from 'vitest'
import { parseReferral } from './referral'

describe('parseReferral', () => {
  it('normalizes a click-to-WhatsApp ad referral', () => {
    expect(
      parseReferral({
        source_type: 'ad',
        source_id: '120210000000',
        source_url: 'https://fb.me/abc',
        headline: '  Get more leads  ',
        body: 'Paid ads for consultancies',
        media_type: 'image',
        ctwa_clid: 'ARAkLk',
        image_url: 'https://cdn.example/x.jpg',
      }),
    ).toEqual({
      source_type: 'ad',
      source_id: '120210000000',
      source_url: 'https://fb.me/abc',
      headline: 'Get more leads',
      body: 'Paid ads for consultancies',
      media_type: 'image',
      ctwa_clid: 'ARAkLk',
    })
  })

  it('keeps a referral that has only a click id', () => {
    expect(parseReferral({ ctwa_clid: 'abc' })?.ctwa_clid).toBe('abc')
  })

  it('returns null without an ad id or click id', () => {
    expect(parseReferral({ headline: 'no ids here' })).toBeNull()
    expect(parseReferral(undefined)).toBeNull()
    expect(parseReferral('ad')).toBeNull()
  })

  it('ignores non-string fields and clips very long values', () => {
    const r = parseReferral({ source_id: 42, ctwa_clid: 'x', headline: 'h'.repeat(5000) })
    expect(r?.source_id).toBeNull()
    expect(r?.headline).toHaveLength(1000)
  })
})
