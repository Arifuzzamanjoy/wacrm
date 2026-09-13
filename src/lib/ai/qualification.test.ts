import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  AGENT_ASSESSMENT_SOURCE,
  agentDealTitle,
  applyAgentQualification,
  toLeadAssessmentInput,
} from './qualification'
import type { AgentQualification } from './agent-types'

function qual(overrides: Partial<AgentQualification> = {}): AgentQualification {
  return {
    budget: null,
    authority: null,
    need: null,
    timeline: null,
    service: null,
    summary: null,
    qualified: false,
    ...overrides,
  }
}

describe('toLeadAssessmentInput', () => {
  it('returns null when the agent reported no BANT signal', () => {
    expect(toLeadAssessmentInput(qual({ service: 'seo', qualified: true }))).toBeNull()
  })

  it('fills unknown fields with the most conservative value', () => {
    expect(toLeadAssessmentInput(qual({ budget: 'growth', need: 'urgent' }))).toEqual({
      budget: 'growth',
      authority: 'evaluator',
      need: 'urgent',
      timeline: 'future',
      defaulted: ['authority', 'timeline'],
    })
  })
})

describe('agentDealTitle', () => {
  it('names the deal after the contact and service', () => {
    expect(agentDealTitle('Rahim', 'facebook ads')).toBe('Rahim — facebook ads')
    expect(agentDealTitle(null, null)).toBe('New lead')
  })
})

// ------------------------------------------------------------
// applyAgentQualification against a tiny in-memory Supabase fake.
// ------------------------------------------------------------

interface FakeState {
  latestAssessment: Record<string, unknown> | null
  existingDeals: { id: string }[]
  inserts: { table: string; row: Record<string, unknown> }[]
}

function fakeDb(state: FakeState): SupabaseClient {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {}
    const self = () => q
    q.select = self
    q.eq = self
    q.in = self
    q.order = self
    q.limit = () => {
      if (table === 'deals') return Promise.resolve({ data: state.existingDeals, error: null })
      return q
    }
    q.maybeSingle = () => {
      if (table === 'contact_eligibility_assessments') {
        return Promise.resolve({
          data: state.latestAssessment ? { input_parameters: state.latestAssessment } : null,
          error: null,
        })
      }
      return Promise.resolve({ data: { default_currency: 'BDT' }, error: null })
    }
    q.insert = (row: Record<string, unknown>) => {
      state.inserts.push({ table, row })
      return Promise.resolve({ error: null })
    }
    return q
  }
  return { from: chain } as unknown as SupabaseClient
}

const BASE = {
  accountId: 'acct-1',
  contactId: 'contact-1',
  conversationId: 'conv-1',
  contactName: 'Rahim',
  configOwnerUserId: 'user-1',
}

describe('applyAgentQualification', () => {
  let state: FakeState
  beforeEach(() => {
    state = { latestAssessment: null, existingDeals: [], inserts: [] }
  })

  it('records a lead-score assessment tagged as agent-sourced', async () => {
    await applyAgentQualification(fakeDb(state), {
      ...BASE,
      qualification: qual({
        budget: 'enterprise',
        authority: 'decision_maker',
        need: 'urgent',
        timeline: 'immediate',
      }),
      config: { dealPipelineId: null, dealStageId: null },
    })

    expect(state.inserts).toHaveLength(1)
    const { table, row } = state.inserts[0]
    expect(table).toBe('contact_eligibility_assessments')
    expect(row).toMatchObject({
      assessment_type: 'lead_score',
      total_score: 100,
      tier: 'hot',
      created_by_user_id: null,
    })
    expect(row.input_parameters).toMatchObject({ source: AGENT_ASSESSMENT_SOURCE })
  })

  it('skips the assessment when the BANT answers did not change', async () => {
    state.latestAssessment = {
      budget: 'growth',
      authority: 'evaluator',
      need: 'planned',
      timeline: 'future',
    }
    await applyAgentQualification(fakeDb(state), {
      ...BASE,
      qualification: qual({ budget: 'growth', need: 'planned' }),
      config: { dealPipelineId: null, dealStageId: null },
    })
    expect(state.inserts).toHaveLength(0)
  })

  it('opens one deal for a qualified lead in the configured stage', async () => {
    await applyAgentQualification(fakeDb(state), {
      ...BASE,
      qualification: qual({ qualified: true, service: 'meta ads', summary: 'clinic, wants a call' }),
      config: { dealPipelineId: 'pipe-1', dealStageId: 'stage-1' },
    })

    const deal = state.inserts.find((i) => i.table === 'deals')?.row
    expect(deal).toMatchObject({
      pipeline_id: 'pipe-1',
      stage_id: 'stage-1',
      contact_id: 'contact-1',
      conversation_id: 'conv-1',
      title: 'Rahim — meta ads',
      currency: 'BDT',
      status: 'open',
      user_id: 'user-1',
    })
  })

  it('does not stack a second open deal for the same contact', async () => {
    state.existingDeals = [{ id: 'deal-1' }]
    await applyAgentQualification(fakeDb(state), {
      ...BASE,
      qualification: qual({ qualified: true }),
      config: { dealPipelineId: 'pipe-1', dealStageId: 'stage-1' },
    })
    expect(state.inserts.filter((i) => i.table === 'deals')).toHaveLength(0)
  })

  it('never creates deals without a configured target', async () => {
    await applyAgentQualification(fakeDb(state), {
      ...BASE,
      qualification: qual({ qualified: true }),
      config: { dealPipelineId: 'pipe-1', dealStageId: null },
    })
    expect(state.inserts).toHaveLength(0)
  })
})
