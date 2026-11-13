/** Mock repositories: tenants, members, billing, organizations. */
import type {
  BillingAccount,
  BillingRepo,
  Ctx,
  Domain,
  HostResolution,
  Member,
  Membership,
  MembershipRepo,
  OrgLink,
  OrganizationRepo,
  Subscription,
  Tenant,
  TenantRepo,
} from "@churchy/contracts";
import {
  BillingAccountInputSchema,
  ContractError,
  DealInputSchema,
  DomainInputSchema,
  DomainSchema,
  IdSchema,
  InviteMemberInputSchema,
  OrgDelegationSchema,
  OrgMembershipInputSchema,
  OrganizationInputSchema,
  RedirectInputSchema,
  RedirectSchema,
  SiteConfigOverridesSchema,
  SubscriptionInputSchema,
  SubscriptionSchema,
  TenantCreateInputSchema,
  TenantUpdateInputSchema,
  UpdateMembershipInputSchema,
  conflict,
  ctxScope,
  huCollator,
  isAnonymous,
  notFound,
  parseInput,
  requireOrgId,
  requirePlatform,
} from "@churchy/contracts";
import { toBudapestDate } from "@churchy/schedule";
import { MockSimulationError } from "../simulation";
import type { RepoDeps } from "./helpers";
import { actorUserId, readTenant, save, send, staffTenant, writeTenant } from "./helpers";

// ---------------------------------------------------------------------------------------------
// tenants
// ---------------------------------------------------------------------------------------------

export function mockTenants({ store }: RepoDeps): TenantRepo {
  const d = () => store.data;
  const tenantOf = (id: string) => d().tenants.find((t) => t.id === id) ?? null;
  const resolution = (tenant: Tenant): HostResolution => ({
    tenantId: tenant.id,
    slug: tenant.slug,
    primaryHostname:
      d().domains.find((x) => x.tenantId === tenant.id && x.isPrimary && x.verifiedAt !== null)
        ?.hostname ?? null,
  });
  const ownTenant = (ctx: Ctx) => {
    const tenantId = writeTenant(ctx);
    const tenant = tenantOf(tenantId);
    if (!tenant) throw notFound("Tenant", tenantId);
    return tenant;
  };
  const ownDomain = (ctx: Ctx, id: string) => {
    const tenantId = writeTenant(ctx);
    const domain = d().domains.find((x) => x.id === id && x.tenantId === tenantId);
    if (!domain) throw notFound("Domain", id);
    return domain;
  };

  return {
    async current(ctx) {
      const tenantId = readTenant(ctx);
      return tenantId === null ? null : tenantOf(tenantId);
    },
    async findBySlug(ctx, slug) {
      requirePlatform(ctx);
      const tenant = d().tenants.find((t) => t.slug === slug);
      return tenant ? resolution(tenant) : null;
    },
    async findByHostname(ctx, hostname) {
      requirePlatform(ctx);
      const host = hostname.toLowerCase();
      const domain = d().domains.find((x) => x.hostname === host && x.verifiedAt !== null);
      const tenant = domain ? tenantOf(domain.tenantId) : null;
      return tenant ? resolution(tenant) : null;
    },
    async create(ctx, input) {
      const scope = ctxScope(ctx);
      if (scope.kind === "tenant") {
        throw new ContractError("CONTEXT", "Tenants are created from a platform or org context");
      }
      const data = parseInput(TenantCreateInputSchema, input);
      if (d().tenants.some((t) => t.slug === data.slug)) {
        throw conflict("Slug already used", { field: "slug" });
      }
      const stamp = store.nowIso();
      const tenant: Tenant = {
        id: store.nextId("tenant"),
        slug: data.slug,
        name: data.name,
        denomination: data.denomination,
        status: "active",
        siteConfig: data.siteConfig,
        planKey: data.planKey,
        wsTier: "none",
        organizationId: data.organizationId ?? (scope.kind === "org" ? scope.orgId : null),
        launchedAt: null,
        createdAt: stamp,
        updatedAt: stamp,
      };
      d().tenants.push(tenant);
      return tenant;
    },
    async update(ctx, input) {
      const tenant = ownTenant(ctx);
      const patch = parseInput(TenantUpdateInputSchema, input);
      const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      return save(d().tenants, { ...tenant, ...defined, updatedAt: store.nowIso() });
    },
    async updateSiteConfig(ctx, overrides) {
      const tenant = ownTenant(ctx);
      const siteConfig = parseInput(SiteConfigOverridesSchema, overrides);
      return save(d().tenants, { ...tenant, siteConfig, updatedAt: store.nowIso() });
    },
    async listDomains(ctx) {
      const tenantId = staffTenant(ctx);
      return d().domains.filter((x) => x.tenantId === tenantId);
    },
    async addDomain(ctx, input) {
      const tenantId = writeTenant(ctx);
      const { hostname } = parseInput(DomainInputSchema, input);
      if (d().domains.some((x) => x.hostname === hostname)) {
        throw conflict("Domain already in use", { field: "hostname" });
      }
      const domain: Domain = {
        id: store.nextId("domain"),
        tenantId,
        hostname,
        isPrimary: false,
        verifiedAt: null,
        tlsStatus: "pending",
        createdAt: store.nowIso(),
      };
      d().domains.push(domain);
      return domain;
    },
    async updateDomain(ctx, id, patch) {
      const domain = ownDomain(ctx, id);
      const data = parseInput(
        DomainSchema.pick({ verifiedAt: true, tlsStatus: true }).partial(),
        patch,
      );
      const defined = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      return save(d().domains, { ...domain, ...defined });
    },
    async setPrimaryDomain(ctx, id) {
      const domain = ownDomain(ctx, id);
      for (const [i, x] of d().domains.entries()) {
        if (x.tenantId === domain.tenantId) d().domains[i] = { ...x, isPrimary: x.id === id };
      }
    },
    async removeDomain(ctx, id) {
      const domain = ownDomain(ctx, id);
      d().domains = d().domains.filter((x) => x.id !== domain.id);
    },
    async findRedirect(ctx, fromPath) {
      const tenantId = readTenant(ctx);
      return d().redirects.find((r) => r.tenantId === tenantId && r.fromPath === fromPath) ?? null;
    },
    async upsertRedirect(ctx, input) {
      const tenantId = writeTenant(ctx);
      const redirect = parseInput(RedirectSchema, {
        ...parseInput(RedirectInputSchema, input),
        tenantId,
      });
      d().redirects = d().redirects.filter(
        (r) => !(r.tenantId === tenantId && r.fromPath === redirect.fromPath),
      );
      d().redirects.push(redirect);
      return redirect;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// members
// ---------------------------------------------------------------------------------------------

export function mockMembers({ store }: RepoDeps): MembershipRepo {
  const d = () => store.data;
  const withUser = (m: Membership): Member => {
    const user = d().users.find((u) => u.id === m.userId);
    if (!user) throw notFound("User", m.userId);
    return { ...m, user };
  };
  const isActiveOwner = (m: Membership) => m.active && m.role === "owner";

  return {
    async list(ctx) {
      const tenantId = staffTenant(ctx);
      return d()
        .memberships.filter((m) => m.tenantId === tenantId)
        .map(withUser)
        .sort((a, b) => huCollator.compare(a.user.name, b.user.name));
    },
    async get(ctx, userId) {
      const tenantId = staffTenant(ctx);
      const m = d().memberships.find((x) => x.tenantId === tenantId && x.userId === userId);
      return m ? withUser(m) : null;
    },
    async invite(ctx, input) {
      const tenantId = writeTenant(ctx);
      const data = parseInput(InviteMemberInputSchema, input);
      const email = data.email.toLowerCase();
      let user = d().users.find((u) => u.email.toLowerCase() === email);
      if (!user) {
        user = {
          id: store.nextId("user"),
          email,
          name: data.name,
          twoFactorEnabled: false,
          lastLoginAt: null,
        };
        d().users.push(user);
      }
      if (d().memberships.some((m) => m.tenantId === tenantId && m.userId === user.id)) {
        throw conflict("Already a member of this tenant");
      }
      const stamp = store.nowIso();
      const membership: Membership = {
        tenantId,
        userId: user.id,
        role: data.role,
        groupIds: data.groupIds,
        wsRoles: data.wsRoles,
        teamIds: data.teamIds,
        roomIds: data.roomIds,
        hrCategoryIds: data.hrCategoryIds,
        active: true,
        invitedAt: stamp,
        createdAt: stamp,
      };
      d().memberships.push(membership);
      send(store, {
        channel: "email",
        template: "member.invitation",
        recipient: { kind: "user", userId: user.id },
        tenantId,
        params: { link: "/belepes" },
      });
      return withUser(membership);
    },
    async update(ctx, userId, patch) {
      const tenantId = writeTenant(ctx);
      const index = d().memberships.findIndex(
        (m) => m.tenantId === tenantId && m.userId === userId,
      );
      const current = d().memberships[index];
      if (!current) throw notFound("Membership", userId);
      const data = parseInput(UpdateMembershipInputSchema, patch);
      const defined = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      const next: Membership = { ...current, ...defined };
      if (isActiveOwner(current) && !isActiveOwner(next)) {
        const others = d().memberships.filter(
          (m) => m.tenantId === tenantId && m.userId !== userId && isActiveOwner(m),
        );
        if (others.length === 0) throw conflict("A tenant needs at least one active owner");
      }
      d().memberships[index] = next;
      return withUser(next);
    },
    async listOwnMemberships(ctx) {
      ctxScope(ctx);
      if (isAnonymous(ctx)) return [];
      return d().memberships.filter((m) => m.userId === ctx.actor.userId);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// billing
// ---------------------------------------------------------------------------------------------

type Owner = { ownerType: BillingAccount["ownerType"]; ownerId: string };

export function mockBilling({ store }: RepoDeps): BillingRepo {
  const d = () => store.data;
  /** The billing owner of a read; null when the ctx sees no billing data. */
  const readOwner = (ctx: Ctx): Owner | null => {
    const scope = ctxScope(ctx);
    if (isAnonymous(ctx)) return null;
    if (scope.kind === "tenant") return { ownerType: "tenant", ownerId: scope.tenantId };
    if (scope.kind === "org") return { ownerType: "organization", ownerId: scope.orgId };
    return null;
  };
  const writeOwner = (ctx: Ctx): Owner => {
    const scope = ctxScope(ctx);
    if (scope.kind === "platform") {
      throw new ContractError("CONTEXT", "Billing needs a tenant or organization context");
    }
    actorUserId(ctx);
    return readOwner(ctx) as Owner;
  };
  const accountOf = (owner: Owner | null) =>
    owner === null
      ? null
      : (d().billingAccounts.find(
          (a) => a.ownerType === owner.ownerType && a.ownerId === owner.ownerId,
        ) ?? null);
  const failPayment = (owner: Owner) => {
    if (!store.switches.paymentFailure) return;
    send(store, {
      channel: "email",
      template: "billing.paymentFailed",
      recipient: { kind: "persona", persona: "billingContact" },
      tenantId: owner.ownerType === "tenant" ? owner.ownerId : null,
      params: { link: "/admin/elofizetes" },
    });
    throw new MockSimulationError("PAYMENT_FAILED", "Simulated payment failure");
  };

  return {
    async listPlans(ctx) {
      ctxScope(ctx);
      return d().plans;
    },
    async getEntitlementSources(ctx) {
      const tenantId = readTenant(ctx);
      if (tenantId === null) throw new ContractError("CONTEXT", "Needs a tenant context");
      const tenant = d().tenants.find((t) => t.id === tenantId);
      if (!tenant) throw notFound("Tenant", tenantId);
      const websitePlan = d().plans.find((p) => p.key === tenant.planKey);
      if (!websitePlan) throw notFound("Plan", tenant.planKey);
      const workspacePlan =
        tenant.wsTier === "none"
          ? null
          : (d().plans.find((p) => p.key === `ws_${tenant.wsTier}`) ?? null);
      const today = toBudapestDate(store.nowIso());
      const deal =
        tenant.organizationId === null
          ? undefined
          : d().deals.find(
              (x) =>
                x.organizationId === tenant.organizationId &&
                x.validFrom <= today &&
                (x.validTo === null || x.validTo >= today),
            );
      return {
        websitePlan,
        workspacePlan,
        deal: deal
          ? {
              id: deal.id,
              planKeys: deal.planKeys,
              validFrom: deal.validFrom,
              validTo: deal.validTo,
            }
          : null,
      };
    },
    async getBillingAccount(ctx) {
      return accountOf(readOwner(ctx));
    },
    async upsertBillingAccount(ctx, input) {
      const owner = writeOwner(ctx);
      const data = parseInput(BillingAccountInputSchema, input);
      const existing = accountOf(owner);
      return save(d().billingAccounts, {
        ...data,
        id: existing?.id ?? store.nextId("billing"),
        ...owner,
      });
    },
    async listSubscriptions(ctx) {
      const account = accountOf(readOwner(ctx));
      return d().subscriptions.filter((s) => s.billingAccountId === account?.id);
    },
    async createSubscription(ctx, input) {
      const owner = writeOwner(ctx);
      const data = parseInput(SubscriptionInputSchema, input);
      const account = accountOf(owner);
      if (!account) throw notFound("BillingAccount");
      if (
        owner.ownerType === "tenant" &&
        data.tenantId !== null &&
        data.tenantId !== owner.ownerId
      ) {
        throw notFound("Tenant", data.tenantId);
      }
      failPayment(owner);
      const subscription: Subscription = {
        ...data,
        id: store.nextId("sub"),
        billingAccountId: account.id,
      };
      d().subscriptions.push(subscription);
      return subscription;
    },
    async updateSubscription(ctx, id, patch) {
      const owner = writeOwner(ctx);
      const account = accountOf(owner);
      const current = d().subscriptions.find(
        (s) => s.id === id && account !== null && s.billingAccountId === account.id,
      );
      if (!current) throw notFound("Subscription", id);
      const data = parseInput(
        SubscriptionSchema.pick({ status: true, currentPeriodEnd: true, planKey: true }).partial(),
        patch,
      );
      failPayment(owner);
      const defined = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      return save(d().subscriptions, { ...current, ...defined });
    },
    async listInvoices(ctx) {
      const account = accountOf(readOwner(ctx));
      return d()
        .invoices.filter((i) => i.billingAccountId === account?.id)
        .sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt));
    },
  };
}

// ---------------------------------------------------------------------------------------------
// organizations
// ---------------------------------------------------------------------------------------------

export function mockOrganizations({ store }: RepoDeps): OrganizationRepo {
  const d = () => store.data;
  const orgOf = (ctx: Ctx) => {
    const scope = ctxScope(ctx);
    return scope.kind === "org" ? scope.orgId : null;
  };
  const visibleLink = (ctx: Ctx, id: string): OrgLink => {
    const scope = ctxScope(ctx);
    actorUserId(ctx);
    const link = d().orgLinks.find(
      (l) =>
        l.id === id &&
        ((scope.kind === "org" && l.orgId === scope.orgId) ||
          (scope.kind === "tenant" && l.tenantId === scope.tenantId)),
    );
    if (!link) throw notFound("OrgLink", id);
    return link;
  };
  const activeLinked = (orgId: string, tenantId: string) =>
    d().orgLinks.some((l) => l.orgId === orgId && l.tenantId === tenantId && l.status === "active");

  return {
    async current(ctx) {
      const orgId = orgOf(ctx);
      return d().organizations.find((o) => o.id === orgId) ?? null;
    },
    async findBySlug(ctx, slug) {
      requirePlatform(ctx);
      return d().organizations.find((o) => o.slug === slug) ?? null;
    },
    async create(ctx, input) {
      requirePlatform(ctx);
      const data = parseInput(OrganizationInputSchema, input);
      if (d().organizations.some((o) => o.slug === data.slug)) {
        throw conflict("Slug already used", { field: "slug" });
      }
      const stamp = store.nowIso();
      const org = { ...data, id: store.nextId("org"), createdAt: stamp, updatedAt: stamp };
      d().organizations.push(org);
      return org;
    },
    async listMembers(ctx) {
      const orgId = orgOf(ctx);
      return d().orgMemberships.filter((m) => m.orgId === orgId);
    },
    async upsertMember(ctx, input) {
      const orgId = requireOrgId(ctx);
      const data = parseInput(OrgMembershipInputSchema, input);
      if (!d().users.some((u) => u.id === data.userId)) throw notFound("User", data.userId);
      const member = { ...data, orgId };
      d().orgMemberships = d().orgMemberships.filter(
        (m) => !(m.orgId === orgId && m.userId === data.userId),
      );
      d().orgMemberships.push(member);
      return member;
    },
    async listLinks(ctx) {
      const scope = ctxScope(ctx);
      if (isAnonymous(ctx)) return [];
      if (scope.kind === "org") return d().orgLinks.filter((l) => l.orgId === scope.orgId);
      if (scope.kind === "tenant") return d().orgLinks.filter((l) => l.tenantId === scope.tenantId);
      return [];
    },
    async requestLink(ctx, target) {
      const scope = ctxScope(ctx);
      const userId = actorUserId(ctx);
      let orgId: string;
      let tenantId: string;
      if (scope.kind === "org") {
        orgId = scope.orgId;
        tenantId = parseInput(IdSchema, target.tenantId);
        if (!d().tenants.some((t) => t.id === tenantId)) throw notFound("Tenant", tenantId);
      } else if (scope.kind === "tenant") {
        tenantId = scope.tenantId;
        orgId = parseInput(IdSchema, target.orgId);
        if (!d().organizations.some((o) => o.id === orgId)) throw notFound("Organization", orgId);
      } else {
        throw new ContractError("CONTEXT", "Links are requested from a tenant or org context");
      }
      if (
        d().orgLinks.some(
          (l) => l.orgId === orgId && l.tenantId === tenantId && l.status !== "revoked",
        )
      ) {
        throw conflict("A link already exists");
      }
      const link: OrgLink = {
        id: store.nextId("link"),
        orgId,
        tenantId,
        status: "requested",
        requestedBy: userId,
        approvedByParish: scope.kind === "tenant" ? userId : null,
        approvedByOrg: scope.kind === "org" ? userId : null,
        linkedAt: null,
        revokedAt: null,
      };
      d().orgLinks.push(link);
      return link;
    },
    async approveLink(ctx, linkId) {
      const link = visibleLink(ctx, linkId);
      if (link.status === "revoked") throw conflict("The link was revoked");
      const userId = actorUserId(ctx);
      const next: OrgLink =
        ctx.orgId !== undefined
          ? { ...link, approvedByOrg: link.approvedByOrg ?? userId }
          : { ...link, approvedByParish: link.approvedByParish ?? userId };
      if (
        next.approvedByOrg !== null &&
        next.approvedByParish !== null &&
        next.status !== "active"
      ) {
        next.status = "active";
        next.linkedAt = store.nowIso();
      }
      return save(d().orgLinks, next);
    },
    async revokeLink(ctx, linkId) {
      const link = visibleLink(ctx, linkId);
      if (link.status === "revoked") return link;
      return save(d().orgLinks, { ...link, status: "revoked", revokedAt: store.nowIso() });
    },
    async listDelegations(ctx) {
      const scope = ctxScope(ctx);
      if (isAnonymous(ctx)) return [];
      if (scope.kind === "tenant") {
        return d().orgDelegations.filter((x) => x.tenantId === scope.tenantId);
      }
      if (scope.kind === "org") {
        return d().orgDelegations.filter(
          (x) => x.orgId === scope.orgId && activeLinked(scope.orgId, x.tenantId),
        );
      }
      return [];
    },
    async setDelegations(ctx, orgId, hrCategoryKeys) {
      const tenantId = writeTenant(ctx);
      if (!d().organizations.some((o) => o.id === orgId)) throw notFound("Organization", orgId);
      const rows = parseInput(
        OrgDelegationSchema.array(),
        [...new Set(hrCategoryKeys)].map((hrCategoryKey) => ({ orgId, tenantId, hrCategoryKey })),
      );
      d().orgDelegations = d().orgDelegations.filter(
        (x) => !(x.orgId === orgId && x.tenantId === tenantId),
      );
      d().orgDelegations.push(...rows);
      return rows;
    },
    async listDeals(ctx) {
      const orgId = orgOf(ctx);
      return d().deals.filter((x) => x.organizationId === orgId);
    },
    async upsertDeal(ctx, organizationId, input) {
      requirePlatform(ctx);
      if (!d().organizations.some((o) => o.id === organizationId)) {
        throw notFound("Organization", organizationId);
      }
      const { id, ...data } = parseInput(DealInputSchema, input);
      if (
        id !== undefined &&
        !d().deals.some((x) => x.id === id && x.organizationId === organizationId)
      ) {
        throw notFound("Deal", id);
      }
      return save(d().deals, { ...data, id: id ?? store.nextId("deal"), organizationId });
    },
    async listParishStatus(ctx) {
      const orgId = orgOf(ctx);
      if (orgId === null) return [];
      const links = d().orgLinks.filter((l) => l.orgId === orgId);
      const linkStatus = (tenantId: string): OrgLink["status"] | null => {
        const own = links.filter((l) => l.tenantId === tenantId);
        return (own.find((l) => l.status !== "revoked") ?? own.at(-1))?.status ?? null;
      };
      return d()
        .tenants.filter((t) => t.organizationId === orgId || links.some((l) => l.tenantId === t.id))
        .sort((a, b) => huCollator.compare(a.name, b.name))
        .map((t) => ({
          tenantId: t.id,
          name: t.name,
          slug: t.slug,
          launched: t.launchedAt !== null,
          linkStatus: linkStatus(t.id),
        }));
    },
  };
}
