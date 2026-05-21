# Lessons — questioner-panel

Loop closed 2026-05-21. Branch `feat/questioner-panel`. Phases P1–P4, all shipped on first review (no fix-required rounds).

## 1. A reviewer's "nice-to-have" can hide a real bug — the supervisor must re-triage, not just defer

In P2 the reviewer filed four items as "nice-to-have". Two of them were genuine latent bugs, not cosmetics:
- `key={index}` on the dynamically-editable test-case row list — removing a middle row makes React reuse stale DOM and silently shifts field values into the wrong rows.
- `score_weight` held as a string in state — clearing the field sends `NaN`, which the backend rejects with a 422.

Both were filed below the must-fix line. If the supervisor had merely "deferred nice-to-haves" as a category, two data-corrupting bugs would have shipped. Instead they were explicitly escalated into P4's must-fix scope.

**Takeaway**: the reviewer's severity tag is an opinion, not a verdict. Read every nice-to-have and re-classify: anything that corrupts data, sends malformed requests, or misrenders core UI is a real bug regardless of where the reviewer filed it. "Defer all nice-to-haves" is not a safe default.

## 2. Verifying the backend contract up front (prior-loop lesson 1) paid off measurably

The prior loop's #1 lesson was that an API contract written before the backend exists ages badly. This loop applied the mitigation: `prompt.md` carried the contract re-derived from live `backend/` source, and every phase's acceptance criteria cited real status codes (201/202/204) and response shapes. Result: zero mid-phase API-contract corrections, and all four phases shipped on the first review pass — versus the prior loop where P4/P5 needed contract overrides injected into the executor briefs. The upfront verification cost ~20 minutes of reading; it removed an entire class of rework.
