/**
 * Decides whether an `?c=<id>` URL param should take over the inbox's
 * active conversation.
 *
 * This lives outside the component because the rule is subtle enough to
 * have shipped two bugs, and it is far easier to pin down in a unit test
 * than in a full inbox render:
 *
 *  - #165 (fixed earlier): the resolver re-fired on every list refresh
 *    and snapped the user back to the deep-linked thread after they had
 *    clicked elsewhere.
 *  - #271: `router.replace()` is asynchronous, so for one render after a
 *    click `activeConvId` is the newly-clicked conversation while
 *    `deepLinkConvId` still holds the previous one. Treating that stale
 *    value as a fresh navigation selected the *old* conversation back,
 *    making it impossible to switch conversations at all.
 *
 * The rule that satisfies both: act only when the URL param genuinely
 * *changed*, and only when it points somewhere we are not already.
 */
export interface DeepLinkDecisionInput {
  /** Current `?c=` value. */
  deepLinkConvId: string | null;
  /** `?c=` value as of the previous evaluation. */
  lastDeepLinkConvId: string | null;
  /** Conversation id the deep-link resolver last applied. */
  autoSelectedConvId: string | null;
  /** Currently active conversation, if any. */
  activeConvId: string | null;
  /** Whether the conversation list has loaded anything yet. */
  hasConversations: boolean;
}

export function shouldApplyDeepLink({
  deepLinkConvId,
  lastDeepLinkConvId,
  autoSelectedConvId,
  activeConvId,
  hasConversations,
}: DeepLinkDecisionInput): boolean {
  // An unchanged param means something *else* re-triggered evaluation
  // (most often the active conversation changing after a click, while
  // the URL has yet to catch up). Not a navigation — ignore it.
  if (deepLinkConvId === lastDeepLinkConvId) return false;

  // No target, or nothing to match against yet.
  if (!deepLinkConvId || !hasConversations) return false;

  // Already resolved this exact id once; re-applying would clear
  // messages the thread has already fetched.
  if (autoSelectedConvId === deepLinkConvId) return false;

  // Already showing it.
  if (activeConvId === deepLinkConvId) return false;

  return true;
}
