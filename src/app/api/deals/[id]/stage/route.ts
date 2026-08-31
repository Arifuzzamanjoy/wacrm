import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { engineSendTemplate, engineSendText } from '@/lib/automations/meta-send';
import { runAutomationsForTrigger } from '@/lib/automations/engine';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import { formatCurrency, DEFAULT_CURRENCY } from '@/lib/currency';
import type { StageWhatsAppNotification } from '@/types';

function interpolateVariables(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, rawKey) => {
    const key = rawKey.trim();
    if (key in vars) {
      return vars[key];
    }
    return match;
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('agent');
    const { id: dealId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const newStageId = typeof body.new_stage_id === 'string' ? body.new_stage_id.trim() : '';
    if (!newStageId) {
      return NextResponse.json(
        { error: 'new_stage_id is required' },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    // 1. Fetch deal with related contact, pipeline, and stage
    const { data: deal, error: dealErr } = await db
      .from('deals')
      .select('*, contact:contacts(*), pipeline:pipelines(*), stage:pipeline_stages(*)')
      .eq('id', dealId)
      .eq('account_id', ctx.accountId)
      .single();

    if (dealErr || !deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    // 2. Fetch target stage
    const { data: targetStage, error: stageErr } = await db
      .from('pipeline_stages')
      .select('*')
      .eq('id', newStageId)
      .eq('pipeline_id', deal.pipeline_id)
      .single();

    if (stageErr || !targetStage) {
      return NextResponse.json(
        { error: 'Target stage not found in this pipeline' },
        { status: 404 }
      );
    }

    const previousStageId = deal.stage_id;

    // A drag that lands the card back on its own stage is a no-op. Without
    // this guard it still messages the client and writes a history row, so
    // one fumbled drag reads to the customer as a real milestone update.
    if (previousStageId === newStageId) {
      return NextResponse.json({
        ok: true,
        deal,
        deal_id: deal.id,
        stage_id: newStageId,
        unchanged: true,
        notification_sent: false,
        whatsapp_message_id: null,
      });
    }

    // 3. Update deal stage
    const { data: updatedDeal, error: updateErr } = await db
      .from('deals')
      .update({
        stage_id: newStageId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', dealId)
      .select('*, contact:contacts(*), pipeline:pipelines(*), stage:pipeline_stages(*)')
      .single();

    if (updateErr || !updatedDeal) {
      return NextResponse.json(
        { error: 'Failed to update deal stage' },
        { status: 500 }
      );
    }

    // 4. Milestone WhatsApp Notification
    let notificationSent = false;
    let whatsappMessageId: string | null = null;
    let notificationTemplate: string | null = null;
    let errorMessage: string | null = null;
    let conversationId: string | undefined = deal.conversation_id ?? undefined;

    const notifConfig = targetStage.whatsapp_notification as StageWhatsAppNotification | null;

    if (notifConfig?.enabled && deal.contact_id && deal.contact?.phone) {
      try {
        // Fetch linked case if any
        const { data: linkedCase } = await db
          .from('cases')
          .select('case_number')
          .eq('account_id', ctx.accountId)
          .eq('primary_contact_id', deal.contact_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Fetch caller agent profile name. `profiles.id` is the row's own
        // uuid — `auth.uid()` lives in `profiles.user_id`, which is what
        // every other lookup in the codebase keys on.
        const { data: profile } = await db
          .from('profiles')
          .select('full_name')
          .eq('user_id', ctx.userId)
          .maybeSingle();

        // Deal currency, else the account default (migration 021), else the
        // app-wide fallback. Hardcoding USD here would misprice the value
        // shown to the client for every account not billing in dollars.
        const { data: acct } = await db
          .from('accounts')
          .select('default_currency')
          .eq('id', ctx.accountId)
          .maybeSingle();
        const currency =
          deal.currency || acct?.default_currency || DEFAULT_CURRENCY;

        const variableMap: Record<string, string> = {
          'contact.name': deal.contact.name || deal.contact.phone,
          'contact.phone': deal.contact.phone,
          'deal.title': deal.title || '',
          'deal.value': formatCurrency(deal.value ?? 0, currency),
          'stage.name': targetStage.name || '',
          'deal.expected_close_date': deal.expected_close_date ? String(deal.expected_close_date) : '',
          'case.case_number': linkedCase?.case_number || '',
          'user.name': profile?.full_name || 'Agent',
        };

        // Resolve or create conversation
        if (!conversationId) {
          const { data: conv } = await db
            .from('conversations')
            .select('id')
            .eq('account_id', ctx.accountId)
            .eq('contact_id', deal.contact_id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (conv?.id) {
            conversationId = conv.id;
          } else {
            const resolved = await resolveConversationByPhone(
              db,
              ctx.accountId,
              deal.contact.phone,
              deal.contact.name
            );
            conversationId = resolved.conversationId;
          }
        }

        if (notifConfig.mode === 'template' && notifConfig.template_name) {
          notificationTemplate = notifConfig.template_name;
          const rawParams = notifConfig.template_params ?? [];
          const interpolatedParams = rawParams.map((p) => interpolateVariables(p, variableMap));

          const sendRes = await engineSendTemplate({
            accountId: ctx.accountId,
            userId: ctx.userId,
            conversationId: conversationId!,
            contactId: deal.contact_id,
            templateName: notifConfig.template_name,
            language: notifConfig.template_language || 'en',
            params: interpolatedParams,
          });

          notificationSent = true;
          whatsappMessageId = sendRes.whatsapp_message_id;
        } else if (notifConfig.mode === 'custom_text' && notifConfig.custom_text) {
          notificationTemplate = 'custom_text';
          const text = interpolateVariables(notifConfig.custom_text, variableMap);

          const sendRes = await engineSendText({
            accountId: ctx.accountId,
            userId: ctx.userId,
            conversationId: conversationId!,
            contactId: deal.contact_id,
            text,
          });

          notificationSent = true;
          whatsappMessageId = sendRes.whatsapp_message_id;
        }
      } catch (err: unknown) {
        errorMessage = err instanceof Error ? err.message : String(err);
        console.error('[deal stage notification] failed to dispatch:', err);
      }
    }

    // 5. Audit history entry
    const { error: histErr } = await db.from('deal_stage_history').insert({
      account_id: ctx.accountId,
      deal_id: deal.id,
      from_stage_id: previousStageId,
      to_stage_id: newStageId,
      user_id: ctx.userId,
      notification_sent: notificationSent,
      notification_template: notificationTemplate,
      whatsapp_message_id: whatsappMessageId,
      error_message: errorMessage,
    });

    if (histErr) {
      console.error('[deal_stage_history] insert error:', histErr);
    }

    // 6. Dispatch deal_stage_changed automations
    runAutomationsForTrigger({
      accountId: ctx.accountId,
      triggerType: 'deal_stage_changed',
      contactId: deal.contact_id,
      context: {
        conversation_id: conversationId,
        vars: {
          deal_id: deal.id,
          deal_title: deal.title,
          deal_value: deal.value,
          pipeline_id: deal.pipeline_id,
          stage_id: newStageId,
          stage_name: targetStage.name,
          previous_stage_id: previousStageId,
        },
      },
    }).catch((err) => console.error('[deal_stage_changed] automation error:', err));

    return NextResponse.json({
      ok: true,
      deal: updatedDeal,
      deal_id: deal.id,
      stage_id: newStageId,
      notification_sent: notificationSent,
      whatsapp_message_id: whatsappMessageId,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  return POST(request, props);
}
