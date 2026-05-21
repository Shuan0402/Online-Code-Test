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
