import "server-only";

import type { Denomination } from "@churchy/contracts";
import { checkSlug, createTenant, type CreateTenantResult } from "@/server/platform-db";

/**
 * Church sign-up (SDD §19 step 1): a signed-up person creates their church and becomes its owner.
 * One transaction in the platform database (`createTenant`): tenant on the free plan, profile,
 * owner membership and person, audit entry. Not a server action: the sign-up route calls it after
 * Supabase Auth has created the user (the caller supplies `authUserId`).
 */
export interface SignupInput {
  readonly authUserId: string;
  readonly email: string;
  /** The owner's name, family name first. */
  readonly ownerName: string;
  readonly churchName: string;
  readonly denomination: Denomination;
  /** Wanted subdomain; derived from the church name when omitted. */
  readonly slug?: string;
}

export type SignupResult = CreateTenantResult;

export async function signupChurch(input: SignupInput): Promise<SignupResult> {
  const wanted = input.slug ?? input.churchName;
  const slug = checkSlug(wanted);
  return createTenant({
    name: input.churchName,
    slug: slug.ok ? slug.slug : wanted,
    denomination: input.denomination,
    owner: { authUserId: input.authUserId, email: input.email, name: input.ownerName },
  });
}
