1. Feature summary
Add RBAC/ABAC authorization checks for control-plane actions.

2. Relevant modules
- `apps/api/authz/**`
- `packages/application/authorization/**`

3. Existing behavior
Current autonomous documentation defines this capability as required for production readiness, but implementation coverage must be verified and completed incrementally.

4. Proposed design
- Add a minimal implementation slice for this capability.
- Keep contracts explicit and typed.
- Preserve deterministic behavior under retry/timeout/cancellation.
- Emit evidence and structured errors for diagnosability.

5. Files likely to change
- `apps/api/src/authz/rbac-abac.ts`
- `packages/application/src/authorization/evaluate-access.ts`
- `apps/api/src/authz/*.test.ts`
- Note: listed file paths are **likely targets** for planning, not a strict placement contract.

6. Risks
- Incomplete handling of retry/timeout/cancellation edge cases.
- Hidden coupling across layers if boundaries are not enforced.
- Operational blind spots if evidence/telemetry is partial.

7. Test plan
- Success path test for the primary behavior.
- Failure path test for explicit error handling.
- Regression test for previously observed/likely failure mode.
- Retry/timeout/cancellation test if execution flow is touched.

8. Rollout / migration notes
- Prefer additive rollout with feature flags where needed.
- Maintain backward compatibility for existing config/payload shapes.
- Record migration notes if any persistent schema changes are required.

9. Recommendation
Implement this task as an independent, reviewable PR and complete it before dependent downstream tasks.
