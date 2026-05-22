# Lessons — frontend-scaffold-and-panels

Loop closed 2026-05-21. Branch `feat/frontend-scaffold`. Phases P1–P5 + an inserted P4.5 test phase.

## 1. A plan written before the backend exists has an API contract with a short shelf life

The plan's P4/P5 sections were authored when no backend endpoints existed. By the time those phases ran, the backend had shipped — and several plan assumptions were simply wrong:
- timer "restores from `exam.end_time`" — wrong; `end_time` is null until submit. Real source is `remaining_seconds` from `POST /exams/{id}/start`.
- `POST /submissions/` returns **202**, not 200; path has a trailing slash.
- `SubmissionRead` has **no `source_code`** field (code lives in S3 behind `presigned_url`).
- `GET /exams/{id}/result` returns a new `ExamResultRead` schema with **no `execution_time`**, contradicting the plan's result-table spec.

**Takeaway**: when a frontend plan is built against a not-yet-existent backend, the supervisor must re-derive the contract from backend source *before dispatching each API-touching phase* and pass the corrections into the executor brief explicitly. Treat the plan's API section as a hypothesis, not ground truth.

## 2. A long-running harness loop on a feature branch silently drifts from main

Mid-loop, PR #18 (P1+P2) merged to `main`, then ~29 commits of backend work landed on `main` while the loop branch kept going with P3. The loop branch fell 29 commits behind without any signal. Browser E2E for P3+ was impossible until `main` was merged back into the loop branch. Because `frontend/` and `backend/` never overlap, the merge was zero-conflict — but it has to be done deliberately. **Takeaway**: before the read-heavy / E2E-dependent phases of a multi-session loop, merge `main` into the loop branch so work runs against the current backend.

## 3. Stubbing a global makes prototype spies vacuously pass

P4.5's `setup.js` replaced `localStorage` via `vi.stubGlobal('localStorage', mapBackedMock)`. A test then did `vi.spyOn(Storage.prototype, 'setItem')` — but the mock is a plain object, so `Storage.prototype.setItem` is never the function invoked. The assertion `expect(spy).not.toHaveBeenCalled()` passed *vacuously*: it would stay green even if the behavior under test were completely broken. Caught only because the reviewer was explicitly asked to hunt false-confidence tests. **Takeaway**: when a global is stubbed, spies must target the stub object (`vi.spyOn(localStorage, 'setItem')`), not the original prototype — and "break the impl, watch the test fail" is the only proof a test has teeth.
