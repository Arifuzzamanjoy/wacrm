import { describe, expect, it } from "vitest";
import { shouldApplyDeepLink } from "./deep-link";

const base = {
  deepLinkConvId: null as string | null,
  lastDeepLinkConvId: null as string | null,
  autoSelectedConvId: null as string | null,
  activeConvId: null as string | null,
  hasConversations: true,
};

describe("shouldApplyDeepLink", () => {
  it("applies a new deep link that points somewhere we are not", () => {
    // Case member "Open Chat" pushes /inbox?c=C while viewing B.
    expect(
      shouldApplyDeepLink({
        ...base,
        deepLinkConvId: "C",
        lastDeepLinkConvId: "B",
        autoSelectedConvId: "B",
        activeConvId: "B",
      })
    ).toBe(true);
  });

  it("applies when arriving from a URL with no previous param", () => {
    expect(
      shouldApplyDeepLink({
        ...base,
        deepLinkConvId: "C",
        lastDeepLinkConvId: null,
      })
    ).toBe(true);
  });

  /**
   * Regression: #271. The one that made the inbox unusable — clicking
   * any conversation bounced straight back to the previous one.
   */
  it("ignores a stale param during the render after a click", () => {
    // User clicked B. State is already B; router.replace has not yet
    // flipped the URL, so the param still reads A — and it is unchanged
    // since the last evaluation, which is the tell.
    expect(
      shouldApplyDeepLink({
        ...base,
        deepLinkConvId: "A",
        lastDeepLinkConvId: "A",
        autoSelectedConvId: "B",
        activeConvId: "B",
      })
    ).toBe(false);
  });

  it("ignores the URL catching up to a click we already applied", () => {
    // The replace landed: param is now B, which we selected ourselves.
    expect(
      shouldApplyDeepLink({
        ...base,
        deepLinkConvId: "B",
        lastDeepLinkConvId: "A",
        autoSelectedConvId: "B",
        activeConvId: "B",
      })
    ).toBe(false);
  });

  /**
   * Regression: #165. A list refresh must not re-apply a deep link the
   * user has already navigated away from.
   */
  it("does not re-apply an id it has already resolved once", () => {
    expect(
      shouldApplyDeepLink({
        ...base,
        deepLinkConvId: "A",
        lastDeepLinkConvId: "A",
        autoSelectedConvId: "A",
        activeConvId: "B",
      })
    ).toBe(false);
  });

  it("ignores an unchanged param even when nothing is active yet", () => {
    expect(
      shouldApplyDeepLink({
        ...base,
        deepLinkConvId: "A",
        lastDeepLinkConvId: "A",
      })
    ).toBe(false);
  });

  it("waits for the conversation list before resolving", () => {
    expect(
      shouldApplyDeepLink({
        ...base,
        deepLinkConvId: "C",
        lastDeepLinkConvId: "B",
        hasConversations: false,
      })
    ).toBe(false);
  });

  it("does nothing when the param is cleared (mobile back)", () => {
    expect(
      shouldApplyDeepLink({
        ...base,
        deepLinkConvId: null,
        lastDeepLinkConvId: "B",
        activeConvId: "B",
      })
    ).toBe(false);
  });

  it("supports the browser back button returning to an earlier thread", () => {
    // Back from C to A: param changed, and A is neither active nor the
    // id we last auto-selected.
    expect(
      shouldApplyDeepLink({
        ...base,
        deepLinkConvId: "A",
        lastDeepLinkConvId: "C",
        autoSelectedConvId: "C",
        activeConvId: "C",
      })
    ).toBe(true);
  });

  it("does not apply when the param already matches the active thread", () => {
    expect(
      shouldApplyDeepLink({
        ...base,
        deepLinkConvId: "B",
        lastDeepLinkConvId: "A",
        autoSelectedConvId: null,
        activeConvId: "B",
      })
    ).toBe(false);
  });
});
