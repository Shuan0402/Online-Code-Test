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
- **Committed P1 as `<SHA>`** on `feat/questioner-panel`.
