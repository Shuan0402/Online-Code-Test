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
