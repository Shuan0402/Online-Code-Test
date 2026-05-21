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
