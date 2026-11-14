## Deliverable

<!-- e.g. D-05 [Logic] Permission policy module — closes #NN -->

- Deliverable / part:
- Closes:
- Docs: `docs/03-DELIVERABLES.md` §…, `docs/02-SDD.md` §…

## Summary

<!-- What changed and why, in a few sentences. -->

## Acceptance criteria

<!-- Copy the checklist from the issue. Tick only what is verified, and say how (test name, screenshot, measurement). -->

- [ ] …

## Definition of Done (docs/03-DELIVERABLES.md §2)

- [ ] CI green (lint, typecheck, unit, contract, integration, E2E as applicable)
- [ ] All UI strings in `messages/hu.json`
- [ ] axe-core: 0 serious/critical on new/changed routes
- [ ] Tests for new domain logic; coverage thresholds kept
- [ ] No new high/critical vulnerabilities
- [ ] Works on the 3 demo churches (where applicable)
- [ ] Docs updated if behavior/config changed
- [ ] New tenant tables have RLS + isolation tests; sensitive fields encrypted (BE parts)
- [ ] Mock and DB adapters pass the same contract tests (if contracts changed)
- [ ] No real personal data added

## Security-sensitive?

- [ ] This PR touches auth, RLS, encryption, HR, diocesan access or payments → label `security-review` and request a second human reviewer

## Notes for reviewers

<!-- Doc ambiguities found, follow-ups, screenshots for UI parts. -->
