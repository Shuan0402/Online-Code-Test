# Harness Plan — frontend-scaffold-and-panels

**Created**: 2026-05-16
**Branch**: feat/frontend-scaffold
**Intent**: see `.harness/prompt.md`
**Planner**: harness-planner (Sonnet)

---

## Critical pre-reading for all executors

The backend currently lacks several endpoints the frontend needs. Before any phase that calls the API runs in a browser, the backend team must ship:
- `GET /api/v1/users/me` (does not exist — user.py only has `POST /` and `GET /`)
- `GET /api/v1/exams` (no exam router registered at all)
- `POST /api/v1/exams/{id}/start`
- `POST /api/v1/exams/{id}/submit`
- `GET /api/v1/exams/{id}/result`
- `POST /api/v1/submissions`
- `GET /api/v1/submissions/{id}`
- `GET /api/v1/submissions/latest?problem_id=X`

Phases P1–P2 can be built without a running backend. P3 requires `POST /auth/login` + `GET /users/me`. P4–P5 require the exam and submission endpoints. The plan notes this as a hard dependency at each phase.

The Vite proxy config will target `http://localhost:8000`; all API paths in the frontend use `/api/v1/...`.

---

## Phases

### P1 — Scaffold: Vite + React + Tailwind + shadcn/ui + Routing skeleton

**Goal**: Bootstrap `frontend/` with all tooling installed and a navigable shell that renders each role's layout with stub content, so every subsequent phase has a runnable base to build on.

**Risk tier**: low
**Use full ReAct in executor**: no

**Files**:
- `frontend/` (new directory) — root of the SPA
- `frontend/package.json` — Vite + React (no TS), react-router-dom v6, axios, @monaco-editor/react, tailwindcss, shadcn/ui dependencies
- `frontend/vite.config.js` — Vite config; proxy `/api` → `http://localhost:8000`
- `frontend/index.html` — Vite entry HTML
- `frontend/tailwind.config.js` — Tailwind content paths
- `frontend/postcss.config.js` — PostCSS for Tailwind
- `frontend/src/main.jsx` — React root, `<BrowserRouter>` wrapping `<App />`
- `frontend/src/App.jsx` — top-level `<Routes>` with all route paths declared (most render stubs)
- `frontend/src/layouts/CandidateLayout.jsx` — top-header-only shell (no sidebar); renders `<Outlet />`
- `frontend/src/layouts/StaffLayout.jsx` — sidebar + header shell for Questioner/Interviewer/Admin; renders `<Outlet />`
- `frontend/src/pages/NotFoundPage.jsx` — 404 catch-all
- `frontend/src/pages/stubs/QuestioerStubPage.jsx` — "功能開發中" placeholder
- `frontend/src/pages/stubs/InterviewerStubPage.jsx` — "功能開發中" placeholder
- `frontend/src/pages/stubs/AdminStubPage.jsx` — "功能開發中" placeholder
- `frontend/components.json` — shadcn/ui config file

**Acceptance criteria**:
- [ ] `cd frontend && npm install` completes with no unresolved peer-dep errors (warnings are acceptable)
- [ ] `cd frontend && npm run build` exits 0 (Vite build passes)
- [ ] `cd frontend && npm run dev` starts; opening `http://localhost:5173` in a browser shows a page (not a blank error screen)
- [ ] Navigating to `/candidate/exams` in the browser renders the CandidateLayout shell (top header visible, no sidebar)
- [ ] Navigating to `/questioner` renders the StaffLayout shell (sidebar visible)
- [ ] Navigating to `/nonexistent` renders the 404 page
- [ ] No console errors about missing React Router routes

**Risk / rollback**: Pure file creation, no existing files touched. Rollback = delete `frontend/`. Low risk.

**Depends on**: —

---

### P2 — Auth layer: Login page, axios interceptors, JWT context, protected routes

**Goal**: Implement the login page (form-urlencoded POST), JWT storage, axios Bearer interceptor, and role-based route protection so that unauthenticated users are redirected to `/login` and authenticated users land on their role-appropriate panel.

**Risk tier**: low
**Use full ReAct in executor**: no

**Files**:
- `frontend/src/contexts/AuthContext.jsx` — React Context holding `{ user, token, login, logout }`; reads/writes `localStorage`; on mount calls `GET /api/v1/users/me` to rehydrate session
- `frontend/src/lib/api.js` — axios instance with `baseURL` = `''` (relies on Vite proxy), request interceptor attaching `Authorization: Bearer <token>`, response interceptor catching 401 → clear localStorage → redirect to `/login`
- `frontend/src/pages/LoginPage.jsx` — form with username/password fields; submits as `application/x-www-form-urlencoded` using `URLSearchParams` to `POST /api/v1/auth/login`; on success stores token, calls `GET /api/v1/users/me`, redirects by role
- `frontend/src/components/ProtectedRoute.jsx` — wrapper that checks auth context; unauthenticated → `<Navigate to="/login" />`; wrong role → `<Navigate to="/unauthorized" />`
- `frontend/src/pages/UnauthorizedPage.jsx` — "權限不足" stub page
- `frontend/src/App.jsx` — updated: wrap all non-login routes in `<ProtectedRoute>`; add `/login` route; wrap entire tree in `<AuthProvider>`

**Acceptance criteria**:
- [ ] `cd frontend && npm run build` exits 0
- [ ] Navigating to `http://localhost:5173/candidate/exams` without a token redirects to `/login`
- [ ] Login form submits with `Content-Type: application/x-www-form-urlencoded` (verify in browser Network tab — body must be `username=...&password=...`, NOT JSON)
- [ ] Successful login with a Candidate-role seed account redirects to `/candidate/exams`
- [ ] After login, refreshing the page keeps the user logged in (token rehydrated from localStorage, `GET /users/me` succeeds)
- [ ] Clicking logout calls `POST /api/v1/auth/logout` then clears localStorage and redirects to `/login`
- [ ] A Questioner-role user who navigates to `/candidate/exams` is redirected to `/unauthorized`
- [ ] 401 response from any API call (e.g., expired token) clears localStorage and redirects to `/login`

**Risk / rollback**: The `Content-Type: application/x-www-form-urlencoded` requirement is the single most common pitfall — the executor must use `URLSearchParams`, not a plain object. If login fails with 422, the body encoding is wrong. Rollback = revert changes to `App.jsx` + delete new files.

**Depends on**: P1. Also requires `POST /api/v1/auth/login` and `GET /api/v1/users/me` to be live on the backend for browser testing. Build-only acceptance criteria (first bullet) do not require a running backend.

---

### P3 — Candidate panel: Exam list + Start exam confirmation modal

**Goal**: Build the exam list page (`/candidate/exams`) that fetches and displays the candidate's assigned exams, and the start-exam confirmation modal that calls `POST /api/v1/exams/{id}/start` and navigates to the take-exam page.

**Risk tier**: low
**Use full ReAct in executor**: no

**Files**:
- `frontend/src/pages/candidate/ExamListPage.jsx` — fetches `GET /api/v1/exams` (candidate sees only their assigned exams per backend filtering); renders a list/table of exams with title, status (Draft/Published/Ongoing/Finished/Archived), duration, score; only Published or Ongoing exams show a "開始作答" button
- `frontend/src/pages/candidate/ExamListPage.jsx` — inline confirmation modal (shadcn/ui `<Dialog>`): "確認開始考試？開始後計時將立即開始" with Confirm/Cancel; Confirm calls `POST /api/v1/exams/{id}/start` then navigates to `/candidate/exams/{id}/take`
- `frontend/src/components/ExamStatusBadge.jsx` — small component mapping ExamStatus enum → colored badge (Draft=灰, Published=藍, Ongoing=綠, Finished=橙, Archived=暗)

**Acceptance criteria**:
- [ ] `cd frontend && npm run build` exits 0
- [ ] `/candidate/exams` renders a list (or "目前沒有考試" empty state) when logged in as a Candidate
- [ ] Each exam row shows: title, status badge, duration in minutes, score (if finished)
- [ ] Exams with status Draft or Archived do not show the "開始作答" button
- [ ] Clicking "開始作答" on a Published exam opens the confirmation dialog — page does not immediately navigate
- [ ] Clicking "取消" in the dialog closes it without navigation
- [ ] Clicking "確認開始" calls `POST /api/v1/exams/{id}/start` and on 200 navigates to `/candidate/exams/{id}/take`
- [ ] Network error on start (5xx) shows an inline error message in the dialog ("無法開始考試，請稍後再試")

**Risk / rollback**: Depends on `GET /api/v1/exams` and `POST /api/v1/exams/{id}/start` being live. If those endpoints are not yet shipped by the backend team, the build criterion still passes but browser testing is blocked. Rollback = delete/revert the two new page files and ExamStatusBadge.

**Depends on**: P1, P2. Backend endpoints: `GET /api/v1/exams`, `POST /api/v1/exams/{id}/start`.

---

### P4 — Candidate panel: Take-exam page (Monaco + timer + draft + submit)

**Goal**: Implement the full take-exam experience — problem navigation, Monaco editor with localStorage draft, exam-wide countdown timer (auto-submit on zero), per-problem submit button, and the finalize-exam modal.

**Risk tier**: high
**Use full ReAct in executor**: yes

**Files**:
- `frontend/src/pages/candidate/TakeExamPage.jsx` — main page component; fetches exam details on mount (problem list from `exam_problems`); renders problem tab list, Monaco editor, timer, submit button
- `frontend/src/components/ExamTimer.jsx` — countdown component; receives `endTime` (ISO string); ticks every second; when reaches zero calls `onTimeout()` prop which triggers auto-submit; displays MM:SS; turns red at < 5 minutes
- `frontend/src/components/ProblemPanel.jsx` — left pane: problem title, description (from `GET /api/v1/problems/{id}`), difficulty badge, points; only sample test cases shown (backend already filters for Candidate role)
- `frontend/src/components/EditorPanel.jsx` — Monaco Editor wrapper; language selector (python / cpp); saves code to localStorage key `draft:exam:{examId}:problem:{problemId}` debounced 1 second; loads draft on mount; calls `onSubmit(code, language)` prop
- `frontend/src/hooks/useAdaptivePolling.js` — custom hook; takes `submissionId` and `onResult` callback; polls `GET /api/v1/submissions/{id}` with delays `[300, 500, 1000, 2000, 3000, 5000, 5000, 5000, 10000]` ms (cycling on last value); stops when status is not Pending/Judging; NOTE: add comment explaining why adaptive (saves ~70% requests vs fixed 1s)
- `frontend/src/hooks/useOfflineRecovery.js` — custom hook; on mount, for each problem in the exam checks localStorage `pending:{problemId}`; if found, resumes polling that submission via `useAdaptivePolling`; on cold restart after refresh also calls `GET /api/v1/submissions/latest?problem_id={id}` if no pending key found but exam was Ongoing
- `frontend/src/pages/candidate/TakeExamPage.jsx` — also handles: per-problem submission (calls `POST /api/v1/submissions` with `{ exam_id, problem_id, source_code, language }`; writes `localStorage.setItem('pending:{problemId}', JSON.stringify({ submissionId, ts }))`); polls result via `useAdaptivePolling`; clears pending key on terminal status; shows per-problem status chip (Pending/Judging/AC/WA/TLE/MLE/RE/CE)
- `frontend/src/pages/candidate/FinalizeModal.jsx` — modal triggered by "交卷" button or auto-timeout; shows per-problem status summary; confirm calls `POST /api/v1/exams/{id}/submit`; on 200 navigates to `/candidate/exams/{id}/result`; button disabled if any problem still Pending/Judging (with tooltip "請等待判題完成")

**Acceptance criteria**:
- [ ] `cd frontend && npm run build` exits 0
- [ ] Navigating to `/candidate/exams/{id}/take` (after start) renders the exam page with: timer counting down, problem list tabs, Monaco editor
- [ ] Switching between problem tabs saves current code to localStorage and loads the draft for the new tab — verified by: type code, switch tab, switch back, code reappears
- [ ] Refreshing the page mid-exam: timer restores from `exam.end_time` (not reset to full duration), code drafts reload from localStorage
- [ ] Submitting a problem calls `POST /api/v1/submissions` with JSON body containing `exam_id`, `problem_id`, `source_code`, `language` — verify in Network tab
- [ ] After submission, status chip shows "Pending" then transitions through "Judging" to terminal status (AC/WA/etc.) within polling cycles — no manual refresh needed
- [ ] `localStorage.getItem('pending:{problemId}')` contains `{ submissionId, ts }` immediately after submit, and is cleared when terminal status is received
- [ ] Cold-restart simulation: submit a problem, close the tab, reopen `/candidate/exams/{id}/take` — the in-flight submission is re-polled and result displayed without re-submitting
- [ ] Timer reaching zero triggers the finalize modal automatically ("考試時間到，系統將自動交卷")
- [ ] "交卷" button is disabled (greyed out) while any problem shows Pending or Judging; hovering shows tooltip
- [ ] Clicking "確認交卷" calls `POST /api/v1/exams/{id}/submit` and navigates to `/candidate/exams/{id}/result`

**Risk / rollback**: This is the most complex page: Monaco, adaptive polling, localStorage draft, offline recovery, and timer all interact. Full ReAct is required. Potential trap: Monaco bundle size (~4 MB) can cause slow first load — use `@monaco-editor/react`'s built-in lazy loading (no extra config needed). Adaptive polling delay array must be defined as a module-level constant, not recreated on each render, to avoid `useEffect` dependency issues. Rollback: the TakeExamPage is a self-contained route; reverting it leaves P1–P3 intact.

**Depends on**: P1, P2, P3. Backend endpoints: `POST /api/v1/submissions`, `GET /api/v1/submissions/{id}`, `GET /api/v1/submissions/latest?problem_id=X`, `GET /api/v1/problems/{id}`.

---

### P4.5 — Test harness: Vitest + core hook/logic unit tests

**Goal**: Stand up a Vitest test environment in `frontend/` and write focused unit tests for the logic-heavy pieces of P4 — adaptive polling, the exam timer, the localStorage draft flush, and offline recovery — so the highest-risk phase has a regression net before P5 polish lands.

**Risk tier**: low
**Use full ReAct in executor**: no

**Inserted**: 2026-05-20, at user request, after P4 commit and before P5. Rationale: P4 is the most logic-dense phase (timer, adaptive polling, draft persistence, offline recovery are all pure-ish logic in custom hooks) and had 3 must-fix defects on first review — exactly the class of bug a unit test catches cheaply.

**Files**:
- `frontend/package.json` — add `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom` to devDependencies; add `"test": "vitest run"` and `"test:watch": "vitest"` scripts
- `frontend/vite.config.js` — add a `test` block (`environment: 'jsdom'`, `globals: true`, `setupFiles`)
- `frontend/src/test/setup.js` — test setup: import `@testing-library/jest-dom`, reset `localStorage` between tests
- `frontend/src/hooks/useAdaptivePolling.test.js` — delay array is consumed in order then cycles on the last value; polling stops on terminal status (AC/WA/etc.); polling stops + interval cleared on unmount; `onResult` fired with the terminal submission
- `frontend/src/components/ExamTimer.test.jsx` — counts down from `initialSeconds`; display formats MM:SS; warning style applies under 5 min; `onTimeout` fires exactly once at zero; only one interval is live (no churn)
- `frontend/src/components/EditorPanel.test.jsx` — `flushDraft()` synchronously writes current code to the correct `draft:exam:{examId}:problem:{problemId}` key; debounced write lands after 1s; switching `problemId` reloads the draft for the new key
- `frontend/src/hooks/useOfflineRecovery.test.js` — a `pending:{problemId}` localStorage key triggers re-polling on mount; cold restart with no pending key falls back to `GET /submissions/latest`

**Acceptance criteria**:
- [ ] `cd frontend && npm install` completes (new devDeps resolve)
- [ ] `cd frontend && npm run test` runs Vitest and exits 0 with all tests passing
- [ ] `cd frontend && npm run build` still exits 0 (test deps/config do not break the production build)
- [ ] The 4 target modules each have at least one meaningful assertion (not just a smoke "renders" test)
- [ ] `@/lib/api` is mocked in hook tests (`vi.mock`) — tests do not make real network calls
- [ ] Fake timers (`vi.useFakeTimers()`) used for timer + polling + debounce tests
- [ ] No TypeScript files introduced; tests are `.js` / `.jsx`

**Risk / rollback**: Purely additive — new dev dependencies, config, and test files; no production source touched (except possibly tiny testability tweaks, which must be called out as deviations). Rollback = revert `package.json`/`vite.config.js` and delete `src/test/` + `*.test.*` files. Main trap: Monaco does not render in jsdom — `EditorPanel.test.jsx` must mock `@monaco-editor/react` with a lightweight stub so the test exercises the draft logic, not the editor.

**Depends on**: P4. No backend dependency — all tests run offline with mocks.

---

### P5 — Candidate panel: Result page + polish

**Goal**: Implement the post-exam result page showing per-problem scores and overall exam score, and apply final polish (loading spinners, error boundaries, empty states) across the Candidate panel.

**Risk tier**: low
**Use full ReAct in executor**: no

**Files**:
- `frontend/src/pages/candidate/ResultPage.jsx` — fetches `GET /api/v1/exams/{id}/result`; renders exam title, total score, per-problem breakdown table (problem title, points, status badge, execution time); "返回考試列表" button navigates to `/candidate/exams`
- `frontend/src/components/LoadingSpinner.jsx` — simple Tailwind spinner for async states
- `frontend/src/components/ErrorMessage.jsx` — reusable error card with message + optional retry button
- `frontend/src/pages/candidate/ExamListPage.jsx` — updated: add loading state (spinner while fetching), error state (ErrorMessage + retry), and "目前沒有考試" empty state illustration/text
- `frontend/src/pages/candidate/TakeExamPage.jsx` — updated: wrap problem panel in error boundary for fetch failures; show spinner while `GET /api/v1/problems/{id}` loads

**Acceptance criteria**:
- [ ] `cd frontend && npm run build` exits 0
- [ ] Navigating to `/candidate/exams/{id}/result` after submitting shows: exam title, total score (integer), table with one row per problem showing status badge and points earned
- [ ] "返回考試列表" navigates back to `/candidate/exams`
- [ ] `/candidate/exams` shows a spinner while loading, then the exam list (or "目前沒有考試" if empty)
- [ ] Simulating a network error on `GET /api/v1/exams` (e.g., backend offline) shows an error card with a "重試" button; clicking retry re-fetches
- [ ] No console errors or unhandled promise rejections in the browser during normal Candidate golden-path flow

**Risk / rollback**: Additive only — new files plus small updates to existing pages. Rollback = revert the two page updates and delete new files.

**Depends on**: P1, P2, P3, P4. Backend endpoint: `GET /api/v1/exams/{id}/result`.

---

## Whole-plan acceptance

- [ ] All phase criteria pass in order P1 → P5
- [ ] `cd frontend && npm run build` exits 0 from a clean `node_modules` (i.e., `rm -rf node_modules && npm install && npm run build`)
- [ ] Golden path end-to-end (requires backend running with seed data):
  1. `cd frontend && npm run dev`, open `http://localhost:5173`
  2. Redirected to `/login`; log in as Candidate seed account
  3. Land on `/candidate/exams`; see at least one Published exam
  4. Start exam → take-exam page loads with timer and Monaco editor
  5. Write code, submit one problem → status transitions Pending → Judging → AC/WA
  6. Refresh page → code draft restored, in-flight submission re-polled
  7. Click "交卷" → result page shows per-problem scores
  8. Navigate back to exam list
- [ ] Other panel routes (`/questioner`, `/interviewer`, `/admin`) are accessible to the correct roles and show stub content — not 404 or blank

## Not doing (and why)

- **Questioner / Interviewer / Admin full panels** — deferred to later loops per prompt scope boundary; only stubs are created in P1
- **Backend exam/submission endpoints** — this plan is frontend-only; the plan calls out which backend endpoints must be live but does not implement them (backend team's responsibility)
- **docker-compose integration for frontend** — out of scope this loop per prompt
- **Refresh token flow** — out of scope per prompt; localStorage single-token is acceptable for this academic project
- **WebSocket / SSE upgrade for polling** — deferred; adaptive HTTP polling is the step-8 strategy
- **i18n layer** — UI is in 純中文 directly in JSX strings; no i18n library
- **MSW (Mock Service Worker)** — not added; executors should note that P3–P5 browser testing requires backend endpoints to be live. If they are not available, the build criterion is still testable but browser acceptance criteria are blocked
- **TypeScript** — explicitly locked out by prompt
- **TanStack Query** — explicitly locked out by prompt; use plain `useEffect` + `axios` with manual loading/error state

## Open questions for supervisor

1. **Backend endpoint availability**: `GET /api/v1/users/me`, all `/api/v1/exams/*`, `POST /api/v1/submissions`, `GET /api/v1/submissions/{id}`, and `GET /api/v1/submissions/latest?problem_id=X` do not exist on `main` today. Which backend team member is shipping these, and what is the ETA relative to P2–P5 dispatch? **Resolve before dispatching P3.**

2. **Exam result endpoint contract**: The prompt lists `GET /exams/:id/result` but no schema is defined in the backend schemas. Does it return the `ExamRead` schema (which has `score` and `exam_problems` with per-problem data), or a new `ExamResultRead` schema? The executor for P5 needs to know the response shape. **Resolve before dispatching P5.**

3. **Language list for Monaco**: The prompt's tech stack says Monaco but does not specify which languages the backend judge supports. From the worker code, `python` and `cpp` appear to be the two options. Confirm the exact language string values (`"python"`, `"cpp"`) that `POST /api/v1/submissions` expects in the `language` field. **Resolve before dispatching P4.**

4. **Seed account credentials**: What username/password can the executor use to test login as a Candidate in browser-based acceptance criteria for P2–P5? **Resolve before dispatching P2.**

## Prior lessons consulted

None — this is the first harness run for this repo (`git log --all --oneline -- .harness/lessons.md` returns empty).
