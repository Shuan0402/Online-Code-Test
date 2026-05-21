# Loop: questioner-panel

## Intent

Build the **Questioner (出題者) panel** for the Online Code Test platform — the problem-bank management UI. Questioners create / edit / delete coding problems and their test cases, trigger a rejudge of all submissions for a problem, and review what candidates submitted for any given problem.

This is the second frontend loop. The prior loop (`frontend-scaffold-and-panels`, PR #29) delivered the scaffold, auth, and the full Candidate panel. This loop fills in the first of the three staff panels.

## Branch

`feat/questioner-panel`, branched off `feat/frontend-scaffold` @ `7ca79b6` (which carries P1–P5 + the Vitest harness; that work is in the still-open PR #29). This branch is **stacked on PR #29** — once #29 merges to `main`, this loop's PR diff resolves to Questioner-only changes.

## Scope boundary

**In scope:**
- Questioner pages under `/questioner/*`, rendered inside the existing `StaffLayout` (sidebar + header)
- 題目列表頁 — list, difficulty filter, delete, one-click rejudge
- 題目新增 / 編輯表單 — one shared form component, with an **inline test-case editor**
- 該題提交紀錄頁 — read-only list of candidate submissions for a problem + judge detail
- A final polish phase that includes unit tests for the logic-heavy parts

**Out of scope:**
- Interviewer / Admin panels — remain stubs (future loops)
- Candidate panel — done in the prior loop
- forgot-password / profile / change-password pages
- Any change to `backend/`, `judge-worker/`, or `docker-compose.yml`

## Tech stack (locked — same as prior loop)

Vite + React (JavaScript, no TypeScript), React Router v6, Tailwind + shadcn/ui, axios, Vitest. No TanStack Query, no i18n, no TypeScript.

## Backend ground truth (verified by reading `backend/` source, 2026-05-21)

All paths under `/api/v1`. Endpoints the Questioner panel uses:

- `GET /problems/` → `List[ProblemShortRead]` `{id, title, difficulty}`. Only `skip`/`limit` params — **no total count**. ⚠️ this endpoint has **no auth dependency**.
- `GET /problems/{id}` → `ProblemRead` `{id, title, description, difficulty, time_limit(ms), memory_limit(MB), creator_id, created_at, test_cases:[...]}`. Questioner sees ALL test cases (only the Candidate role is filtered to `is_sample`).
- `POST /problems/` → `ProblemRead`, **201**. Body `ProblemCreate` `{title, description, difficulty(Easy|Medium|Hard), time_limit, memory_limit, test_cases:[TestCaseCreate]}`.
- `PATCH /problems/{id}` → `ProblemRead`. Body `ProblemUpdate` — all fields optional; if `test_cases` is provided it **replaces the whole set** (backend diffs by `tc.id`: id present = update, id absent = create, existing id missing from the list = delete).
- `DELETE /problems/{id}` → **204**. Soft delete (`is_deleted = true`).
- `GET /problems/{id}/testcases` → `list[TestCaseRead]` `{id, problem_id, input_data, expected_output, score_weight, is_sample, created_at}`.
- `POST /problems/{id}/testcases` → `TestCaseRead`, **201**.
- `PATCH /testcases/{id}` → `TestCaseRead`. `DELETE /testcases/{id}` → **204**.
- `POST /problems/{id}/rejudge` → `RejudgeResponse` `{message, problem_id, submissions_triggered}`, **202**. Fire-and-forget — no progress query exists.
- `GET /submissions/?problem_id=X` → `List[SubmissionRead]`. Questioner (non-Candidate) sees all users' submissions; also supports `user_id` / `exam_id` / `skip` / `limit`.
- `GET /submissions/{id}` → `SubmissionRead` `{id, user_id, problem_id, exam_id, status, score, execution_time, memory_usage, judge_log, created_at, details:[SubmissionDetailRead], presigned_url}`.

**Schema gotchas:**
- TestCase has TWO read shapes: items inside `ProblemRead.test_cases` lack `problem_id`/`created_at`; items from `GET /problems/{id}/testcases` have them. Handle both.
- `TestCaseCreate` = `{input_data, expected_output, score_weight(default 10), is_sample(default false)}`.
- For `PATCH /problems` with `test_cases`, each item is `TestCaseUpdate` with an optional `id`: include `id` to update an existing case, omit it to create, omit a case entirely to delete it.
- `DifficultyLevel`: Easy | Medium | Hard. `JudgeStatus`: Pending, Judging, AC, WA, TLE, MLE, RE, CE.

## Key design decisions

1. Reuse `StaffLayout` — its sidebar already filters nav links to the Questioner role.
2. **Test-case editing is inline in the problem create/edit form.** `PATCH /problems/{id}` supports full `test_cases` replacement, so no separate test-case page is needed; the `/testcases/{id}` endpoints are a fallback, not the primary path.
3. One shared problem-form component for both create and edit.
4. The submissions-per-problem view is read-only.
5. Rejudge is fire-and-forget — UI shows "已觸發 N 筆重測", no progress tracking.
6. 純中文 UI, no i18n layer.
7. Unit tests are concentrated in the final polish phase (user decision).

## Constraints

- **User is a frontend beginner** — simple, idiomatic React; plain `useEffect` + `axios`; comment only non-obvious code.
- Reuse existing infrastructure from the prior loop: `@/lib/api`, `AuthContext`, `ProtectedRoute`, shadcn components already installed (button, input, label, card, dialog, badge, tabs, tooltip), the Vitest harness.
- Do not touch `backend/` or the other panels.
- **The final PR description MUST document all 4 phases** — a clear phase → implementation mapping — so the user can see what each phase delivered. (Explicit user request.)

## Success criteria

End of loop, a Questioner can:
1. Open `/questioner` → see the problem list, filter by difficulty
2. Create a new problem with test cases; edit an existing one; delete one
3. Trigger a rejudge on a problem and see the triggered-count confirmation
4. Open a problem's submissions view → see candidate submissions and per-submission judge detail
5. `npm run build` exits 0; `npm run test` passes including the new tests
6. The PR documents the 4-phase breakdown
