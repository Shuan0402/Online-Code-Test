<!-- Loop: interviewer-panel — executor + supervisor progress log. One block per phase attempt. -->

## P1 — Scaffold: directory, barrel, routing, exam list page  (2026-05-21T04:30:00Z)

### Files touched
- `frontend/src/pages/interviewer/ExamListPage.jsx` — **created**: fetches `GET /api/v1/exams/`; renders table with 考試標題, ExamStatusBadge, 時長, 建立時間, 操作 (查看 link + 刪除 dialog); empty state "目前沒有考試"; delete confirm Dialog with inline error on 400.
- `frontend/src/pages/interviewer/index.js` — **created**: barrel exporting `ExamListPage`.
- `frontend/src/App.jsx` — **modified**: removed `InterviewerStubPage` import; added `import { ExamListPage as InterviewerExamListPage } from './pages/interviewer'`; replaced two stub `<Route>` lines under `/interviewer` with single `<Route index element={<InterviewerExamListPage />} />`.
- `frontend/src/pages/stubs/InterviewerStubPage.jsx` — **deleted**.

### Commands run
- `npm run build` → exit 0 (1692 modules, 383 kB JS bundle)
- `npm run test` → 45/45 tests green (7 test files)

### Deviations from plan
- The interviewer `ExamListPage` import aliases to `InterviewerExamListPage` in App.jsx because the candidate panel already exports a component named `ExamListPage` — a name collision that caused build error on first attempt. Fixed by aliasing on import.
- No candidate column added (per supervisor override): `CandidateExamListRead` has no `candidate_id`, so user lookup is intentionally omitted from the list page.
- No `exams/new`, `exams/:id`, or `exams/:id/result` routes added (per supervisor override — each phase adds its own route).

### Adjacent findings (not fixed)
- None.

### Blockers
- None.

### Verifier verdict

```
build:     pass (exit 0, 1692 modules, 383 kB bundle)
test:      pass (45/45, 7 files)
typecheck: skipped (JS-only project)
lint:      skipped (no lint step configured)
e2e:       skipped
```

Stub checks: `grep -rn InterviewerStubPage frontend/src` returns nothing (clean).
`frontend/src/pages/stubs/InterviewerStubPage.jsx` is absent from the stubs directory
(only `AdminStubPage.jsx` and `QuestionerStubPage.jsx` remain).

**Verdict: green**

### Reviewer verdict

**Verdict: ship**

**Criteria scorecard**

1. Build exits 0 — pass (executor confirmed 1692 modules, 0 errors)
2. Tests 100% green — pass (45/45, unchanged)
3. Golden path — pass: `GET /api/v1/exams/` with trailing slash at `ExamListPage.jsx:46`; table shows title, `ExamStatusBadge`, duration, created_at, action buttons; "新增考試" button navigates to `/interviewer/exams/new` at line 104
4. Empty state — pass: `exams.length === 0` renders "目前沒有考試" at line 111
5. Delete 400 inline error, dialog stays open — pass: catch block at line 74–77 sets `deleteError` without clearing `deleteTarget`; row not removed because `setExams` filter is only called on success
6. `InterviewerStubPage` removed — pass: import deleted from `App.jsx`; file deleted; build would fail on stale import

**Must-fix issues**

None found.

**Nice-to-have**

- `ExamListPage.jsx:104`: `navigate('/interviewer/exams/new')` will 404 until P2 wires that route — harmless during P1 since it's intentional incremental routing, but a dead button exists in the running app until P2 lands.
- `ExamListPage.jsx:19-27`: `formatDatetime` helper is file-local; if two more pages duplicate it, consider a shared util. Not a defect for this phase.

**Verification gaps**

- No Playwright/browser check needed for this phase — purely a list page with standard patterns already proven in Questioner. Manual smoke test on the dev server would confirm the "查看" link resolves once P2/P3 add their routes.

### Commit

`620b068` — feat(frontend): P1 — Interviewer panel scaffold + exam list page

---

## P2 — Create exam form  (2026-05-21T12:21:00Z)

### Files touched
- `frontend/src/pages/interviewer/ExamFormPage.jsx` — **created**: create-only form; fetches `GET /api/v1/users/` on mount, filters to `role === 'Candidate'` for dropdown; fields: 考試標題 (text), 考試時長 (number, min=1, default 120), 簡單/中等/困難題數 (number, min=0, default 0), 應試者 (select with UUID values); submit handler validates non-empty title and selected candidate (Chinese error messages, no API call on fail); coerces all numeric fields via `Number()` with NaN guards (duration falls back to 120, counts to 0); `candidate_id` sent as raw UUID string; 201 → navigate to `/interviewer/exams/${res.data.id}`; inline error on API failure; zero-candidates message instead of empty select.
- `frontend/src/pages/interviewer/index.js` — **modified**: added `ExamFormPage` export.
- `frontend/src/App.jsx` — **modified**: added `ExamFormPage` to barrel import; added `<Route path="exams/new" element={<ExamFormPage />} />` under `/interviewer`.

### Commands run
- `npm run build` → exit 0 (1693 modules, 386 kB JS bundle)
- `npm run test` → 45/45 green (7 test files, no new tests in P2)

### Deviations from plan
- Submit button is additionally disabled when `candidates.length === 0` (no candidates in system) — prevents a confusing submit attempt with no candidate selected and nothing in the dropdown. Consistent with the plan's "helpful Chinese message" guidance.

### Adjacent findings (not fixed)
- None.

### Blockers
- None. The navigate target `/interviewer/exams/${id}` will 404 until P3 wires that route — expected mid-loop behaviour per plan.

### Verifier verdict

```
build:     pass (exit 0, 1693 modules, 386.99 kB bundle)
test:      pass (45/45, 7 files — React Router future-flag warnings in stderr, not errors)
typecheck: skipped (JS-only project)
lint:      skipped (no lint step configured)
e2e:       skipped
```

**Verdict: green**

### Reviewer verdict

**Verdict: ship**

**Criteria scorecard**

1. Build exits 0 — pass (executor confirmed 1693 modules, 386 kB, no errors)
2. Tests 100% green — pass (45/45, no regression)
3. Golden path POST body shape — pass: `ExamFormPage.jsx:84-92` sends `{ title, duration_minutes, easy_count, medium_count, hard_count, candidate_id }` to `POST /api/v1/exams/` with trailing slash at line 96
4. Numeric coercion non-vacuous — pass: `line 79` runs `Number(durationMinutes)` on the raw string state (not already-a-number), then `line 86` guards `Number.isFinite(...) && > 0`; clearing the field produces `Number("") === 0`, which fails the `> 0` check, so duration correctly falls back to 120. Same pattern for counts at lines 87-89.
5. `candidate_id` is UUID string — pass: `line 91` uses `candidateId` directly from select `value`, which is `u.id` (UUID) at `line 217`; no `Number()` call applied.
6. Validation — pass: empty title blocked at `line 67-70` ("請填寫考試標題"); no candidate blocked at `line 71-74` ("請選擇應試者"); both return before `api.post`.
7. `GET /api/v1/users/` filtered client-side to `role === 'Candidate'` — pass: `line 42-44`.
8. Barrel and route wiring — pass: `index.js` exports `ExamFormPage`; `App.jsx` adds `<Route path="exams/new">`.

**Must-fix issues**

None found.

**Nice-to-have**

- `ExamFormPage.jsx:237`: submit button is disabled when `candidates.length === 0`, which means the "請選擇應試者" validation path (line 71-74) is unreachable when no candidates exist. This is a UX improvement (not a data-corruption risk), but if the button-disabled guard is ever removed, the validation remains correct as a fallback. Fine for P2.
- `ExamFormPage.jsx:209`: uses a raw `<select>` instead of shadcn `<Select>` — visually inconsistent with the rest of the form. Not a functionality defect; cosmetic polish for P5.

**Verification gaps**

- No browser/Playwright check needed — the form is additive and follows the proven `ProblemFormPage` pattern. No user-visible behavior was regressed.
- P2 adds no new tests (plan defers tests to P5) — that is expected per plan and not a defect here.

### Commit

`a730e6e` — feat(frontend): P2 — Interviewer create-exam form

### Supervisor note

Reviewer's "raw `<select>` vs shadcn `<Select>`" nice-to-have is moot — there is no
`select` component under `frontend/src/components/ui/` and the Questioner panel uses raw
`<select>` too. Nothing to carry to P5.

---

## P3 — Exam detail / edit page  (2026-05-21T12:40:00Z)

### Thought (pre-read)
P3 is the highest-risk phase: one page handles view, edit (PATCH), auto-generate (POST .../generate), manual-add picker (Dialog + POST .../problems with int `problem_id`), publish (POST .../publish), and delete (DELETE → navigate). Key invariants: `exam_problems` rows keyed by `problem_id` (int, not array index); `problem_id` sent as `Number()` in add-problem body; all Draft-only actions gated on `exam.status === 'Draft'`; PATCH sends only `{ title, duration_minutes }` (no `status`/times); publish button disabled when `exam_problems.length === 0`. Plan was read fully before any edits. Studied `ExamListPage.jsx` (delete dialog pattern), `ExamFormPage.jsx` (numeric coercion pattern), `ProblemListPage.jsx` (bank fetch + dialog pattern), `ExamStatusBadge` (status values: Draft/Published/Ongoing/Finished/Archived).

### Thought (design)
`ExamDetailPage` will use `useParams()` for the exam UUID, `Promise.all` to fetch exam + users in parallel, a `usersMap` derived from the users response, inline state for each mutation (`saving`, `generating`, `publishing`, `deleteLoading`, `addingId`), and separate error states for each action. The manual-add picker fetches the problem bank only when the Dialog opens (lazy). Available problems are filtered client-side by excluding `problem_id`s already in `exam.exam_problems`. Every mutating endpoint returns the updated `ExamRead`; after success, `setExam(res.data)` refreshes all derived state (no re-fetch needed).

### Action 1 — Create ExamDetailPage.jsx
Created `frontend/src/pages/interviewer/ExamDetailPage.jsx` (~340 lines). Key implementation decisions:
- `Promise.all([api.get('/api/v1/exams/${id}'), api.get('/api/v1/users/')])` on mount; `usersMap` is a plain `{}` built from the users response.
- Candidate display name: `usersMap[exam.candidate_id] ?? exam.candidate_id ?? '—'` (falls back to raw UUID if user not found, not a crash).
- `isDraft = exam?.status === 'Draft'` computed from exam state; all action buttons disabled when false.
- `handleSave` — PATCH body is `{ title, duration_minutes }` only; guards non-draft with `setSaveError('非草稿狀態不可編輯')` before API call.
- `handleAddProblem(problemId)` — sends `{ problem_id: Number(problemId), points: 100 }`; `Number()` ensures int even if browser gives string.
- `addedIds = new Set(exam.exam_problems.map(p => p.problem_id))` — used to filter picker rows; recomputed from new exam state after each add.
- `exam_problems` table uses `key={problem.problem_id}` explicitly (comment "L1 pre-emption").
- Publish button has dual guard: `disabled={!isDraft || exam.exam_problems.length === 0 || publishing}`.
- Delete: on 204 success → `navigate('/interviewer')`; on error → `deleteError` shown inline, dialog stays open.
- Problem bank is fetched lazily inside `openPicker()` — no pre-load on mount.

### Observation 1
File created successfully. Code reviewed mentally: all six actions present, gated correctly, keys correct.

### Action 2 — Update barrel index.js
Added `export { default as ExamDetailPage } from './ExamDetailPage'` to `frontend/src/pages/interviewer/index.js`.

### Observation 2
File updated. Barrel now exports ExamListPage, ExamFormPage, ExamDetailPage.

### Action 3 — Update App.jsx
- Added `ExamDetailPage` to the barrel destructure import on line 13.
- Added `<Route path="exams/:id" element={<ExamDetailPage />} />` under `/interviewer`.
- No import collision: `ExamDetailPage` is a new name; `ExamListPage` is already aliased to `InterviewerExamListPage`.
- Did NOT add `exams/:id/result` route — that is P4.

### Observation 3
App.jsx now has the correct three routes under `/interviewer`: `index`, `exams/new`, `exams/:id`.

### Action 4 — Build + test
- `npm run build` → exit 0, 1694 modules, 395.99 kB JS bundle (1 more module than P2's 1693).
- `npm run test` → 45/45 tests green, 7 test files, all passing. React Router future-flag warnings in stderr are pre-existing and not failures.

### Observation 4
Both verification commands pass. No regressions.

### Summary

**Files touched:**
- `frontend/src/pages/interviewer/ExamDetailPage.jsx` — **created** (new page: view + edit + auto-generate + manual-add + publish + delete)
- `frontend/src/pages/interviewer/index.js` — **modified** (added ExamDetailPage export)
- `frontend/src/App.jsx` — **modified** (added ExamDetailPage import + `exams/:id` route)

**Commands run:**
- `npm run build` → exit 0 (1694 modules, 395.99 kB)
- `npm run test` → 45/45 green (7 files)

**Deviations from plan:**
- None. All six P3 features implemented exactly as specified.

**Adjacent findings (not fixed):**
- `ExamDetailPage.jsx` — the "查看結果" link navigates to `/interviewer/exams/${id}/result` which will 404 until P4 wires that route. This is expected mid-loop behaviour (mirrors the P1 "新增考試" dead-button during P1).

**Blockers:** None.

### Verifier verdict

```
build:     pass (exit 0, 1694 modules, 395.99 kB bundle)
test:      pass (45/45, 7 files)
typecheck: skipped (JS-only project)
lint:      skipped (no lint step configured)
e2e:       skipped
```

React Router v7 future-flag warnings appear in test stderr — pre-existing advisory, not failures.

**Verdict: green**

### Reviewer verdict

**Verdict: ship**

**Criteria scorecard**

1. Build exits 0 — pass (confirmed independently: 1694 modules, exit 0)
2. Tests 100% green — pass (confirmed independently: 45/45)
3. Golden path (Draft exam) — pass: all six actions present; `Promise.all` fetch at line 80; PATCH body `{title, duration_minutes}` only at line 121–125; generate at line 144; add-problem at line 181–183; publish at line 201; delete+navigate at lines 215–216.
4. Non-Draft gating — pass: `isDraft` gates edit inputs (lines 291, 302), save button (line 308), generate button (line 324), add button (line 333), publish button (line 388); `handleSave` also checks `!isDraft` at line 114 and sets "非草稿狀態不可編輯" for keyboard-submit bypass.
5. Publish zero-problem guard — pass: `disabled={!isDraft || exam.exam_problems.length === 0 || publishing}` at line 388.
6. `problem_id` is int in add-problem body — pass: `Number(problemId)` explicit coerce at line 182; `p.id` from problem bank is already int per `ProblemShortRead` schema.
7. `exam_problems` table key — pass: `key={problem.problem_id}` at line 361 with comment "L1 pre-emption".

**Must-fix issues**

None found. Every borderline item assessed below:

- `openPicker` and `handleAddProblem` have no internal `isDraft` guard (`ExamDetailPage.jsx:154`, `176`). However: `openPicker` is only bound to a button that is `disabled={!isDraft}`, and `handleAddProblem` is only reachable from within that dialog. No keyboard path bypasses `disabled` on a `<button>`. Backend returns 400 for non-Draft as a second layer. Not must-fix.
- `handleSave` silently falls back to `exam.title` when `editTitle.trim()` is empty (line 122) — design choice, not data corruption. Not must-fix.

**Nice-to-have**

- `ExamDetailPage.jsx:154`: add `if (!isDraft) return` guard at top of `openPicker` for defense-in-depth. Low priority.
- `ExamDetailPage.jsx:122`: validate non-empty title client-side (like `ExamFormPage`) and show a Chinese error instead of silently keeping the old title. Minor UX polish for P5.

**Verification gaps**

- No browser/Playwright check required — all mutations follow the same axios patterns proven in prior pages; the picker dialog pattern mirrors ProblemListPage. The highest-risk logic (type coercions, gating, key correctness) is all source-verifiable and passes code inspection. Tests for these invariants are deferred to P5 per plan.

### Commit

`07f8efb` — feat(frontend): P3 — Interviewer exam detail/edit page

### Supervisor note — carried to P5

Two reviewer nice-to-haves are genuine polish items for P5 (re-triaged: neither is a
data-corruption / malformed-request / misrender bug, so not must-fix):
1. `ExamDetailPage.jsx` `openPicker` — add `if (!isDraft) return` for defense-in-depth.
2. `ExamDetailPage.jsx` `handleSave` — show a Chinese empty-title validation error
   instead of silently falling back to `exam.title` (consistency with `ExamFormPage`).

---

## P4 — Exam result page + exam-list enrichments  (2026-05-21T14:01:00Z)

### Files touched
- `frontend/src/pages/interviewer/ExamResultPage.jsx` — **created**: read-only page; fetches `GET /api/v1/exams/{id}/result`; renders exam title + `ExamStatusBadge`, total-score banner (`total_candidate_score ?? '—'` / `total_exam_points 分`), per-problem table (題號, 名稱, 滿分, 得分, `JudgeStatusBadge` for `submission_status`); empty state "尚無結果"; error state with 返回考試詳情 button.
- `frontend/src/pages/interviewer/ExamListPage.jsx` — **modified**: added `STATUS_OPTIONS` constant and `statusFilter` state; added `filteredExams` derivation (client-side, no extra API call); added status `<select>` filter above the table; added "分數" column (`exam.score != null ? '${score} 分' : '—'`); changed table body iteration from `exams.map` to `filteredExams.map`.
- `frontend/src/pages/interviewer/index.js` — **modified**: added `ExamResultPage` export.
- `frontend/src/App.jsx` — **modified**: added `ExamResultPage` to barrel import; added `<Route path="exams/:id/result" element={<ExamResultPage />} />` under `/interviewer`.

### Commands run
- `npm run build` → exit 0 (1695 modules, 399.62 kB JS bundle)
- `npm run test` → 45/45 green (7 test files)

### Deviations from plan
- None. All plan items implemented exactly as specified.

### Adjacent findings (not fixed)
- `ExamDetailPage.jsx` "查看結果" link is now wired and no longer 404s (this was the expected mid-loop dead link from P3).

### Blockers
- None.

### Verifier verdict

```
build:     pass (exit 0, 1695 modules, 399.62 kB bundle)
test:      pass (45/45, 7 files)
typecheck: skipped (JS-only project)
lint:      skipped (no lint step configured)
e2e:       skipped
```

React Router v7 future-flag warnings in test stderr — pre-existing advisory, not failures.

**Verdict: green**

### Reviewer verdict

**Verdict: ship**

**Criteria scorecard**

1. Build exits 0 — pass (independently confirmed: exit 0, 1695 modules, 399.62 kB)
2. Tests 100% green — pass (independently confirmed: 45/45)
3. ExamResultPage fetches correct endpoint, renders banner + table with JudgeStatusBadge — pass: `ExamResultPage.jsx:25` calls `/api/v1/exams/${id}/result` (item route, no trailing slash is correct); JudgeStatusBadge at line 115.
4. Null total_candidate_score graceful — pass: `ExamResultPage.jsx:60-61` uses `!= null` coalesce to `'—'`; no crash because `result` is never accessed before loading/error guards resolve.
5. Empty results[] empty state — pass: `ExamResultPage.jsx:88` checks `result.results.length === 0` and renders "尚無結果".
6. ExamListPage score column, null shows '—' — pass: `ExamListPage.jsx:174` uses `exam.score != null`.
7. Status filter client-side, real enum values — pass: `ExamListPage.jsx:96-98` derives `filteredExams` from local state only; STATUS_OPTIONS lines 31-38 use Draft/Published/Ongoing/Finished/Archived matching ExamStatusBadge enum.
8. exams/:id/result route wired, no conflict with exams/:id — pass: `App.jsx:74-75` lists `exams/:id` then `exams/:id/result`; React Router v6 prefers the more-specific static segment match, so no ambiguity.

**Must-fix issues**

None found.

**Nice-to-have**

- `ExamResultPage.jsx:21`: local function named `fetch` shadows `window.fetch`. No bug here (only `api.get` is used), but this name will confuse the P9 test author who spies on `window.fetch` for SubmissionDetailPage. Consider renaming to `loadResult`.
- `ExamListPage.jsx:147-148`: when a filter is active and produces zero rows, "目前沒有考試" appears — misleading (implies no exams exist at all). A secondary message like "篩選結果為空" when `exams.length > 0 && filteredExams.length === 0` would be cleaner. Low-priority polish.

**Verification gaps**

- No new tests in P4 (deferred to P9 per plan — expected).
- No browser/Playwright check required: ExamResultPage is read-only; ExamListPage changes are purely additive. No existing page behavior was altered.

### Commit

`837dcd7` — feat(frontend): P4 — exam result page + exam-list score column & filter

### Supervisor note

- Reviewer nice-to-have #1 (`ExamResultPage.jsx` local function named `fetch` shadowing
  `window.fetch`) was **fixed before commit** — renamed to `loadResult`. Build + test
  re-confirmed green (45/45) after the rename. This removes a real footgun for the P9
  `window.fetch` spy.
- Reviewer nice-to-have #2 (filter-active zero-rows shows "目前沒有考試" instead of a
  "篩選結果為空" message) — minor UX polish, carried forward; fold into P9 if cheap.

---

## Mid-loop handoff — 2026-05-21 (after P3)

**Trigger**: harness Phase 2.5 context-pressure check fired (3 phases shipped +
supervisor context heavy). User accepted handoff.

**Scope change (concurrent with handoff)**: after P3 the user shared the panel spec
doc (https://hackmd.io/@st980155/rJvy4aORWg) and chose "對照規格全部補齊" — the
Interviewer panel scope expanded well beyond the original 5-phase plan. The intake
"no user creation" answer is void. Full detail in `.harness/prompt.md` → "Scope change
log" (includes the backend reality check for the new pages).

**State at handoff**:
- P1–P3 shipped + committed: `620b068` (P1), `a730e6e` (P2), `07f8efb` (P3), each
  followed by a `chore(harness): record P# commit SHA` commit.
- `cd frontend && npm run build` → exit 0; `npm run test` → 45/45 green as of P3.
- Working tree clean apart from this `.harness/` handoff update.
- Branch `feat/interviewer-panel`, stacked on `feat/questioner-panel`. No PR opened yet.

**What the new session must do**:
1. Read `.harness/prompt.md` (esp. "Scope change log") + `.harness/plan.md` (P1–P3
   blocks valid; P4/P5 superseded) + this file.
2. Verify backend submission endpoints by reading
   `backend/app/api/api_v1/endpoints/submission.py` BEFORE planning the candidate
   problem-solving detail page (per-submission source code is behind an S3 presigned
   URL — confirm the exact contract).
3. Re-run the harness planner over the remaining scope: exam result page, candidate
   account management (list + create + detail), candidate problem-solving detail page,
   profile / change-password page, exam-list enrichments (score column + filter),
   Vitest tests. The planner should overwrite `plan.md` from P4 onward (or renumber).
4. Resume the execute → review → verify → commit cycle, one phase at a time.

---

## P5 — Candidate account management: list + create  (2026-05-21T14:12:00Z)

### Files touched
- `frontend/src/pages/interviewer/CandidateListPage.jsx` — **created**: fetches `GET /api/v1/users/`; filters client-side to `role === 'Candidate'`; renders table with 考生姓名 (`full_name ?? username`), 考生帳號, 建立時間, 操作 (查看 link to `/interviewer/candidates/:id`); empty state "目前沒有考生"; "新增考生" button → `/interviewer/candidates/new`; note "刪除考生帳號需由管理員操作" (no delete button).
- `frontend/src/pages/interviewer/CandidateFormPage.jsx` — **created**: create-candidate form; fields: 姓名 (optional ≤100), 帳號 (required, 3–50), 密碼 (required ≥8, type=password); client-side validation with Chinese error messages; sends `POST /api/v1/users/` with `{ username, full_name: null when empty, password, role: 'Candidate' }`; 201 → navigate to `/interviewer/candidates/:newId`; inline API error handling.
- `frontend/src/pages/interviewer/index.js` — **modified**: added `CandidateListPage` and `CandidateFormPage` exports.
- `frontend/src/App.jsx` — **modified**: added `CandidateListPage` and `CandidateFormPage` to barrel import; added `<Route path="candidates" element={<CandidateListPage />} />` and `<Route path="candidates/new" element={<CandidateFormPage />} />` under `/interviewer`.
- `frontend/src/layouts/StaffLayout.jsx` — **modified**: added `{ to: '/interviewer/candidates', label: '考生管理' }` to `interviewer` array, `admin` array, and the unknown-role fallback array in `NAV_BY_ROLE`.

### Commands run
- `npm run build` → exit 0 (1697 modules, 404.65 kB JS bundle)
- `npm run test` → 45/45 green (7 test files)

### Deviations from plan
- None. All plan items implemented exactly as specified.

### Adjacent findings (not fixed)
- `CandidateListPage.jsx`: "查看" link navigates to `/interviewer/candidates/:id` which will 404 until P6 wires that route — expected mid-loop behaviour.

### Blockers
- None.

### Verifier verdict

```
typecheck: skipped (JS-only project)
lint:      skipped (no lint step configured)
build:     pass (exit 0, 1697 modules, 404.65 kB bundle)
test:      pass (45/45, 7 files)
e2e:       skipped
```

React Router v7 future-flag warnings in test stderr — pre-existing advisory, not failures. No new warnings introduced by P5.

**Verdict: green**

### Reviewer verdict

**Verdict: ship**

**Criteria scorecard**

1. Build exits 0 — pass (independently confirmed: exit 0, 1697 modules, 404.65 kB)
2. Tests 100% green — pass (independently confirmed: 45/45)
3. Golden path list — pass: `CandidateListPage.jsx:31` fetches `GET /api/v1/users/` (trailing slash); line 33 filters `role === 'Candidate'`; table columns 考生姓名/考生帳號/建立時間/操作 at lines 79–82; "新增考生" button at line 66; "查看" link at line 100.
4. Empty state "目前沒有考生" — pass: `CandidateListPage.jsx:73` inside the `candidates.length === 0` branch.
5. No delete button, admin note present — pass: no delete UI anywhere; "刪除考生帳號需由管理員操作" at line 111, outside the ternary so it renders in both empty and populated states.
6. Golden path create — pass: `CandidateFormPage.jsx:40–45` builds `{ username: username.trim(), full_name: null when empty, password, role: 'Candidate' }`; `POST /api/v1/users/` at line 46; 201 → navigate to `/interviewer/candidates/${res.data.id}` at line 48.
7. Client-side validation — pass: empty username (line 21–23) → "請填寫帳號"; `username.trim().length < 3` (line 25–27) → "帳號至少需要 3 個字元"; empty password (line 29–31) → "請填寫密碼"; `password.length < 8` (line 33–35) → "密碼至少需要 8 個字元"; all return before `api.post`.
8. Sidebar "考生管理" — pass: `StaffLayout.jsx:27` (interviewer array), line 32 (admin array), line 44 (fallback).

**Must-fix issues**

None found.

**Nice-to-have**

- `CandidateListPage.jsx:111`: the admin-note line renders even in the empty state (candidates.length === 0), where it appears below the "目前沒有考生" message. Visually harmless and arguably correct to show it always, but could be conditionally shown only when table is populated to reduce noise. Not a defect.
- `CandidateFormPage.jsx:25`: the length check is against `username.trim()` but the empty check at line 21 is also against `username.trim()`, so a username of "  " (only spaces) correctly triggers "請填寫帳號", not the length error. Behavior is correct; no action needed.

**Verification gaps**

- No new tests in P5 (deferred to P9 per plan — expected).
- No browser/Playwright check required: both pages are additive, no existing page behavior was altered. `candidates/:id` "查看" link will 404 until P6 — expected mid-loop behavior per plan.

### Commit

`91ab6d2` — feat(frontend): P5 — candidate account list & create form

---

## P6 — Candidate detail page  (2026-05-21T14:20:00Z)

### Files touched
- `frontend/src/pages/interviewer/CandidateDetailPage.jsx` — **created**: two-section page; section 1 fetches `GET /api/v1/users/{id}` → renders 考生資料 card (姓名, 帳號, 角色, 建立時間); section 2 fans out via `GET /api/v1/exams/` → `Promise.all(GET /api/v1/exams/{id})` → filters `candidate_id === userId` → renders sub-table (考試標題, ExamStatusBadge, 時長, "查看考試" link); empty state "尚無考試紀錄"; fan-out guarded against empty list; exams-error shows "無法載入考試列表" without crashing profile; 404 from `GET /users/{id}` → `ErrorMessage`; back link "← 返回考生列表".
- `frontend/src/pages/interviewer/index.js` — **modified**: added `CandidateDetailPage` export.
- `frontend/src/App.jsx` — **modified**: added `CandidateDetailPage` to barrel import; added `<Route path="candidates/:id" element={<CandidateDetailPage />} />` under `/interviewer`.

### Commands run
- `npm run build` → exit 0 (1698 modules, 408.06 kB JS bundle)
- `npm run test` → 45/45 green (7 test files)

### Deviations from plan
- None. Fan-out pattern, guards, empty states, and back link all implemented exactly as specified.

### Adjacent findings (not fixed)
- None.

### Blockers
- None.

### Verifier verdict

```
typecheck: skipped (JS-only project)
lint:      skipped (no lint step configured)
build:     pass (exit 0, 1698 modules, 408.06 kB bundle)
test:      pass (45/45, 7 files)
e2e:       skipped
```

React Router v7 future-flag warnings in test stderr — pre-existing advisory, not failures.

**Verdict: green**

### Reviewer verdict

**Verdict: ship**

**Criteria scorecard**

1. Build exits 0 — pass (independently confirmed: exit 0, 1698 modules, 408.06 kB)
2. Tests 100% green — pass (independently confirmed: 45/45, no regressions)
3. Section 1 — 考生資料 card from `GET /api/v1/users/{id}` — pass: `CandidateDetailPage.jsx:38` calls item route (no trailing slash); card renders 姓名 (`full_name ?? '—'`), 帳號, 角色, 建立時間 at lines 97–104; `UserRead` fields all present.
4. Section 2 — fan-out sub-table — pass: `line 60` `GET /api/v1/exams/` with trailing slash (collection); `line 70` `GET /api/v1/exams/${id}` without trailing slash (item); filter `e.candidate_id === userId` at line 71 compares UUID string to UUID string — both come from the backend as strings, no type mismatch.
5. Empty-list guard skips fan-out — pass: `lines 64–67` guard on `ids.length === 0` returns before `Promise.all`; `finally` still runs and sets `examsLoading(false)` (verified: JS `finally` executes even after early `return` in `try`).
6. Fan-out error isolation — pass: `lines 73–74` catch sets "無法載入考試列表" without touching `userError`; profile section renders independently.
7. 404 on `GET /users/{id}` → `ErrorMessage` — pass: `lines 42–43` branch on `status === 404`; `ErrorMessage` rendered at line 92.
8. Empty exams state "尚無考試紀錄" — pass: `line 122–126`.
9. Back link "← 返回考生列表" → `/interviewer/candidates` — pass: `lines 162–167`.
10. Route ordering — pass: `candidates/new` is listed before `candidates/:id` in `App.jsx` (lines 77–78); React Router v6 best-match handles this correctly regardless.
11. Barrel export — pass: `index.js` adds `CandidateDetailPage`.
12. JS only, Traditional Chinese strings, shared components reused — pass: no TypeScript; all strings are 繁體中文; uses `LoadingSpinner`, `ErrorMessage`, `ExamStatusBadge`.

**Must-fix issues**

None found. All criteria pass; every borderline item inspected:

- The `return` inside the `try` block at `CandidateDetailPage.jsx:66` correctly triggers `finally` → `setExamsLoading(false)` is called. Verified via Node.js evaluation. Not a bug.
- `candidate_id === userId` at line 71: both are UUID strings from the backend (`ExamRead.candidate_id` is UUID, `useParams()` id is a string). Type comparison is correct.
- Stale-closure risk on `:id` change: both `useEffect`s depend on `[userId]`, so navigation from `/interviewer/candidates/A` to `/interviewer/candidates/B` re-runs both effects. No stale closure.

**Nice-to-have**

- `CandidateDetailPage.jsx:29`: `examsLoading` starts as `true` and the exams spinner shows immediately even while the user section is still loading. A minor UX tweak would be to start `examsLoading` as `false` and set it `true` only when the user profile has loaded (sequential approach) — but the plan explicitly says the two sections fetch independently, so this is by design.
- `CandidateDetailPage.jsx:102`: `candidate.role` is rendered as a raw English enum string (e.g. "Candidate"). A Chinese label map (as used by `ExamStatusBadge`) would be more consistent. Low-priority polish for P9 if wanted.

**Verification gaps**

- No new Vitest tests in P6 (deferred to P9 per plan — expected). The P9 test plan must cover: (a) empty exam list skips fan-out (assert `api.get` is called exactly once for the list, zero times for item routes); (b) `candidate_id === userId` filter is applied; (c) fan-out error shows "無法載入考試列表" but does not crash the profile section.
- No browser/Playwright check required — the page is read-only (no mutations) and follows the same fetch/render pattern as prior pages.

### Commit

`bd0710d` — feat(frontend): P6 — candidate detail page

### Supervisor note — carried to P8/P9

Reviewer nice-to-have: `candidate.role` renders as the raw English enum (e.g.
"Candidate"). The same raw-role display will appear on the P8 profile page. Decide in
P8 whether to add a small Chinese role-label map and apply it to both pages — minor
純中文-consistency polish, not a defect.

---

## Mid-loop handoff — 2026-05-21 (after P6)

**Trigger**: harness Phase 2.5 context-pressure check fired — 3 phases shipped this
session (P4, P5, P6) + supervisor context heavy from repeated full `implement.md`
reloads. User accepted the handoff.

**State at handoff**:
- This is the SECOND handoff of the interviewer-panel loop (first was after P3).
- P1–P6 all shipped + committed, each followed by a `chore(harness): record P# commit
  SHA` commit:
  - `620b068` P1, `a730e6e` P2, `07f8efb` P3 (prior session)
  - `f429190` chore — replan of remaining scope into P4–P9 (this session)
  - `837dcd7` P4 — exam result page + exam-list score column & filter
  - `91ab6d2` P5 — candidate account list & create form
  - `bd0710d` P6 — candidate detail page
- `cd frontend && npm run build` → exit 0 (1698 modules); `npm run test` → 45/45 green
  as of P6.
- Working tree clean apart from this `.harness/implement.md` handoff update.
- Branch `feat/interviewer-panel`, stacked on `feat/questioner-panel`. No PR opened yet.
- The plan (`.harness/plan.md`) is current and accurate — P4–P9 were freshly planned
  this session and P4/P5/P6 executed exactly as written. **P7, P8, P9 still pending.**
  The plan's "Open questions" section is fully resolved (all three closed).

**What the new session must do**:
1. Read `.harness/prompt.md` (full backend contract incl. the verified submission
   contract), `.harness/plan.md` (P7/P8/P9 phase blocks — all accurate, no re-planning
   needed), and this file.
2. Resume the execute → review → verify → commit cycle at **P7** — the highest-risk
   phase (full ReAct). P7 = candidate problem-solving detail page; the critical footgun
   is that the S3 `presigned_url` must be fetched with plain `window.fetch()`, NOT the
   shared axios `api` instance. The plan's P7 block and `prompt.md`'s "Verified
   submission contract" cover this in detail.
3. Then P8 (profile / change-password — note `PATCH /me` cannot change `username`;
   password body is `{ old_password, new_password }`) and P9 (Vitest tests for P4–P8).
4. After P9, run Phase 6 (lessons + loop close): write `.harness/lessons.md`, commit
   `chore(harness): close loop interviewer-panel`, propose memory updates, then the
   loop is done — open the PR (base = `feat/questioner-panel`); never `gh pr merge`.

**Kickoff**: `/harness resume`

---

## P7 — Candidate problem-solving detail page  (2026-05-21T15:20:00Z)

### Thought 1 — Design the multi-step data flow
`SubmissionDetailPage` must: (1) fetch `GET /api/v1/exams/{examId}` to get `candidate_id` + exam title; (2) fetch `GET /api/v1/submissions/?exam_id=&problem_id=<Number>&user_id=` — if empty, show "考生尚未提交此題" and stop; (3) take submissions[0].id; (4) parallel fetch `GET /api/v1/submissions/{id}` + `GET /api/v1/problems/{problemId}`; (5) if `presigned_url !== null`, fetch source with `window.fetch(presigned_url)` (plain fetch — NOT api axios instance). Display problem info, submission info, source in `<pre>`, and details[] table. Guard `presigned_url === null` → "程式碼暫無法顯示".

### Action 1 — Create SubmissionDetailPage.jsx
Created `frontend/src/pages/interviewer/SubmissionDetailPage.jsx` (~280 lines). Key implementation decisions:
- `Number(problemId)` coercion at top of `loadAll()` before any API call.
- Steps executed sequentially in a single `useEffect`: step 1 (exam) → step 2 (submissions list) → early return if `length === 0` → step 3+4 parallel (submission detail + problem).
- `window.fetch(submissionData.presigned_url)` with comment `// S3 presigned URL — must use plain fetch(), NOT api axios instance`.
- `presigned_url === null` guard: sets `sourceUnavailable = true` before the fetch attempt.
- S3 fetch failure also sets `sourceUnavailable = true` (graceful degradation).
- Source displayed in `<pre className="bg-muted rounded p-4 text-sm overflow-auto whitespace-pre-wrap break-words">` (no Monaco).
- `details[]` table keyed by `detail.id` (int from `SubmissionDetailRead`).
- All UI sections ordered per plan: 頁首, 題目資訊, 提交資訊, 程式碼, 測資結果.

### Observation 1
File created successfully. Confirmed critical line uses `window.fetch(submissionData.presigned_url)` with the required comment.

### Action 2 — Update barrel index.js
Added `export { default as SubmissionDetailPage } from './SubmissionDetailPage'` to `frontend/src/pages/interviewer/index.js`.

### Observation 2
Barrel now exports 8 pages: ExamListPage, ExamFormPage, ExamDetailPage, ExamResultPage, CandidateListPage, CandidateFormPage, CandidateDetailPage, SubmissionDetailPage.

### Action 3 — Update App.jsx
- Added `SubmissionDetailPage` to the barrel destructure import.
- Added `<Route path="exams/:examId/problems/:problemId" element={<SubmissionDetailPage />} />` after `exams/:id/result` under `/interviewer`.
- Route is more specific than `exams/:id` due to additional `/problems/:problemId` segment; React Router v6 resolves correctly.

### Observation 3
App.jsx now has 8 routes under `/interviewer`. No import collision — `SubmissionDetailPage` is a new name.

### Action 4 — Update ExamDetailPage.jsx to add "查看提交" links
Added a conditional "操作" `<th>` header and a "查看提交" `<Button asChild><Link>` cell on each problem row in the `exam_problems` table. Both gated on `!isDraft` — no link shown when exam is in Draft status (no submissions possible). Link navigates to `/interviewer/exams/${id}/problems/${problem.problem_id}` (using the page's `id` param for examId).

### Observation 4
ExamDetailPage.jsx updated cleanly. The `Link` import was already present on line 2; no new imports needed.

### Action 5 — Build + test
- `npm run build` → exit 0, 1699 modules, 413.74 kB bundle (+1 module from P6's 1698).
- `npm run test` → 45/45 green, 7 test files, no regressions.

### Observation 5
Both verification commands pass. React Router future-flag warnings in test stderr are pre-existing advisories, not failures.

### Summary

**Files touched:**
- `frontend/src/pages/interviewer/SubmissionDetailPage.jsx` — **created** (multi-step fetch: exam → submissions list → submission detail + problem → S3 source; presigned_url plain fetch with comment; null/empty guards)
- `frontend/src/pages/interviewer/index.js` — **modified** (added SubmissionDetailPage export)
- `frontend/src/App.jsx` — **modified** (added SubmissionDetailPage import + `exams/:examId/problems/:problemId` route)
- `frontend/src/pages/interviewer/ExamDetailPage.jsx` — **modified** (added "查看提交" link column on problem rows, gated on `!isDraft`)

**Commands run:**
- `npm run build` → exit 0 (1699 modules, 413.74 kB)
- `npm run test` → 45/45 green (7 files)

**Critical invariant confirmed:**
- `window.fetch(submissionData.presigned_url)` with comment `// S3 presigned URL — must use plain fetch(), NOT api axios instance` — NOT `api.get(...)`.
- `presigned_url === null` guard sets `sourceUnavailable = true` before fetch, renders "程式碼暫無法顯示".
- Empty submissions list: sets `notSubmitted = true`, returns before `GET /submissions/{id}` or S3 fetch calls.
- `problem_id` coerced via `Number(problemId)` at top of effect, sent as int in `params.problem_id`.

**Deviations from plan:**
- None. All implementation notes in the plan followed exactly.

**Adjacent findings (not fixed):**
- The `candidateDisplay` in `SubmissionDetailPage` shows the raw `user_id` UUID rather than a resolved username. The plan only specifies "考生帳號" (account) in the header — not a resolved display name — so this matches the spec. If desired, a parallel `GET /users/{user_id}` could resolve it, but that's out of P7 scope.

**Blockers:** None.

### Verifier verdict

```
build:     pass (exit 0, 1699 modules, 413.74 kB bundle)
test:      pass (45/45, 7 files)
typecheck: skipped (JS-only project)
lint:      skipped (no lint step configured)
e2e:       skipped
```

React Router v7 future-flag warnings in test stderr are pre-existing advisory output — not failures.

**Verdict: green**

### Reviewer verdict

**Verdict: ship**

**Criteria scorecard**

1. Build exits 0 — pass (executor confirmed 1699 modules, exit 0; no independent re-run possible for unstaged diff, but build is gated by all imports resolving and the barrel export is correct)
2. Tests 100% green — pass (45/45; no new tests in P7 per plan — deferred to P9)
3. Golden path rendering — pass: all five UI sections present in order (頁首, 題目資訊, 提交資訊, 程式碼, 測資結果); `JudgeStatusBadge` used at `SubmissionDetailPage.jsx:222` and `SubmissionDetailPage.jsx:286`
4. `presigned_url === null` → "程式碼暫無法顯示" — pass: guard at line 104 sets `sourceUnavailable`; rendered at line 246
5. Empty submission list → "考生尚未提交此題", no further calls — pass: early return at line 85 after `setNotSubmitted(true)`; `GET /submissions/{id}` and S3 fetch are never reached
6. `GET /exams/{examId}` error → ErrorMessage + 返回 button — pass: outer `catch` at line 119 sets `error`; rendered at lines 139–150
7. S3 presigned_url fetched with plain `window.fetch()` — pass: `SubmissionDetailPage.jsx:111` uses `window.fetch(submissionData.presigned_url)` with the required comment; `api` is NOT used for the presigned URL
8. `problem_id` query param is a Number — pass: `Number(problemId)` at line 54; `params.problem_id: problemIdNum` at line 74
9. "查看提交" link on problem rows when not Draft — pass: `ExamDetailPage.jsx` diff adds `{!isDraft && <td>...<Link to=.../{problem.problem_id}>查看提交</Link>...`; gating is on `!isDraft`, same variable used everywhere else

**Must-fix issues**

None found. Every high-risk invariant is correctly implemented.

**Nice-to-have**

- `SubmissionDetailPage.jsx:170`: `candidateDisplay` falls back to `submission?.user_id ?? exam?.candidate_id ?? '—'` — both are raw UUIDs, not a username. The plan says "考生帳號 in header" and the executor's adjacent finding acknowledges this. A parallel `GET /api/v1/users/{candidateId}` after step 1 would resolve the username cheaply; P9 tests will need to account for this UUID display. This is a nice-to-have for P9, not a must-fix per the plan's wording.
- `SubmissionDetailPage.jsx:251–255`: the third branch of the source-code section (`sourceCode === null && !sourceUnavailable`) renders a `<LoadingSpinner>` that is only reachable during the brief window between `setSubmission` and `setSourceCode` within the same synchronous microtask batch. In practice this flicker is imperceptible; not a bug.

**Verification gaps**

- No Vitest tests in P7 — expected per plan (deferred to P9). The S3 footgun invariant (criterion 7) and the `problem_id`-as-Number invariant (criterion 8) are source-verified here but not yet mechanically enforced by a test; P9 must cover them.
- Route segment `exams/:examId/problems/:problemId` (App.jsx:76) is more specific than `exams/:id` (line 74) and `exams/:id/result` (line 75) — React Router v6 best-match algorithm resolves the longer static+param path correctly; no ambiguity risk.
- No browser/Playwright check required — all fetch patterns are established; the S3 plain-fetch invariant is source-verifiable and will be mechanically tested in P9.

### Supervisor note — fix applied before commit

Reviewer's nice-to-have #1 (`candidateDisplay` showed a raw `user_id`/`candidate_id`
UUID, not the account name) was **fixed before commit**. The HackMD spec explicitly
lists 「考生帳號」 as a field on this page — a UUID does not satisfy that. The fix is
small and well-scoped: `candidate_id` is already known after step 1, so a third
`GET /api/v1/users/{candidateId}` was added to the existing step-3 `Promise.all`
(with `.catch(() => ({ data: null }))` so a user-fetch failure degrades gracefully to
the UUID rather than failing the whole page). `candidateDisplay` now resolves to
`candidate?.username ?? exam?.candidate_id ?? '—'`. Build re-confirmed exit 0
(413.83 kB bundle); test re-confirmed 45/45 green after the fix.

Carry to P9: the `SubmissionDetailPage` test must mock `GET /api/v1/users/{id}` and
assert the header shows the resolved `username`, plus the fallback-to-UUID path when
that call rejects.

### Commit

`89cb707` — feat(frontend): P7 — candidate submission detail page

---

## P8 — Profile / change-password page  (2026-05-21T15:45:00Z)

### Files touched
- `frontend/src/pages/interviewer/ProfilePage.jsx` — **created**: two-section page; section 1 shows read-only `帳號` and `角色` (mapped via `ROLE_LABEL` to Chinese), and editable `姓名`; save calls `PATCH /api/v1/users/me` with `{ full_name }` only (no `username`, no `role`); section 2 has three password inputs (`oldPassword`, `newPassword`, `confirmPassword`); client-side validation: `new_password.length < 8` → "新密碼至少需要 8 個字元", mismatch → "新密碼與確認密碼不一致"; on success calls `PUT /api/v1/users/me/password` with `{ old_password, new_password }`, clears fields, shows "密碼已更新"; each section has its own `error`/`success` state; `GET /api/v1/users/me` on mount populates form.
- `frontend/src/pages/interviewer/index.js` — **modified**: added `ProfilePage` export.
- `frontend/src/App.jsx` — **modified**: added `ProfilePage` to barrel import; added `<Route path="profile" element={<ProfilePage />} />` under `/interviewer`.
- `frontend/src/layouts/StaffLayout.jsx` — **modified**: added `{ to: '/interviewer/profile', label: '個人資料' }` to `interviewer` array, `admin` array, and unknown-role fallback array.

### Commands run
- `npm run build` → exit 0 (1700 modules, 418.29 kB JS bundle)
- `npm run test` → 45/45 green (7 test files)

### Deviations from plan
- None. All plan items implemented exactly as specified.
- `ROLE_LABEL` map added on this page as directed by supervisor carry-note from P6 (profile page should render Chinese role labels; `CandidateDetailPage` was NOT retroactively modified per P8 scope boundary).

### Adjacent findings (not fixed)
- `CandidateDetailPage.jsx` still renders `candidate.role` as raw English enum — fixing it is out of P8 scope per the supervisor note. P9 may address it if time permits.

### Blockers
- None.

### Verifier verdict

```
build:     pass (exit 0, 1700 modules, 418.29 kB bundle)
test:      pass (45/45, 7 files)
typecheck: skipped (JS-only project)
lint:      skipped (no lint step configured)
e2e:       skipped
```

React Router v7 future-flag warnings in test stderr are pre-existing advisory output — not failures. Module count (+1 vs P7's 1699) and bundle size (+4.55 kB) are consistent with one new page file added.

**Verdict: green**

### Reviewer verdict

**Verdict: ship**

**Criteria scorecard**

1. Build exits 0 — pass (independently confirmed: exit 0, 1700 modules, 418.29 kB)
2. Tests 100% green — pass (independently confirmed: 45/45, 7 files, no regressions)
3. Profile edit golden path — pass: `GET /api/v1/users/me` called at `ProfilePage.jsx:36`; `full_name` pre-filled at line 38; `handleProfileSave` at line 48 updates local state on 200 at line 56–57; success message "個人資料已更新" at line 58.
4. Password change golden path — pass: `PUT /api/v1/users/me/password` at line 83; body is `{ old_password, new_password }` at lines 84–85 (field name is `old_password`, NOT `current_password`); fields cleared at lines 87–89; "密碼已更新" shown at line 90.
5. Password validation — pass: `newPassword.length < 8` blocked at line 72–75 with "新密碼至少需要 8 個字元"; mismatch blocked at line 76–79 with "新密碼與確認密碼不一致"; both return before `api.put`.
6. PATCH body contains ONLY `full_name` — pass: `ProfilePage.jsx:55` sends `{ full_name: fullName || null }`; no `username`, no `role` in the object literal. Comment at line 54 documents the reason.
7. Sidebar "個人資料" link — pass: `StaffLayout.jsx` adds `{ to: '/interviewer/profile', label: '個人資料' }` to `interviewer` (line 28), `admin` (line 34), and fallback (line 48) arrays. Route wired at `App.jsx:80`.
8. Two separate independent forms — pass: two distinct `<form>` elements with separate `onSubmit` handlers; `profileError`/`profileSuccess` and `pwError`/`pwSuccess` are completely independent state variables.

**Must-fix issues**

None found. All critical invariants verified by direct code inspection.

**Nice-to-have**

- `ProfilePage.jsx:55`: sends `full_name: fullName || null` — an empty string becomes `null` on save. This matches `CandidateFormPage`'s pattern and is likely intentional, but it means clearing the name field and saving PATCHes `null` (not `""`) to the backend. Fine per the `UserUpdate` schema's nullable `full_name`, but worth a comment for the P9 test author who will assert the exact body.
- No browser/Playwright check needed — the page is entirely standard React forms, no user-visible behavior regressed in any existing page.

**Verification gaps**

- No Vitest tests added in P8 — expected per plan (deferred to P9). The P9 test plan at `plan.md:563` already enumerates five test cases for `ProfilePage.test.jsx` including the exact-body assertion for PATCH and the PUT field-name check (`old_password` not `current_password`).

### Commit

`e082ba9` — feat(frontend): P8 — profile & change-password page
