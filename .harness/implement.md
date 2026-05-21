<!-- Loop: questioner-panel — executor + supervisor progress log. One block per phase attempt. -->

## P1 — Questioner shell + 題目列表頁  (2026-05-21T10:47:00Z)

### Files created / modified
- `frontend/src/pages/questioner/ProblemListPage.jsx` — new page; fetches `GET /api/v1/problems/`, client-side difficulty filter, delete with shadcn Dialog confirm, rejudge with inline "已觸發 N 筆重測" feedback, LoadingSpinner / ErrorMessage / empty-list states
- `frontend/src/pages/questioner/index.js` — barrel file; exports `ProblemListPage` (later phases add to it)
- `frontend/src/App.jsx` — replaced the wildcard catch-all inside the `/questioner` block with five named child routes: `index` and `problems` → `ProblemListPage`; `problems/new`, `problems/:id/edit`, `problems/:id/submissions` → `QuestionerStubPage` (stubs for P2/P3); added `import { ProblemListPage } from './pages/questioner'`

### Commands run
- `npm run build` → exit 0 (1690 modules, 2.00 s)
- `npm run test` → 27/27 passed (4 test files, 1.07 s)

### Deviations from plan
- None. All acceptance criteria met as stated.

### Adjacent findings (not fixed)
- The `/interviewer` and `/admin` panels still use a wildcard `<Route path="*">` inside their blocks (same pattern that was replaced in `/questioner`). Not fixed — out of scope for this loop.

### Blockers / notes for P2
- P2 needs to replace the `problems/new` and `problems/:id/edit` stub routes with `ProblemFormPage` imports. The `index.js` barrel is already wired; P2 just adds the export there.
- Merge-time note: the `App.jsx` edit may produce a small conflict with the still-open PR #29 (`feat/frontend-scaffold`) when it merges to main. Fix is a 3-line rebase of the questioner block — acceptable, small diff.

### Verifier verdict  (2026-05-21)

```
build:     pass  (1690 modules, exit 0, 1.91 s)
test:      pass  (27/27, 4 files, exit 0 — no regressions)
dev:       pass  (curl http://localhost:5173 → <!doctype html>, exit 0)
ts-files:  pass  (0 .ts/.tsx files under frontend/src)
deps:      pass  (frontend/package.json unchanged vs HEAD)
lint:      skipped  (no lint script configured — expected, matches prior phases)
e2e:       deferred to supervisor (browser test, not run by verifier)
```

Verdict: green

### Reviewer verdict  (2026-05-21)

**Verdict: ship**

#### Criteria scorecard

| # | Criterion | Result | Note |
|---|-----------|--------|------|
| 1 | `GET /api/v1/problems/` called via shared `@/lib/api` instance | pass | `api.get('/api/v1/problems/')` — ProblemListPage.jsx:64 |
| 2 | Difficulty filter is client-side `Array.filter`, no re-fetch | pass | ProblemListPage.jsx:78-80 |
| 3 | Delete calls `DELETE /api/v1/problems/{id}` → 204, splices state, no re-fetch | pass | ProblemListPage.jsx:91-93 |
| 4 | Delete behind confirm Dialog | pass | shadcn Dialog at ProblemListPage.jsx:266-291 |
| 5 | Rejudge shows "已觸發 N 筆重測" with N from `submissions_triggered` | pass | ProblemListPage.jsx:111-114 |
| 6 | Edge case: `submissions_triggered: 0` renders "已觸發 0 筆重測" (not hidden) | pass | `?? 0` guard at :111; message rendered unconditionally at :251 when set |
| 7 | LoadingSpinner (with size="lg"), ErrorMessage (with onRetry) | pass | ProblemListPage.jsx:133, 142 |
| 8 | Empty-list state "目前沒有題目" | pass | ProblemListPage.jsx:178 |
| 9 | App.jsx — 5 child routes wired; new/edit/submissions stubs for P2/P3 | pass | App.jsx:55-61 |
| 10 | "新增題目" navigates to `/questioner/problems/new` | pass | ProblemListPage.jsx:152 |
| 11 | Per-row edit/submissions Link paths correct | pass | ProblemListPage.jsx:215, 226 |
| 12 | `npm run build` exits 0 | pass | Verified: 1690 modules, no errors |
| 13 | `npm run test` 27/27 green, no regression | pass | All 4 test files pass; no new test files in P1 |
| 14 | No TypeScript; 純中文 strings | pass | Pure JSX; all user-visible strings in Chinese |
| 15 | `index.js` barrel re-export clean | pass | index.js:2 — single named export |
| 16 | Difficulty enum mapping Easy/Medium/Hard ↔ 簡單/中等/困難 | pass | DIFFICULTY_OPTIONS at ProblemListPage.jsx:18-23; DIFFICULTY_LABELS at :33-37 |

#### Must-fix issues

None found.

#### Nice-to-have

- ProblemListPage.jsx:97 — delete failure surfaces via `alert()` rather than an inline error inside the dialog. The dialog stays open which is correct, but a native `alert()` blocks the thread and is inconsistent with the rest of the UI. A small state slot for `deleteError` rendered inside `DialogContent` would be cleaner. Not a blocker for P1.
- ProblemListPage.jsx:177-178 — when a difficulty filter is active and returns zero results, the message "目前沒有題目" is shown, which is ambiguous (could mean the DB is empty). A separate "沒有符合條件的題目" message for the filtered-empty case would improve clarity. No plan criterion requires this.

#### Verification gaps

- No Playwright / browser check was run. The plan does not require one for P1, but a quick manual spot-check of the difficulty filter select and the delete dialog at `/questioner` is recommended before merging.
- The `rejudgeMsgs` feedback message is never cleared after a successful re-trigger (stays visible indefinitely). The plan does not specify auto-dismiss, so this is not a defect, but P4 polish could add a timed clear.

### Supervisor resolution + commit (P1)

- Reviewer verdict: **ship** (no must-fix). Verifier verdict: **green**.
- Reviewer nice-to-haves all folded into P4 polish scope: (1) `alert()` on delete failure → inline error in the Dialog; (2) distinct "沒有符合條件的題目" message when a filter is active vs truly-empty list; (3) rejudge feedback string never auto-clears.
- **Committed P1 as `0b45a49`** on `feat/questioner-panel`.

## P2 — 題目新增/編輯表單 + inline 測資編輯器  (2026-05-21T10:52:00Z)

### Files created / modified
- `frontend/src/pages/questioner/ProblemFormPage.jsx` — new page; dual-mode (create/edit) via `useParams().id`; edit mode fetches `GET /api/v1/problems/{id}` on mount, populates all fields including test-case rows with their `id`s; 404 response shows inline "載入失敗，找不到此題目" error; form fields: title, description, difficulty select (簡單/中等/困難), time_limit (ms), memory_limit (MB); inline test-case editor with add/remove rows; each row: input_data, expected_output, score_weight (default 10), is_sample (checkbox); submit builds payload preserving `id` on existing rows, omitting `id` on new rows; POST /api/v1/problems/ → 201 for create, PATCH /api/v1/problems/{id} → 200 for edit; on success navigates to /questioner/problems; validation blocks submit if title empty or no test cases; no alert() calls — all errors inline
- `frontend/src/pages/questioner/index.js` — added `ProblemFormPage` to barrel export
- `frontend/src/App.jsx` — replaced `problems/new` and `problems/:id/edit` stub routes with `ProblemFormPage`; added `ProblemFormPage` to named import from `./pages/questioner`

### Commands run
- `npm run build` → exit 0 (1691 modules, 2.07 s)
- `npm run test` → 27/27 passed (4 test files, 1.26 s)

### Deviations from plan
- None. The trailing slash on `POST /api/v1/problems/` is respected as specified.

### Adjacent findings (not fixed)
- `QuestionerStubPage` is still imported in App.jsx (used only for `problems/:id/submissions` stub for P3). Once P3 is implemented, the import can be removed entirely — leave for P3.

### Blockers / notes for P3
- P3 needs to replace the `problems/:id/submissions` stub route with `ProblemSubmissionsPage`. The barrel file is already set up; P3 just adds the export and swaps the route.

### Verifier verdict  (2026-05-21)

```
build:     pass  (1691 modules, exit 0, 2.58 s)
test:      pass  (27/27, 4 files, exit 0 — no regressions)
ts-files:  pass  (0 .ts/.tsx files under frontend/src)
deps:      pass  (frontend/package.json unchanged vs HEAD — no new deps)
lint:      skipped  (no lint script configured — expected)
e2e:       deferred to supervisor
```

Verdict: green

### Reviewer verdict  (2026-05-21)

**Verdict: ship**

#### Criteria scorecard

| # | Criterion | Result | Note |
|---|-----------|--------|------|
| 1 | PATCH semantics — existing rows carry `id`, new rows omit `id`, removed rows absent | pass | newTestCaseRow() has no id (line 19-27); fetch maps id (line 79); submit guard `if (tc.id !== undefined)` (line 150-152) |
| 2 | Mode detection via `useParams().id` — `/problems/new` = create, `/problems/:id/edit` = edit | pass | line 30-31; undefined id → isEditMode false |
| 3 | POST /api/v1/problems/ (trailing slash) → 201 on create | pass | line 171 — trailing slash present |
| 4 | PATCH /api/v1/problems/{id} → 200 on edit | pass | line 168 |
| 5 | Edit-mode 404 → inline "載入失敗" error, no crash | pass | line 89-90 sets loadError; line 191-202 renders it |
| 6 | Validation: title non-empty AND ≥1 test case, 純中文 message | pass | lines 127-134; messages "請填寫題目標題" / "至少需要一筆測試資料" |
| 7 | On success navigate('/questioner/problems') | pass | line 173 |
| 8 | snake_case field names in request bodies | pass | time_limit, memory_limit, input_data, expected_output, score_weight, is_sample all snake_case |
| 9 | No alert(); submit failure inline | pass | errors via setSubmitError (line 175); rendered at lines 394-396 |
| 10 | LoadingSpinner during edit-mode GET | pass | lines 182-188 |
| 11 | App.jsx routes swapped; submissions route still stub; no dangling imports | pass | App.jsx:58-61; QuestionerStubPage still used for submissions |
| 12 | Barrel export clean | pass | index.js line 3 |
| 13 | `npm run build` exits 0 | pass | executor reports 1691 modules |
| 14 | 27 prior tests still green | pass | executor reports 27/27; no tested module changed |
| 15 | No TypeScript; 純中文 strings | pass | pure JSX; all user-visible strings Chinese |
| 16 | Cancel/back buttons return to list | pass | two cancel buttons both navigate('/questioner/problems') at lines 214, 406 |

#### Must-fix issues

None found.

#### Nice-to-have

- `ProblemFormPage.jsx:85` — when `GET /problems/{id}` returns `test_cases: []`, the code falls back to `[newTestCaseRow()]`, silently inserting a blank new test case. If the user saves without noticing, a spurious blank test-case row is POSTed to the backend as a CREATE. Better would be to leave the array empty and let the "at least one test case" validation fire so the user adds it deliberately.
- `ProblemFormPage.jsx:305` — `key={index}` on the test-case list. When a row in the middle is removed, React re-uses stale DOM elements; users may see field values shift. A stable key (e.g. `tc.id ?? tc._clientKey` with a counter) would be more robust. Not a plan criterion.
- `ProblemFormPage.jsx:193` — `ErrorMessage` is rendered without an `onRetry` prop in the 404/load-error branch. The plan only requires "displays error message rather than crashing," which is satisfied; the separate "返回列表" button is a reasonable substitute. P4 polish could add a retry handler.

#### Verification gaps

- No Playwright / browser check was run. The dual-mode form (especially pre-population of test-case rows in edit mode and the PATCH payload shape) would benefit from a quick manual browser test before merge, since these paths have no automated test coverage until P4.
- The `score_weight` field is stored as a string (via `e.target.value`) in state and converted via `Number()` only at submit time; if a user clears the field the payload will send `score_weight: NaN`. No plan criterion covers this, but the backend may return a 422.

### Supervisor resolution + commit (P2)

- Reviewer verdict: **ship** (no must-fix). Verifier verdict: **green**.
- 4 reviewer nice-to-haves carried into P4 scope. Two are real latent bugs the P4 executor MUST fix (not cosmetic):
  - `ProblemFormPage.jsx` test-case map uses `key={index}` — removing a middle row shifts field values; needs a stable key.
  - `score_weight` held as a string in state — clearing the field sends `NaN` → backend 422; needs a numeric default guard.
  - (cosmetic, also P4) empty `test_cases:[]` falls back to a blank row instead of letting validation fire; `ErrorMessage` missing `onRetry`.
- **Committed P2 as `c230943`** on `feat/questioner-panel`.

## P3 — 該題提交紀錄查看頁  (2026-05-21T10:57:00Z)

### Files created / modified
- `frontend/src/pages/questioner/ProblemSubmissionsPage.jsx` — new page; mounts at `/questioner/problems/:id/submissions`; fetches `GET /api/v1/submissions/?problem_id={id}` via `@/lib/api`; renders a table with columns 提交者 (user_id), 狀態 (JudgeStatusBadge), 分數, 執行時間 (null → "—"), 提交時間 (formatted via toLocaleString); each row has a 查看詳情 button that fetches `GET /api/v1/submissions/{submissionId}` and opens a shadcn Dialog showing status badge, judge_log in a `<pre>` block (null/empty → "無"), and the details array as a table; empty details → "無詳細測試資料"; presigned_url never rendered; loading/error/empty states all handled; 返回 button navigates to `/questioner/problems`
- `frontend/src/pages/questioner/index.js` — added `ProblemSubmissionsPage` barrel export
- `frontend/src/App.jsx` — replaced `problems/:id/submissions` route element from `QuestionerStubPage` to `ProblemSubmissionsPage`; removed now-unused `QuestionerStubPage` import (confirmed no other usage in the file)

### Commands run
- `npm run build` → exit 0 (1691 modules, 2.11 s)
- `npm run test` → 27/27 passed (4 test files, 1.15 s)

### Deviations from plan
- None. All acceptance criteria met as stated.

### Adjacent findings (not fixed)
- `QuestionerStubPage` file still exists at `frontend/src/pages/stubs/QuestionerStubPage.jsx` — no longer imported anywhere in the `/questioner` block; the file itself is not deleted because other stub files (InterviewerStubPage, AdminStubPage) follow the same pattern and the plan does not call for deleting it.

### Blockers / notes for P4
- P4 needs to write `ProblemSubmissionsPage.test.jsx` targeting: (a) renders submission rows from mocked GET; (b) 查看詳情 opens dialog with judge_log; (c) empty details shows "無詳細測試資料". The `useCallback` + `fetchSubmissions` ref is exported via the component scope — tests will need to mock `@/lib/api` via `vi.mock`.
- Two latent bugs from P2 reviewer (carried forward to P4 fix): `key={index}` on test-case rows; `score_weight` stored as string (NaN risk on clear).

### Verifier verdict  (2026-05-21)

```
build:     pass  (1691 modules, exit 0, 2.13 s)
test:      pass  (27/27, 4 files, exit 0 — no regressions)
ts-files:  pass  (0 .ts/.tsx files under frontend/src)
deps:      pass  (frontend/package.json unchanged vs HEAD — no new deps)
lint:      skipped  (no lint script configured — expected)
e2e:       deferred to supervisor (browser test, not run by verifier)
```

Verdict: green

### Reviewer verdict  (2026-05-21)

**Verdict: ship**

#### Criteria scorecard

| # | Criterion | Result | Note |
|---|-----------|--------|------|
| 1 | `GET /api/v1/submissions/?problem_id={id}` — correct path and query param | pass | ProblemSubmissionsPage.jsx:62 — exact string `/api/v1/submissions/?problem_id=${id}` via shared `@/lib/api` |
| 2 | `GET /api/v1/submissions/{submissionId}` — correct path for detail fetch | pass | ProblemSubmissionsPage.jsx:82 — `/api/v1/submissions/${submissionId}` |
| 3 | Table columns: 提交者/狀態/分數/執行時間/提交時間 | pass | ProblemSubmissionsPage.jsx:126-131 — all five columns present |
| 4 | 狀態 column uses `JudgeStatusBadge` | pass | ProblemSubmissionsPage.jsx:139 |
| 5 | null `execution_time` shows "—" (list row) | pass | ProblemSubmissionsPage.jsx:145 — `!= null` guard |
| 6 | "查看詳情" opens Dialog with judge_log in `<pre>` | pass | ProblemSubmissionsPage.jsx:202-207 |
| 7 | null/empty `judge_log` handled — no crash, no literal "null" | pass | ProblemSubmissionsPage.jsx:201 — falsy guard; renders "無" instead |
| 8 | `details` array rendered in Dialog | pass | ProblemSubmissionsPage.jsx:213-248 |
| 9 | Empty `details` → "無詳細測試資料" | pass | ProblemSubmissionsPage.jsx:213-214 — `!details || details.length === 0` |
| 10 | `presigned_url` NOT rendered anywhere | pass | No reference to `presigned_url` in the file |
| 11 | LoadingSpinner on list fetch | pass | ProblemSubmissionsPage.jsx:104-108 |
| 12 | ErrorMessage with onRetry on list fetch | pass | ProblemSubmissionsPage.jsx:112 — `onRetry={fetchSubmissions}` |
| 13 | Empty list → "尚無提交紀錄" | pass | ProblemSubmissionsPage.jsx:117 |
| 14 | App.jsx submissions route now renders ProblemSubmissionsPage | pass | App.jsx:60 |
| 15 | QuestionerStubPage import cleanly removed from App.jsx | pass | App.jsx grep confirms zero references; only the stub file itself remains at stubs/QuestionerStubPage.jsx (unreferenced) |
| 16 | Barrel export clean — 3 named exports | pass | index.js:4 — `ProblemSubmissionsPage` added |
| 17 | No TypeScript; 純中文 strings | pass | Pure JSX; all user-visible strings Chinese |
| 18 | 27 prior tests still green | pass | executor reports 27/27 |
| 19 | `npm run build` exits 0 | pass | executor reports 1691 modules |

#### Must-fix issues

None found.

#### Nice-to-have

- `ProblemSubmissionsPage.jsx:180` — the dialog-internal `ErrorMessage` has no `onRetry` prop. If the detail fetch fails the user can only close the dialog and click "查看詳情" again. Adding `onRetry={() => handleViewDetail(submissionId)}` would require threading the ID into state, which is slightly more involved; acceptable to defer to P4 polish.
- `ProblemSubmissionsPage.jsx:97` — the "返回" button navigates to `/questioner/problems` (hardcoded). If the list page is ever reachable from a different ancestor path, `useNavigate(-1)` or `navigate(-1)` would be more robust. Not a plan criterion.
- `ProblemSubmissionsPage.jsx:229` — detail table uses `key={detail.id ?? idx}`. `SubmissionDetailRead` always has an `id` per the backend contract, so `idx` fallback is only triggered if the backend omits it unexpectedly; this is acceptable defensive coding.

#### Verification gaps

- No Playwright / browser check was run. The plan does not require one for P3, but a quick manual check of the dialog open/close cycle and the null `judge_log` rendering path is recommended before merge.
- The Dialog error branch (line 180) has no retry affordance; user must close and re-click "查看詳情". Functional, but worth noting for P4 polish.

### Supervisor resolution + commit (P3)

- Reviewer verdict: **ship** (no must-fix). Verifier verdict: **green**.
- Reviewer nice-to-haves: Dialog-internal ErrorMessage lacks `onRetry` → fold into P4 polish; "返回" hardcoded path is acceptable (page only reached from the problem list) → no action.
- **Committed P3 as `bddb5a6`** on `feat/questioner-panel`.

## P4 — 潤飾 + 單元測試  (2026-05-21T11:07:00Z)

### Files created / modified

- `frontend/src/pages/questioner/ProblemFormPage.jsx` — (1) added `_clientKey` monotonic counter on `newTestCaseRow()`; (2) changed `useState([])` for testCases (create mode starts empty, edit mode loads from API with no blank-row fallback); (3) refactored `useEffect` into `useCallback fetchProblem` for `onRetry` support; (4) `ErrorMessage` in load-error branch now receives `onRetry={fetchProblem}`; (5) changed map `key` to `tc.id ?? tc._clientKey`; (6) guarded `score_weight`/`time_limit`/`memory_limit` at submit with `Number.isFinite` fallback to prevent NaN; (7) added `useCallback` to import; (8) `_clientKey` stripped from POST/PATCH payload via explicit row construction
- `frontend/src/pages/questioner/ProblemListPage.jsx` — (1) added `deleteError` state; (2) replaced `alert()` on delete failure with `setDeleteError`; (3) rendered `deleteError` inline inside `DialogContent`; (4) clear `deleteError` on cancel/onOpenChange; (5) distinguished empty states: filter active → "沒有符合條件的題目", genuinely empty → "目前沒有題目"
- `frontend/src/pages/questioner/ProblemSubmissionsPage.jsx` — (1) added `currentSubmissionId` state; (2) `handleViewDetail` stores `submissionId` in state; (3) Dialog-internal `ErrorMessage` now receives `onRetry={() => handleViewDetail(currentSubmissionId)}`
- `frontend/src/pages/questioner/ProblemListPage.test.jsx` — new test file; 7 tests: difficulty filter (Easy+Hard → filter to Hard, filter active no match, genuinely empty), delete (success + failure), rejudge (3 submissions_triggered, 0 submissions_triggered)
- `frontend/src/pages/questioner/ProblemFormPage.test.jsx` — new test file; 6 tests: create mode empty fields, edit mode GET 200 pre-populates, POST body has no id/no _clientKey on new row, empty title validation, no test-cases validation, 404 edit shows error message
- `frontend/src/pages/questioner/ProblemSubmissionsPage.test.jsx` — new test file; 5 tests: renders submission rows, 查看詳情 opens dialog with judge_log, empty list shows 尚無提交紀錄, empty details shows 無詳細測試資料, null judge_log shows 無

### Commands run

- `npm run test` → 45/45 passed (7 test files, exit 0); 27 prior + 18 new
- `npm run build` → exit 0 (1691 modules, 2.03 s)

### Deviations from plan

- Plan specified "≥15 new assertions"; delivered 18 across 3 files (6 + 7 + 5 tests).
- `ProblemFormPage` test (c): used `getByRole('button', {name: '新增題目'})` instead of `getByText` because the h1 heading also contains that text; same for `ProblemListPage` delete confirmation button vs `DialogTitle`.
- "No routes matched location" warning in ProblemFormPage test (c) — this is a benign stderr warning from MemoryRouter after `navigate('/questioner/problems')` is called post-submit; the test still passes correctly (POST is verified before navigation).

### Adjacent findings (not fixed)

- React Router v6 future-flag warnings appear in test stderr (v7_startTransition, v7_relativeSplatPath). These are informational only and do not affect test outcomes. They can be suppressed by passing `future` flags to `<MemoryRouter>` if desired — out of scope.
- `ProblemListPage.jsx` line 251 — `rejudgeMsgs` feedback is never auto-cleared; mentioned in P1 reviewer notes as acceptable (plan does not specify auto-dismiss). No action taken.

### Blockers

None. All acceptance criteria met.

### Verifier verdict  (2026-05-21)

```
build:     pass  (1691 modules, exit 0, 4.19 s)
test:      pass  (45/45, 7 files, exit 0 — 27 prior green + 18 new; no regression)
ts-files:  pass  (0 .ts/.tsx files under frontend/src)
deps:      pass  (frontend/package.json unchanged vs HEAD — no new deps)
lint:      skipped  (no lint script configured — expected)
e2e:       deferred to supervisor
```

Verdict: green

### Reviewer verdict  (2026-05-21)

**Verdict: ship**

#### Criteria scorecard

| # | Criterion | Result | Note |
|---|-----------|--------|------|
| A1 | Stable key `tc.id ?? tc._clientKey` on test-case map | pass | ProblemFormPage.jsx:324 — `key={tc.id ?? tc._clientKey}` confirmed in diff |
| A1b | `_clientKey` stripped from POST/PATCH payload | pass | ProblemFormPage.jsx:154-168 — explicit row construction omits `_clientKey`; `if (tc.id !== undefined) row.id = tc.id` preserves existing-row ids only |
| A2 | `score_weight`/`time_limit`/`memory_limit` NaN guard | pass | ProblemFormPage.jsx:156-160, 172-180 — `Number.isFinite(parsed) ? parsed : default` for all three fields |
| A3 | Empty `test_cases:[]` from GET no longer auto-inserts blank row | pass | ProblemFormPage.jsx:84-91 — `setTestCases(rows)` (no fallback); `useState([])` on line 49 |
| A4 | Edit-load `ErrorMessage` has `onRetry` | pass | ProblemFormPage.jsx:213 — `onRetry={fetchProblem}` (diff confirms change from no-prop) |
| A5 | Delete failure shows inline error in Dialog, no `alert()` | pass | ProblemListPage.jsx:99-100 — `setDeleteError`; :280-282 — renders inside `DialogContent`; `alert()` removed |
| A6 | Empty state distinguishes filter-active vs genuinely empty | pass | ProblemListPage.jsx:182 — `difficultyFilter ? '沒有符合條件的題目' : '目前沒有題目'` |
| A7 | ProblemSubmissionsPage dialog `ErrorMessage` has working `onRetry` | pass | ProblemSubmissionsPage.jsx:185 — `onRetry={() => handleViewDetail(currentSubmissionId)}`; `currentSubmissionId` set at :79 before dialog opens |
| B1 | Assertions are meaningful, not vacuous | pass | Tests assert DOM text, spy call args with exact path strings, body property absence (`not.toHaveProperty`), and badge text content |
| B2 | `@/lib/api` properly mocked via `vi.mock` — no real network | pass | All three test files use `vi.mock('@/lib/api', ...)` at module level; no MSW or axios-adapter |
| B3 | Create-form test asserts POST body `test_cases[0]` has no `id` AND no `_clientKey` | pass | ProblemFormPage.test.jsx:183-189 — `expect(tc0).not.toHaveProperty('id')` + `expect(tc0).not.toHaveProperty('_clientKey')` with real call inspection via `api.post.mock.calls[0][1]` |
| B4 | Validation test asserts `api.post` NOT called on empty title | pass | ProblemFormPage.test.jsx:214-215 — `expect(api.post).not.toHaveBeenCalled()` after `fireEvent.click` submit |
| B5 | No false-confidence tests (mocking the stub rather than the unit) | pass | All tests drive real component UI interactions (fireEvent); assertions check resulting DOM or actual spy call args, not mock internals |
| B6 | Components using React Router hooks wrapped in MemoryRouter/Routes | pass | ProblemFormPage.test.jsx uses `MemoryRouter + Routes + Route` with matching path for `useParams`; ProblemSubmissionsPage.test.jsx same pattern; ProblemListPage.test.jsx uses plain `MemoryRouter` (no params needed) |
| C1 | `npm run build` exits 0 | pass | Confirmed: 1691 modules, exit 0, 1.82 s |
| C2 | `npm run test` 45/45 — 27 prior green + 18 new | pass | Independently verified: 7 test files, 45 passed, 0 failed |
| C3 | No TypeScript; 純中文 user-visible strings | pass | Pure JSX throughout; all user-facing strings Chinese |

#### Must-fix issues

None found.

#### Nice-to-have

- `ProblemFormPage.jsx:19` — `_clientKeyCounter` is a module-level `let` variable that is never reset between Vitest test runs within the same worker. This is benign (keys only need uniqueness, not specific values), and the tests confirm it does not cause failures. Adding a `/* @internal */` comment or a `resetForTesting()` export could improve testability if future tests depend on specific key values. Not a blocker.
- `ProblemFormPage.test.jsx:163-165` — the `await waitFor` around "測資 #1" appearing after `fireEvent.click('新增一筆測資')` is a micro-belt-and-suspenders: `addTestCase` is a synchronous `setState`, so the DOM update is synchronous in jsdom with React's test renderer. Harmless, but slightly over-cautious.
- `ProblemSubmissionsPage.test.jsx:24` — the Dialog mock omits `onOpenChange`, so the `setDialogOpen` path triggered by the shadcn close button is not exercised. The plan does not require a "close dialog" test, so this is not a gap against acceptance criteria — but a future test for dialog dismissal would be worth adding.

#### Verification gaps

- No Playwright / browser check run. The plan defers e2e to the supervisor. Given that the key stable-key fix (A1) and NaN guard (A2) are purely logic changes validated by unit tests and a successful build, no browser check is strictly needed before merge, but a manual spot-check of the form edit flow (removing a middle test-case row and re-saving) would confirm the key-stability fix works as intended in the live UI.
- The `onRetry` path for the submissions dialog (A7) is not directly tested — the retry test is not among the 5 ProblemSubmissionsPage tests. The implementation is correct (the lambda closes over `currentSubmissionId` which is set before the dialog opens), but the test gap means a regression in `currentSubmissionId` tracking would not be caught. Low risk; calling it out for completeness.

### Supervisor resolution + commit (P4)

- Reviewer verdict: **ship** (no must-fix). Verifier verdict: **green** (45/45 tests: 27 prior + 18 new).
- All 7 polish items confirmed fixed, incl. the two real latent bugs from the P2 review (stable test-case row keys; `score_weight`/`time_limit`/`memory_limit` NaN guards). Test quality confirmed meaningful (real spy-arg assertions, `vi.mock` for api, no false-confidence tests).
- Reviewer nice-to-haves (module-level `_clientKeyCounter` not reset between test runs; `onRetry`/Dialog-close paths untested) left as-is — benign, no action.
- **Committed P4 as `<SHA>`** on `feat/questioner-panel`.
