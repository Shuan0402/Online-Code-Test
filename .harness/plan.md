# Harness Plan — questioner-panel

**Created**: 2026-05-21
**Branch**: `feat/questioner-panel` (stacked on `feat/frontend-scaffold`, PR #29)
**Intent**: see `.harness/prompt.md`
**Planner**: harness-planner (Sonnet)

---

## Phases

### P1 — Questioner shell + 題目列表頁

**Goal**: Wire real routes into `App.jsx`, replace the stub page with a `ProblemListPage` that fetches `GET /problems/`, renders the table, supports difficulty filtering, delete (soft), and one-click rejudge.

**Risk tier**: medium
**Use full ReAct in executor**: no

**Files**:
- `frontend/src/App.jsx` — replace the catch-all `QuestionerStubPage` route with four named child routes (`index`, `problems`, `problems/new`, `problems/:id/edit`, `problems/:id/submissions`); keep the stub for the routes this phase does not yet implement
- `frontend/src/pages/questioner/ProblemListPage.jsx` — new page; fetches `GET /api/v1/problems/` (no auth header required, returns `List[ProblemShortRead]` with `{id, title, difficulty}`); local `difficultyFilter` state drives `Array.filter` on the in-memory list (the endpoint has no difficulty query param); delete calls `DELETE /api/v1/problems/{id}` → 204 and splices the item from state; rejudge calls `POST /api/v1/problems/{id}/rejudge` → 202 returns `{message, problem_id, submissions_triggered}` and shows "已觸發 N 筆重測" in an inline confirmation area
- `frontend/src/pages/questioner/index.js` — barrel re-export so later phases can import from a single path

**Acceptance criteria**:
- [ ] `npm run build` exits 0
- [ ] Navigating to `/questioner` as a questioner-role user renders the problem list (fetched from `GET /api/v1/problems/` — HTTP 200, body is an array of `{id, title, difficulty}`)
- [ ] Selecting "中等" from the difficulty filter shows only Medium problems; selecting "全部" restores the full list (client-side filter, no re-fetch)
- [ ] Clicking 刪除 on a problem calls `DELETE /api/v1/problems/{id}` and on HTTP 204 the row disappears from the list without a full re-fetch
- [ ] Clicking 重測 on a problem calls `POST /api/v1/problems/{id}/rejudge` and on HTTP 202 displays "已觸發 N 筆重測" where N = `submissions_triggered` from the response body
- [ ] Loading / error / empty-list states render with `LoadingSpinner`, `ErrorMessage` (with onRetry), and a "目前沒有題目" message respectively
- [ ] `npm run test` passes (no new tests in P1; existing 27 tests must stay green)
- [ ] Edge case: if rejudge returns `submissions_triggered: 0`, the message reads "已觸發 0 筆重測" (not hidden)

**Risk / rollback**: The edit to `App.jsx` replaces the wildcard catch-all `<Route path="*">` inside `/questioner` with named child routes. If this conflicts with the still-open PR #29 at merge time, the fix is a 3-line revert of that block — acceptable, small diff. Rollback: `git checkout HEAD -- frontend/src/App.jsx`.

**Depends on**: —

---

### P2 — 題目新增 / 編輯表單 + inline 測資編輯器

**Goal**: Build a single shared `ProblemFormPage` (used for both create and edit) with an inline test-case editor section; create calls `POST /problems/` → 201, edit calls `PATCH /problems/{id}` → 200 with full `test_cases` replacement.

**Risk tier**: medium
**Use full ReAct in executor**: no

**Files**:
- `frontend/src/pages/questioner/ProblemFormPage.jsx` — new page; receives `mode` from `useParams` (the route `/questioner/problems/new` vs `/questioner/problems/:id/edit` distinguishes create vs edit); on edit mount, fetches `GET /api/v1/problems/{id}` → 200, body `ProblemRead {id, title, description, difficulty, time_limit, memory_limit, creator_id, created_at, test_cases:[...]}` and populates form state; `test_cases` items from this response lack `problem_id`/`created_at` — handle both shapes per prompt.md schema gotcha; fields: title (text), description (textarea), difficulty (select: Easy/Medium/Hard), time_limit (number, ms), memory_limit (number, MB); inline test-case list shows `input_data`, `expected_output`, `score_weight` (default 10), `is_sample` (checkbox); add/remove test-case rows managed in local state array; each existing test case carries its `id` (for PATCH semantics); submit on create calls `POST /api/v1/problems/` → 201, body `ProblemCreate`; submit on edit calls `PATCH /api/v1/problems/{id}`, body `ProblemUpdate` with `test_cases` array where existing cases include `id` (update), new rows omit `id` (create), removed rows are simply absent (delete); on success, `navigate('/questioner/problems')` (redirects to list)
- `frontend/src/pages/questioner/index.js` — add `ProblemFormPage` to barrel export

**Acceptance criteria**:
- [ ] `npm run build` exits 0
- [ ] Clicking "新增題目" on the list page navigates to `/questioner/problems/new`; submitting a valid form calls `POST /api/v1/problems/` with `Content-Type: application/json` body `{title, description, difficulty, time_limit, memory_limit, test_cases:[{input_data, expected_output, score_weight, is_sample}]}` and on HTTP 201 redirects to the list page
- [ ] Navigating to `/questioner/problems/:id/edit` fetches `GET /api/v1/problems/{id}` (HTTP 200) and pre-populates all fields including the test-case rows
- [ ] Adding a test-case row, filling it in, and saving calls `PATCH /api/v1/problems/{id}` with the new row (no `id` field on new row) plus existing rows (with their `id` fields); server returns HTTP 200 `ProblemRead`
- [ ] Removing an existing test-case row and saving calls `PATCH /api/v1/problems/{id}` with the removed case absent from the array (server performs the delete)
- [ ] Validation: `title` and at least one test case are required; a visible Chinese error message prevents submission if absent
- [ ] `npm run test` passes (existing 27 tests green)
- [ ] Edge case: navigating to `/questioner/problems/999/edit` where 999 does not exist → server returns 404 → page displays "載入失敗" error message rather than crashing

**Risk / rollback**: The dual-mode form (create + edit) in one component is the highest-complexity piece of P2 but is self-contained to one new file. If PATCH semantics cause unexpected server 422s, the executor should log the full request body in the console during development and adjust field naming (snake_case throughout). Rollback: delete `ProblemFormPage.jsx` and remove its route from `App.jsx`.

**Depends on**: P1 (routes in `App.jsx` must already define `/questioner/problems/new` and `/questioner/problems/:id/edit`)

---

### P3 — 該題提交紀錄查看頁

**Goal**: Build a read-only `ProblemSubmissionsPage` that lists all submissions for a given problem and shows per-submission judge detail in an expandable row or dialog.

**Risk tier**: low
**Use full ReAct in executor**: no

**Files**:
- `frontend/src/pages/questioner/ProblemSubmissionsPage.jsx` — new page; mounts at `/questioner/problems/:id/submissions`; on mount fetches `GET /api/v1/submissions/?problem_id={id}` (no `skip`/`limit` for now — paginate in a future loop); response is `List[SubmissionRead]` with `{id, user_id, problem_id, exam_id, status, score, execution_time, memory_usage, judge_log, created_at, details, presigned_url}`; renders a table of submissions (columns: 提交者 user_id, 狀態, 分數, 執行時間, 提交時間); clicking a row or a "查看詳情" button fetches `GET /api/v1/submissions/{id}` → 200 `SubmissionRead` (same shape, with `details:[SubmissionDetailRead]`) and shows it in a `Dialog`; reuses `JudgeStatusBadge` for status column; judge detail shows `judge_log` in a `<pre>` block and the `details` array (test case index, status, execution_time, score_weight)
- `frontend/src/pages/questioner/index.js` — add `ProblemSubmissionsPage` to barrel export

**Acceptance criteria**:
- [ ] `npm run build` exits 0
- [ ] Clicking "查看提交" (or the submissions link) on a problem row in the list page navigates to `/questioner/problems/:id/submissions`
- [ ] Page fetches `GET /api/v1/submissions/?problem_id={id}` (HTTP 200) and renders one row per submission
- [ ] Each row shows `JudgeStatusBadge` with the correct status colour (AC green, WA red, etc.)
- [ ] Clicking "查看詳情" fetches `GET /api/v1/submissions/{submissionId}` (HTTP 200) and opens a `Dialog` showing `judge_log` in a `<pre>` block and the per-test-case `details` array
- [ ] Loading and error states are handled; empty list shows "尚無提交紀錄"
- [ ] `npm run test` passes (existing 27 tests green)
- [ ] Edge case: if `details` is an empty array, the dialog shows "無詳細測試資料" instead of an empty list

**Risk / rollback**: Purely additive — one new file plus a barrel export update. No existing files changed except `App.jsx` already wired this route in P1. Rollback: delete `ProblemSubmissionsPage.jsx`.

**Depends on**: P1 (route `/questioner/problems/:id/submissions` defined in `App.jsx`)

---

### P4 — 潤飾 + 單元測試

**Goal**: Final polish pass — consistent spacing/empty states, fix any discovered UX gaps — then write Vitest unit tests for the logic-heavy parts of the three new pages.

**Risk tier**: low
**Use full ReAct in executor**: no

**Files**:
- `frontend/src/pages/questioner/ProblemListPage.test.jsx` — tests: (a) difficulty filter correctly shows/hides items from a mocked list; (b) delete calls `DELETE /api/v1/problems/{id}` and removes the row from the DOM on 204; (c) rejudge calls `POST /api/v1/problems/{id}/rejudge` and displays "已觸發 N 筆重測" from the 202 response `submissions_triggered`
- `frontend/src/pages/questioner/ProblemFormPage.test.jsx` — tests: (a) renders in create mode with empty fields; (b) renders in edit mode after mocked `GET /problems/{id}` 200 response pre-populates fields; (c) adding a test-case row and submitting sends a `POST` body with `test_cases` array containing the new row (no `id` field); (d) required-field validation blocks submit and shows Chinese error text
- `frontend/src/pages/questioner/ProblemSubmissionsPage.test.jsx` — tests: (a) renders submission rows from a mocked `GET /submissions/?problem_id=X` 200 response; (b) clicking 查看詳情 fetches `GET /submissions/{id}` and opens a dialog showing `judge_log`; (c) empty `details` array shows "無詳細測試資料"
- `frontend/src/pages/questioner/ProblemListPage.jsx` — minor polish only (no logic changes): ensure consistent padding, add aria-labels on icon-only buttons
- `frontend/src/pages/questioner/ProblemFormPage.jsx` — minor polish only: confirm cancel/back button returns to list, fix any edge-case discovered during test writing
- `frontend/src/pages/questioner/ProblemSubmissionsPage.jsx` — minor polish only: confirm dialog close button works, ensure presigned_url is not rendered if null

**Acceptance criteria**:
- [ ] `npm run build` exits 0
- [ ] `npm run test` passes with all 27 prior tests green plus the new questioner tests (target: at least 15 new test assertions across the 3 new test files)
- [ ] The difficulty filter test: given a mock list `[{difficulty:'Easy',...},{difficulty:'Hard',...}]`, selecting "困難" filter leaves exactly 1 row in the DOM
- [ ] The rejudge test: mock `POST /problems/1/rejudge` returns `{message:'ok', problem_id:1, submissions_triggered:3}`; asserts the text "已觸發 3 筆重測" is in the DOM
- [ ] The form create test: mock `POST /problems/` returns HTTP 201 `ProblemRead`; asserts the spy was called with a body where `test_cases[0]` has no `id` property
- [ ] The spy-on-stub rule: all `localStorage` spies target the `localStorageMock` stub installed by `setup.js` (via `vi.spyOn(localStorage, 'setItem')`), NOT `Storage.prototype.setItem` — consistent with the pattern demonstrated in `EditorPanel.test.jsx` line 187
- [ ] Edge case (submissions test): when `GET /submissions/?problem_id=X` returns `[]`, the text "尚無提交紀錄" appears

**Risk / rollback**: Tests are purely additive. The mock pattern for `api.js` must use `vi.mock('@/lib/api')` to replace the module, not intercept the prototype. If any test accidentally mocks `Storage.prototype` instead of the stub, the spy will vacuously pass (lesson 3) — the acceptance criterion above guards against this explicitly. Rollback: delete the three `.test.jsx` files.

**Depends on**: P1, P2, P3 (tests import from the page components those phases produce)

---

## Whole-plan acceptance

- [ ] All phase acceptance criteria pass
- [ ] `npm run build` exits 0 end-to-end (no dead imports, no missing modules)
- [ ] `npm run test` exits 0 with all tests green (≥ 42 assertions total: 27 prior + ≥ 15 new)
- [ ] A questioner-role user can complete the full golden path in the browser: list → create problem with test cases → edit problem → trigger rejudge → view submissions → see judge detail in dialog
- [ ] The PR description documents all 4 phases with a phase → implementation mapping (explicit user request per prompt.md)
- [ ] Manual preview check on the PR URL (user performs this, not Claude)

---

## Not doing (and why)

- **Pagination on the submissions list** — `GET /submissions/` supports `skip`/`limit` but the backend returns a plain list with no total count, so a page control cannot display "page N of M". Deferred to a future loop when a count endpoint exists.
- **Separate test-case CRUD page / using `POST /problems/{id}/testcases` and `PATCH /testcases/{id}`** — user explicitly decided test-case editing is inline in the problem form using `PATCH /problems/{id}` with full replacement; the per-testcase endpoints are a fallback not used by this UI.
- **`GET /problems/{id}/testcases` endpoint** — the form fetches test cases as part of `GET /problems/{id}` (`ProblemRead.test_cases`), so the separate testcases endpoint is redundant for this use case.
- **Interviewer and Admin panels** — explicitly out of scope; remain stubs.
- **Forgot-password / profile / change-password** — out of scope per prompt.md.
- **i18n layer** — user locked the stack; 純中文 strings are hardcoded in JSX.
- **TanStack Query** — locked out by user constraint; plain `useEffect` + `axios`.
- **TypeScript** — locked out; pure JSX.
- **Progress tracking for rejudge** — no polling endpoint exists on the backend; fire-and-forget per design decision 5 in prompt.md.

---

## Open questions for supervisor

- **None blocking P1.** The backend contract is fully verified in prompt.md. The four routes needed (`/questioner`, `/questioner/problems`, `/questioner/problems/new`, `/questioner/problems/:id/edit`, `/questioner/problems/:id/submissions`) are straightforward React Router additions. P1 can be dispatched immediately.
- **Informational only — merge timing**: This branch is stacked on PR #29 (open). The `App.jsx` edit in P1 may produce a small conflict with PR #29 at merge time. The executor should note this in the P1 commit message. No action needed before dispatch.

---

## Prior lessons consulted

- (prior loop, lesson 1) "A plan written before the backend exists has a short-lived API contract." — Applied by grounding every acceptance criterion in the actual HTTP status codes and response shapes from the verified backend contract in prompt.md (POST → 201, rejudge → 202 `{submissions_triggered}`, DELETE → 204, etc.) rather than vague "calls the API".
- (prior loop, lesson 2) "A long-running loop on a feature branch drifts from main." — Called out in the P1 Risk/rollback note: the `App.jsx` route edit may lightly conflict with PR #29 at merge time; the executor must note this in the P1 commit message.
- (prior loop, lesson 3) "Stubbing a global makes prototype spies vacuously pass." — Encoded as an explicit acceptance criterion in P4: all `localStorage` spies must target the `localStorageMock` stub object (via `vi.spyOn(localStorage, 'setItem')`) not `Storage.prototype.setItem`, consistent with the pattern at `EditorPanel.test.jsx` line 187.
