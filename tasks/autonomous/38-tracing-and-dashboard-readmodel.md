1. Feature summary
Expose end-to-end traces via read model/API layer.

2. Relevant modules
- `packages/state/read-models/tracing/**`
- `apps/api/tracing/**`
- `apps/dashboard/**`

3. Existing behavior
Current autonomous documentation defines this capability as required for production readiness, but implementation coverage must be verified and completed incrementally.

4. Proposed design
- Add a minimal implementation slice for this capability.
- Keep contracts explicit and typed.
- Preserve deterministic behavior under retry/timeout/cancellation.
- Emit evidence and structured errors for diagnosability.

5. Files likely to change
- `packages/state/src/read-models/tracing-read-model.ts`
- `apps/api/src/routes/traces/**`
- `apps/dashboard/src/features/traces/**`
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
