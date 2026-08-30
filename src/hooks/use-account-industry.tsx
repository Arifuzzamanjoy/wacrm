"use client";

import { useCallback, useEffect, useState } from "react";
import { getIndustryMeta, type IndustryMeta } from "@/lib/checklists/industries";

/**
 * The account's business vertical, plus the label set derived from it.
 *
 * Several places in the inbox need this at once (the contact sidebar's
 * tab strip, the scoring panel's mode list, the checklist template
 * picker), so the value is cached module-side and shared: the first
 * mount fetches, every later consumer reads the cache. Without that,
 * opening a conversation fired three identical /api/account requests.
 *
 * The cache is invalidated by `setAccountIndustry`, which the settings
 * picker calls after a successful save so open inbox tabs relabel
 * without a reload.
 */

let cachedIndustry: string | null | undefined; // undefined = not fetched
let inFlight: Promise<string | null> | null = null;
const subscribers = new Set<(industry: string | null) => void>();

function notify(industry: string | null) {
  cachedIndustry = industry;
  for (const fn of subscribers) fn(industry);
}

async function fetchIndustry(): Promise<string | null> {
  if (cachedIndustry !== undefined) return cachedIndustry;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch("/api/account");
      if (!res.ok) return null;
      const data = await res.json();
      return (data?.account?.industry as string | null) ?? null;
    } catch {
      // Offline or auth blip — treat as "not set" and let a later
      // consumer retry rather than surfacing an error in the tab strip.
      return null;
    } finally {
      inFlight = null;
    }
  })();

  const value = await inFlight;
  notify(value);
  return value;
}

/** Push a new value into the shared cache after the settings save. */
export function setAccountIndustry(industry: string | null) {
  notify(industry);
}

/** Drop the cache so the next consumer refetches (used on sign-out). */
export function resetAccountIndustryCache() {
  cachedIndustry = undefined;
  inFlight = null;
}

export interface UseAccountIndustryResult {
  /** Raw stored value; null when the account hasn't chosen one. */
  industry: string | null;
  /** Resolved label set — falls back to the neutral "General" vertical. */
  meta: IndustryMeta;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useAccountIndustry(): UseAccountIndustryResult {
  const [industry, setIndustry] = useState<string | null>(
    cachedIndustry ?? null
  );
  const [loading, setLoading] = useState(cachedIndustry === undefined);

  useEffect(() => {
    let active = true;
    const onChange = (next: string | null) => {
      if (active) setIndustry(next);
    };
    subscribers.add(onChange);

    // Only the cold path touches state here. When the cache is already
    // warm the useState initializers above have read it, so re-setting
    // it would just be a cascading no-op render.
    if (cachedIndustry === undefined) {
      fetchIndustry().finally(() => {
        if (active) setLoading(false);
      });
    }

    return () => {
      active = false;
      subscribers.delete(onChange);
    };
  }, []);

  const refresh = useCallback(async () => {
    cachedIndustry = undefined;
    inFlight = null;
    setLoading(true);
    await fetchIndustry();
    setLoading(false);
  }, []);

  return { industry, meta: getIndustryMeta(industry), loading, refresh };
}
