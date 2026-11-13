# @churchy/policy

The single permission policy for Churchy (D-05, SDD §11.3, §21.2, §25.4, §25.7, §28). It is pure
TypeScript with **zero runtime dependencies**, no IO, no framework imports and no clock. The
prototype UI uses it to decide visibility, and the server enforces the **same code** for every
mutation. It is never mocked.

```ts
import { can, explain, tenantActor } from "@churchy/policy";

const actor = tenantActor({
  tenantId: "t-1",
  userId: "u-1",
  personId: "p-1",
  websiteRoles: ["groupLeader"],
  groupIds: ["g-ifjusag"],
});

can(actor, "event.edit", { tenantId: "t-1", groupId: "g-ifjusag" }); // true
explain(actor, "news.publish", { tenantId: "t-1" });
// { allowed: false, reason: "no role of the actor grants news.publish" }
```

- `can(actor, action, resource): boolean`
- `explain(actor, action, resource): { allowed, reason }`: the reason is English text for tests
  and dev tooling. Never show it to users.
- The resource type depends on the action (`ResourceByAction[A]`), so a wrong resource shape is a
  compile error.

## Principles

- **Deny by default.** Every case the matrices do not grant is denied, and so is any malformed
  input, unknown action or unknown actor kind. Malformed input never throws. A missing scope
  means _none_. Unrestricted scopes must be passed explicitly as `"*"`.
- **Additive roles.** Website and workspace roles combine. The first role that grants the action
  allows it.
- **Tenant isolation.** A tenant actor is denied any resource whose `tenantId` is not its own.
- **Exclusive context.** An actor is in a tenant context **or** an organization context, never
  both. The types forbid it (`orgId?: never` / `tenantId?: never`), and a runtime check denies
  everything if such an actor gets through anyway.
- **Hard exclusions.**
  - Confidential HR categories are visible only to a confidential handler scoped to that category,
    plus the requester. The `leader` role (Vezető) gets no confidential access, and confidential
    tickets are never routed to managers.
  - Platform actors, and tenant actors acting through support access (`impersonatedBy`), are denied
    every `hr.*` action, including the impersonated user's own tickets.

## Actor

`Actor = TenantActor | OrgActor | PlatformActor | AnonymousActor`. The server builds it from the
memberships behind the request context
`Ctx = { tenantId?, orgId?, actor: { userId, personId } }`.

| Kind        | Fields                                                                                                                                                                                                                                                                                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenant`    | `tenantId`, `userId`, `personId`, `websiteRoles`, `workspaceRoles`, plus scopes: `groupIds` (groupLeader), `leadTeamIds` (teamLeader), `memberTeamIds` (all teams of the person), `managedRoomIds` (roomManager), `hrCategoryIds` (hrHandler, ids or `"*"`), `confidentialCategoryIds` (explicit ids only), `directReportPersonIds` (manager relationship), `impersonatedBy?` |
| `org`       | `orgId`, `userId`, `personId`, `orgRoles`, `categoryScopes` (HR category **keys** or `"*"`), `parishScopes` (tenant ids or `"*"`), `links: { tenantId, status, delegatedCategoryKeys }[]`                                                                                                                                                                                     |
| `platform`  | `userId`. No capability in this vocabulary yet; the platform console will add its own actions later.                                                                                                                                                                                                                                                                          |
| `anonymous` | Public visitor. Denied everything.                                                                                                                                                                                                                                                                                                                                            |

Role keys: website `owner, admin, editor, office, groupLeader`; workspace
`leader, employee, volunteer, teamLeader, musicLeader, roomManager, hrHandler, confidentialHandler`;
organization `orgHrAdmin, orgHrHandler, orgConfidentialHandler`.

## Website matrix (SDD §11.3)

Content actions are `<kind>.<verb>`, where verb is one of `create`, `edit`, `publish` or `delete`.

| Capability                                             | Actions                                                                                        | owner |     admin      | editor | office |  groupLeader   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | :---: | :------------: | :----: | :----: | :------------: |
| Manage users & roles                                   | `site.users.manage` (`targetRoles`)                                                            |   ✔   | ✔ (not owners) |        |        |                |
| Domain, legal data, delete site                        | `site.domain.manage`, `site.legal.edit`, `site.delete`                                         |   ✔   |                |        |        |                |
| Appearance, modules, navigation, terminology           | `site.appearance.edit`, `site.modules.manage`, `site.navigation.edit`, `site.terminology.edit` |   ✔   |       ✔        |        |        |                |
| Pages, news, gallery, sermons, documents               | `page.*`, `news.*`, `gallery.*`, `sermon.*`, `document.*`                                      |   ✔   |       ✔        |   ✔    |        |                |
| Announcements                                          | `announcement.*`                                                                               |   ✔   |       ✔        |   ✔    |   ✔    |                |
| Schedule (rules & exceptions), locations, office hours | `schedule.edit`, `location.manage`, `officeHours.edit`                                         |   ✔   |       ✔        |        |   ✔    |                |
| Events                                                 | `event.*` (`groupId`)                                                                          |   ✔   |       ✔        |   ✔    |   ✔    | own group only |
| Group page                                             | `groupPage.*` (`groupId`)                                                                      |   ✔   |       ✔        |   ✔    |        | own group only |
| Pastoral requests (read/handle)                        | `pastoralRequest.read`, `pastoralRequest.handle`                                               |   ✔   |       ✔        |        |   ✔    |                |
| Audit log                                              | `auditLog.read`                                                                                |   ✔   |       ✔        |        |        |                |

## Workspace matrix (SDD §21.2)

L = leader, E = employee, V = volunteer, TL = teamLeader, ML = musicLeader, RM = roomManager,
HR = hrHandler, CH = confidentialHandler.

| Capability                              | Actions                                                                                                                      |       L        |       E        |          V          |             TL              |      ML       |      RM      |        HR         |        CH         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | :------------: | :------------: | :-----------------: | :-------------------------: | :-----------: | :----------: | :---------------: | :---------------: |
| Open the directory (navigation)         | `directory.open`                                                                                                             |       ✔        |       ✔        |          ✔          |              ✔              |       ✔       |      ✔       |         ✔         |         ✔         |
| See directory                           | `directory.viewPerson` (`personId`, `teamIds`)                                                                               |       ✔        |       ✔        |  own teams / self   |              ✔              |       ✔       |      ✔       |         ✔         |         ✔         |
| Create private events                   | `calendarEvent.create` (`visibility: private`)                                                                               |       ✔        |       ✔        |          ✔          |              ✔              |       ✔       |      ✔       |         ✔         |         ✔         |
| Create staff-visible / team events      | `calendarEvent.create` (`staff` / `team` + `teamId`)                                                                         |       ✔        |       ✔        |                     | own team (team events only) |       ✔       |      ✔       |                   |                   |
| Publish events to the website           | `calendarEvent.publish`, `calendarEvent.create` (`public`)                                                                   |       ✔        |                |                     |                             |               |              |                   |                   |
| Book rooms (subject to room policy)     | `room.book` (`roomId`, `whoCanRequest`)                                                                                      |       ✔        |       ✔        | if allowed by room  |              ✔              |       ✔       |      ✔       |                   |                   |
| Approve bookings                        | `booking.approve` (`roomId`)                                                                                                 |       ✔        |                |                     |                             |               | scoped rooms |                   |                   |
| Create/edit service plans               | `servicePlan.edit` (`teamId`)                                                                                                |       ✔        |                |                     |          own team           |       ✔       |              |                   |                   |
| Approve service plans                   | `servicePlan.approve` (`musicLeaderMayApprove`)                                                                              |       ✔        |                |                     |                             | if configured |              |                   |                   |
| Assign people to positions              | `assignment.manage` (`teamId`)                                                                                               |       ✔        |                |                     |          own team           |       ✔       |              |                   |                   |
| Song library edit                       | `song.edit`                                                                                                                  |       ✔        |                |                     |                             |       ✔       |              |                   |                   |
| View plans & attachments                | `servicePlan.view`, `attachment.view` (`teamId`, `assignedPersonIds`)                                                        |       ✔        |    assigned    | assigned / own team |          own team           |       ✔       |              |                   |                   |
| Submit HR requests                      | `hr.ticket.create` (`category.whoCanSubmit`)                                                                                 |       ✔        |       ✔        | enabled categories  |              ✔              |       ✔       |      ✔       |         ✔         |         ✔         |
| Approve as manager                      | `hr.ticket.approveAsManager`                                                                                                 | direct reports | direct reports |                     |                             |               |              |                   |                   |
| Handle HR tickets                       | `hr.ticket.read`, `hr.ticket.reply`, `hr.ticket.handle`, `hr.absence.viewDetails` (non-confidential)                         |                |                |                     |                             |               |              | scoped categories |                   |
| Handle confidential tickets             | same actions, confidential category                                                                                          |                |                |                     |                             |               |              |                   | scoped categories |
| Staff records, balances, payroll export | `hr.staffRecord.view/edit`, `hr.leaveBalance.manage`, `hr.leaveBalance.view` (others), `hr.payroll.export`, `hr.report.view` |                |                |                     |                             |               |              |         ✔         |                   |
| Own leave balance                       | `hr.leaveBalance.view` (own `personId`)                                                                                      |       ✔        |       ✔        |          ✔          |              ✔              |       ✔       |      ✔       |         ✔         |         ✔         |
| Absence calendar („Távol”)              | `hr.absence.viewCalendar`                                                                                                    |       ✔        |       ✔        |          ✔          |              ✔              |       ✔       |      ✔       |         ✔         |         ✔         |

Further rules:

- Requesters may always `read` and `reply` to their own ticket, confidential or not, but never
  `handle` it. Managers cannot approve their own request.
- Rooms default to `whoCanRequest: "all_staff"`, which excludes volunteers. Volunteers can book
  only rooms set to `"all_workspace"` or rooms whose role list includes `volunteer`. A role list
  restricts every role.
- A ticket with `handedOver: true` (_Átadás_) is read-only: `reply` and `handle` are denied.
- Website roles alone grant no workspace capability, and workspace roles alone grant no website
  capability.

## Organization roles (SDD §25.7)

Organization actors have **no** capability outside delegated HR. Every HR check needs all of
these:

1. an **active** `org_links` entry for the parish,
2. the parish within `parishScopes`, and
3. for category-bound data, the category key delegated by the parish **and** within
   `categoryScopes`.

| Capability                                                                                  | Actions                                                        | orgHrAdmin | orgHrHandler | orgConfidentialHandler |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | :--------: | :----------: | :--------------------: |
| Open the portal                                                                             | `org.portal.open` (`orgId`)                                    |     ✔      |      ✔       |           ✔            |
| Templates, parish links, members                                                            | `hr.template.manage`, `org.links.manage`, `org.members.manage` |     ✔      |              |                        |
| Delegated tickets & absence details (non-confidential)                                      | `hr.ticket.read/reply/handle`, `hr.absence.viewDetails`        |     ✔      |      ✔       |                        |
| Delegated confidential tickets & absence details                                            | same actions                                                   |            |              |           ✔            |
| Absence calendar of linked parishes                                                         | `hr.absence.viewCalendar`                                      |     ✔      |      ✔       |           ✔            |
| Reports, leave balances, payroll CSV                                                        | `hr.report.view`, `hr.leaveBalance.view`, `hr.payroll.export`  |     ✔      |      ✔       |                        |
| Submit, manager approval, staff records, balance management, any website / workspace action | —                                                              |            |              |                        |

Tenant-level reporting actions additionally require that the parish delegates at least one
category.

## Extending

Add an action to `ResourceByAction` and to one of the family lists in `src/actions.ts`; a
compile-time check fails if you forget the list. Then add a row to the matrix (`WEBSITE_MATRIX`,
`WORKSPACE_MATRIX`) or to the HR functions. Tests in `src/*.test.ts` transcribe the SDD tables by
hand, and must not be derived from the implementation's matrices. Coverage thresholds for this
package are 95 %.
