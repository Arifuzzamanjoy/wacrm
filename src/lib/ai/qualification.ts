import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateLeadScore } from '@/lib/immigration/crs-calculator'
import type { AgentQualification } from './agent-types'
import type { AiConfig } from './types'

// ============================================================
// Apply the external agent's lead qualification to the CRM.
//
//  - Records a BANT `lead_score` assessment on the contact, so the
//    inbox Lead Score panel opens pre-filled with what the agent learned
//    (the same table the panel's own scoring uses).
//  - When the agent marks the lead `qualified` and the account picked a
//    pipeline + stage for agent deals, opens one deal for the contact.
//
// Best-effort throughout: a CRM write failing must never block the
// customer-facing reply, so nothing here throws.
// ============================================================

/** Marker stored in `input_parameters.source` for agent-written rows. */
export const AGENT_ASSESSMENT_SOURCE = 'ai_agent'

export interface LeadAssessmentInput {
  budget: NonNullable<AgentQualification['budget']>
  authority: NonNullable<AgentQualification['authority']>
  need: NonNullable<AgentQualification['need']>
  timeline: NonNullable<AgentQualification['timeline']>
  /** BANT fields the agent didn't report, filled with the most
   *  conservative value so an unknown never inflates the score. */
  defaulted: string[]
}

/**
 * Turn a partial agent qualification into a complete BANT input, or
 * null when the agent reported no BANT signal at all (nothing to score).
 */
export function toLeadAssessmentInput(
  q: AgentQualification,
): LeadAssessmentInput | null {
  if (!q.budget && !q.authority && !q.need && !q.timeline) return null
  const defaulted: string[] = []
  if (!q.budget) defaulted.push('budget')
  if (!q.authority) defaulted.push('authority')
  if (!q.need) defaulted.push('need')
  if (!q.timeline) defaulted.push('timeline')
  return {
    budget: q.budget ?? 'none',
    authority: q.authority ?? 'evaluator',
    need: q.need ?? 'exploring',
    timeline: q.timeline ?? 'future',
    defaulted,
  }
}

/** Deal title for an agent-qualified lead. */
export function agentDealTitle(
  contactName: string | null,
  service: string | null,
): string {
  const who = contactName?.trim() || 'New lead'
  return service ? `${who} — ${service}` : who
}

function sameBant(
  a: Record<string, unknown> | null | undefined,
  b: LeadAssessmentInput,
): boolean {
  return (
    !!a &&
    a.budget === b.budget &&
    a.authority === b.authority &&
    a.need === b.need &&
    a.timeline === b.timeline
  )
}

export interface ApplyQualificationArgs {
  accountId: string
  contactId: string
  conversationId: string
  contactName: string | null
  /** Audit user for the deal row (NOT NULL FK). */
  configOwnerUserId: string
  qualification: AgentQualification
  config: Pick<AiConfig, 'dealPipelineId' | 'dealStageId'>
}

export async function applyAgentQualification(
  db: SupabaseClient,
  args: ApplyQualificationArgs,
): Promise<void> {
  const { accountId, contactId, conversationId, qualification: q } = args

  try {
    const bant = toLeadAssessmentInput(q)
    if (bant) {
      // Skip a no-op write when the agent repeats what it already told us
      // on the previous turn — keeps the assessment history meaningful.
      const { data: latest } = await db
        .from('contact_eligibility_assessments')
        .select('input_parameters')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .eq('assessment_type', 'lead_score')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!sameBant(latest?.input_parameters as Record<string, unknown>, bant)) {
        const result = calculateLeadScore(bant)
        const { error } = await db.from('contact_eligibility_assessments').insert({
          account_id: accountId,
          contact_id: contactId,
          created_by_user_id: null,
          assessment_type: 'lead_score',
          total_score: result.score,
          max_score: 100,
          tier: result.tier,
          tier_label: result.tierLabel,
          input_parameters: {
            budget: bant.budget,
            authority: bant.authority,
            need: bant.need,
            timeline: bant.timeline,
            defaulted: bant.defaulted,
            source: AGENT_ASSESSMENT_SOURCE,
            service: q.service,
            conversation_id: conversationId,
          },
          recommendation: q.summary,
          formatted_summary: result.summary,
        })
        if (error) console.error('[ai qualification] assessment insert failed:', error)
      }
    }

    const { dealPipelineId, dealStageId } = args.config
    if (q.qualified && dealPipelineId && dealStageId) {
      await openAgentDeal(db, { ...args, dealPipelineId, dealStageId })
    }
  } catch (err) {
    console.error('[ai qualification] apply failed:', err)
  }
}

async function openAgentDeal(
  db: SupabaseClient,
  args: ApplyQualificationArgs & { dealPipelineId: string; dealStageId: string },
): Promise<void> {
  // One open deal per contact per pipeline: the agent re-reports
  // `qualified` on every later turn, which must not stack duplicates.
  const { data: existing } = await db
    .from('deals')
    .select('id')
    .eq('account_id', args.accountId)
    .eq('contact_id', args.contactId)
    .eq('pipeline_id', args.dealPipelineId)
    .in('status', ['open', 'active'])
    .limit(1)
  if (existing && existing.length > 0) return

  const { data: acct } = await db
    .from('accounts')
    .select('default_currency')
    .eq('id', args.accountId)
    .maybeSingle()

  const { error } = await db.from('deals').insert({
    account_id: args.accountId,
    user_id: args.configOwnerUserId,
    pipeline_id: args.dealPipelineId,
    stage_id: args.dealStageId,
    contact_id: args.contactId,
    conversation_id: args.conversationId,
    title: agentDealTitle(args.contactName, args.qualification.service),
    notes: args.qualification.summary
      ? `🤖 Qualified by AI agent: ${args.qualification.summary}`
      : '🤖 Qualified by AI agent',
    value: 0,
    currency: acct?.default_currency ?? 'USD',
    status: 'open',
  })
  if (error) console.error('[ai qualification] deal insert failed:', error)
}
