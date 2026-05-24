# Harness Plan — admin-panel

**Created**: 2026-05-21T09:00:00Z
**Branch**: feat/admin-panel (stacked on feat/interviewer-panel)
**Intent**: see `.harness/prompt.md`
**Planner**: harness-planner (claude-sonnet-4-6)

---

## Phase grouping strategy

8 page components + routing changes + tests are split into 6 phases. The scaffold (P1) wires
all 8 routes via a stub-barrel so App.jsx is only touched once. Each subsequent phase (P2–P6)
creates real page files and updates the barrel — App.jsx and StaffLayout are frozen after P1.
Tests are co-located with their phase so each phase is independently green-testable before the
next starts. This matches the interviewer-panel pattern.

---

## Phases

### P1 — Routing Scaffold + Layout Admin Nav Rewrite

**Goal**: Wire all 8 `/admin/*` routes in App.jsx, rewrite `NAV_BY_ROLE.admin` in
StaffLayout.jsx, and create the `pages/admin/index.js` barrel with 8 stub exports; delete
`AdminStubPage.jsx` and its import from App.jsx.

**Risk tier**: low
**Use full ReAct in executor**: no

**Files**:
- `frontend/src/App.jsx` — replace AdminStubPage stub routes with 8 proper nested routes
  importing all 8 named pages from `@/pages/admin`; remove AdminStubPage import
- `frontend/src/layouts/StaffLayout.jsx` — replace `NAV_BY_ROLE.admin` with 4 dedicated admin
  entries (儀表板 `/admin` with end=true, 成員管理 `/admin/members`, 考試管理 `/admin/exams`,
  題目管理 `/admin/problems`); add `end` prop support to SidebarLink so the dashboard NavLink
  does not stay active on sub-routes
- `frontend/src/pages/admin/index.js` — create barrel; export 8 stub components
  (`() => null`) with exact names: DashboardPage, MemberListPage, MemberCreatePage,
  MemberDetailPage, AdminExamListPage, AdminExamDetailPage, AdminProblemListPage,
  AdminProblemDetailPage
- `frontend/src/pages/stubs/AdminStubPage.jsx` — delete (no longer referenced)

**API calls introduced by this phase**: none (stubs render null)

**Acceptance criteria**:
- [ ] `cd frontend && npm run build` exits 0 with no new errors
- [ ] `cd frontend && npm run test` passes (judge by `Test Files ... passed` summary + exit
  code; ignore any ESM-teardown stack trace after a green summary — see L1)
- [ ] Navigating to `/admin` as an admin-role user renders `StaffLayout` sidebar with exactly
  4 entries: 儀表板 / 成員管理 / 考試管理 / 題目管理
- [ ] 儀表板 NavLink is not highlighted when on `/admin/members` (end prop correct)
- [ ] `/admin/*` routes no longer render the old "功能開發中" stub text

**Risk / rollback**: Low. P1 only rewires routing and nav — no API calls. If something breaks,
revert the 3 file changes; the stub was already there as a fallback pattern.

**Depends on**: —

---

### P2 — Member List + Member Create Pages + Tests

**Goal**: Build `MemberListPage` (all users table with role filter, delete-self guard, delete
confirm dialog) and `MemberCreatePage` (create form with role picker and validation), with
Vitest unit tests for their logic-dense pieces.

**Risk tier**: medium
**Use full ReAct in executor**: no

**Files**:
- `frontend/src/pages/admin/MemberListPage.jsx` — create; renders all users from
  `GET /api/v1/users/` in a table (姓名=`full_name??username`, 帳號=`username`,
  角色=`role`, 建立時間=`created_at`); client-side role filter via native `<select>`;
  delete button **disabled** for the row where `user.id === currentUser.id`
  (guard uses `useAuth()` → `user.id`); delete confirmation Dialog calls
  `DELETE /api/v1/users/{user.id}` (returns **200**, not 204); row click or 查看 button
  navigates to `/admin/members/{user.id}`; 新增成員 button navigates to `/admin/members/new`
- `frontend/src/pages/admin/MemberCreatePage.jsx` — create; form with fields: 帳號
  (username, required, 3–50 chars), 姓名 (full_name, optional, ≤100), 密碼 (password,
  required, ≥8 chars), 角色 (role, native `<select>`, options Admin/Candidate/Interviewer/
  Questioner, default Candidate); validates client-side before POST; calls
  `POST /api/v1/users/` with `{username, full_name: trim||null, password, role}`;
  on 201 navigates to `/admin/members/{res.data.id}`; on 400 "該帳號名稱已存在" shows
  inline error; back button → `/admin/members`
- `frontend/src/pages/admin/MemberListPage.test.jsx` — create; tests: (a) all 4 roles
  rendered from mixed response, (b) role filter "Admin" → only Admin rows visible,
  role filter "全部" → all rows, (c) delete button disabled for the row matching
  `useAuth().user.id` (delete-self guard), delete button enabled for other rows,
  (d) delete confirm → `DELETE /api/v1/users/{id}` called, row removed from state;
  mock `@/contexts/AuthContext` as `{ useAuth: vi.fn(() => ({ user: { id: 'admin-uuid' } })) }`
- `frontend/src/pages/admin/MemberCreatePage.test.jsx` — create; tests: (a) empty username →
  "請填寫帳號", POST not called, (b) username 2 chars → "帳號至少需要 3 個字元", POST not
  called, (c) password 7 chars → "密碼至少需要 8 個字元", POST not called, (d) success →
  POST body has `{username, full_name: null, password, role: 'Candidate'}` for default role,
  (e) 400 "該帳號名稱已存在" → inline error message shown
- `frontend/src/pages/admin/index.js` — update: replace MemberListPage and MemberCreatePage
  stub exports with real file imports

**API calls in this phase**:
| Page | Call | Field resolved |
|---|---|---|
| MemberListPage | `GET /api/v1/users/` | 姓名=`full_name??username`, 帳號=`username`, 角色=`role`, 建立時間=`created_at` |
| MemberListPage | `DELETE /api/v1/users/{id}` | returns **200** (not 204) — treat any 2xx as success |
| MemberCreatePage | `POST /api/v1/users/` | body: `{username, full_name, password, role}` |

**Acceptance criteria**:
- [ ] `cd frontend && npm run build` exits 0
- [ ] `cd frontend && npm run test` — `MemberListPage.test.jsx` and `MemberCreatePage.test.jsx`
  pass; all prior tests still pass; judge by summary + exit code
- [ ] Navigating to `/admin/members` shows a table with all users (4 role values visible in
  mixed dataset), role filter narrows rows client-side without a new fetch
- [ ] Delete button is visually disabled for the current admin user's own row
- [ ] Delete confirms via dialog; on success, row disappears; on 400 Ongoing-style error, dialog
  stays open with inline error
- [ ] Navigating to `/admin/members/new` shows create form; submitting valid data navigates to
  the new user's detail page

**Risk / rollback**: Medium. Delete call returns `200` not `204` — the axios interceptor
handles any 2xx as success, but confirm the `api.delete(...)` call does not `.then(r => r.data)`
in a way that throws on empty body. Pattern already established in Interviewer ExamListPage.

**Depends on**: P1

---

### P3 — Member Detail (User Info) Page + Tests

**Goal**: Build `MemberDetailPage` showing a user's profile with an inline edit form
(full_name + role) and a separate force-reset password section; Vitest tests for
edit validation and password-reset validation.

**Risk tier**: medium
**Use full ReAct in executor**: no

**Files**:
- `frontend/src/pages/admin/MemberDetailPage.jsx` — create; on mount fetches
  `GET /api/v1/users/{id}` (id is UUID from URL param); renders read-only fields:
  姓名 (full_name ?? '—'), 帳號 (username — immutable, read-only input or static text),
  角色 (role — shown as badge in read-only view), 密碼 (always rendered as `••••••••`
  — no password field in API); section 1 "編輯使用者資訊": form with editable full_name
  (text input) + role (native `<select>` with Admin/Candidate/Interviewer/Questioner
  options), calls `PATCH /api/v1/users/{id}` with `{full_name, role}` on submit;
  section 2 "修改密碼": single new_password field (≥8 chars), calls
  `PUT /api/v1/users/{id}/password-reset` with `{new_password}`; back button →
  `/admin/members`
- `frontend/src/pages/admin/MemberDetailPage.test.jsx` — create; tests: (a) page loads and
  displays `username` as read-only (calls `GET /api/v1/users/{id}`), (b) edit submit → PATCH
  body is `{full_name, role}` — no username field, (c) password < 8 → "密碼至少需要 8 個字元",
  PUT not called, (d) valid password → PUT `/api/v1/users/{id}/password-reset` called with
  `{new_password}`, (e) 404 on load → error message shown
- `frontend/src/pages/admin/index.js` — update: replace MemberDetailPage stub with real import

**API calls in this phase**:
| Call | Method | Body / Return | Notes |
|---|---|---|---|
| `GET /api/v1/users/{id}` | GET | `UserRead` | `id` is UUID from URL param |
| `PATCH /api/v1/users/{id}` | PATCH | `{full_name?, role?}` → `UserRead` | Admin-only; no `username` in body |
| `PUT /api/v1/users/{id}/password-reset` | PUT | `{new_password}` → `{detail}` | Admin force-reset; no old password; ≥8 chars |

**Acceptance criteria**:
- [ ] `cd frontend && npm run build` exits 0
- [ ] `cd frontend && npm run test` — `MemberDetailPage.test.jsx` passes; all prior tests pass
- [ ] Clicking a member row from MemberListPage opens the detail page with all fields populated
- [ ] 帳號 field is read-only (cannot be changed — username is immutable)
- [ ] 密碼 field renders exactly `••••••••` regardless of actual password
- [ ] Editing full_name and saving sends PATCH with `{full_name, role}` (not username)
- [ ] Password reset with < 8 chars shows inline error; does not call the API
- [ ] Successful password reset shows success message

**Risk / rollback**: Medium. `PATCH /users/{id}` is Admin-only and `PUT /users/{id}/password-reset`
is Admin-only — both are gated server-side. Incorrect body (e.g. including `username`) returns
a backend validation error; the form must not include username in the PATCH body.

**Depends on**: P1, P2

---

### P4 — Admin Exam List + Exam Detail Pages + Tests

**Goal**: Build `AdminExamListPage` (all exams table with 考生/狀態/分數 columns — 考生 via
an N+2 fan-out — status filter, delete action) and `AdminExamDetailPage` (read-only exam
inspection view with problem list and delete), with Vitest tests for the list page's
filter, candidate-name resolution, and delete flow.

**Risk tier**: medium
**Use full ReAct in executor**: no

**Files**:
- `frontend/src/pages/admin/AdminExamListPage.jsx` — create; on mount fetches
  `GET /api/v1/exams/` for the exam list, then does a **fan-out**: `Promise.all` of
  `GET /api/v1/exams/{id}` for every exam (each `ExamRead` carries `candidate_id`) **plus**
  `GET /api/v1/users/` to build a usersMap (`{[uuid]: full_name||username}`); table columns:
  考試名稱 (`title`), 考生 (`usersMap[candidate_id] ?? '—'` — must render the resolved name,
  NOT the raw UUID — see L2), 狀態 (`status` via `ExamStatusBadge`), 分數 (`score`,
  nullable → '—'); client-side status filter via native `<select>` (Draft/Published/
  Ongoing/Finished/Archived/全部); delete button per row opens confirm Dialog →
  `DELETE /api/v1/exams/{id}` (returns **204**); row click → `/admin/exams/{id}`; no 新增考試
  button (admin does not create exams). The fan-out is N+2 requests for N exams — accepted
  by the user (OQ-1 resolved) as fine at course-project scale.
- `frontend/src/pages/admin/AdminExamDetailPage.jsx` — create; on mount calls
  `Promise.all([GET /api/v1/exams/{id}, GET /api/v1/users/])` to fetch exam detail and
  build usersMap (`{[uuid]: full_name||username}`); renders read-only: title, status badge,
  duration, score (nullable → '—'), start_time, end_time, 應試者 resolved via
  `usersMap[exam.candidate_id]??exam.candidate_id`, easy_count/medium_count/hard_count;
  exam_problems table: 題號 (`sequence`), 題目名稱 (`title`), 難度 (`difficulty`), 配分
  (`points`); delete button → Dialog → `DELETE /api/v1/exams/{id}` → navigate to
  `/admin/exams` on success; back button → `/admin/exams`
- `frontend/src/pages/admin/AdminExamListPage.test.jsx` — create; tests: (a) status filter
  "Draft" → only Draft rows; "全部" → all rows, (b) 考生 column renders the resolved name
  (`full_name`/`username` from usersMap), NOT the raw `candidate_id` UUID; 分數 column:
  null → '—', numeric → displayed, (c) delete confirm → `DELETE /api/v1/exams/{id}` called
  (204), row removed from state, (d) delete 400 (Ongoing exam) → inline error, row stays.
  Mock `GET /exams/`, the per-exam `GET /exams/{id}` fan-out, and `GET /users/` accordingly
- `frontend/src/pages/admin/index.js` — update barrel: replace AdminExamListPage and
  AdminExamDetailPage stub exports with real imports

**API calls in this phase**:
| Page | Call | Field resolved | Notes |
|---|---|---|---|
| AdminExamListPage | `GET /api/v1/exams/` | 考試名稱=`title`, 狀態=`status`, 分數=`score` | Sparse list — no `candidate_id` |
| AdminExamListPage | `GET /api/v1/exams/{id}` ×N (fan-out) | `candidate_id` per exam | One per exam, run via `Promise.all` |
| AdminExamListPage | `GET /api/v1/users/` | usersMap → 考生 name | Resolves `candidate_id` UUID → display name |
| AdminExamListPage | `DELETE /api/v1/exams/{id}` | — | Returns **204**; Ongoing → 400 |
| AdminExamDetailPage | `GET /api/v1/exams/{id}` | all ExamRead fields incl. candidate_id, exam_problems[] | id is UUID |
| AdminExamDetailPage | `GET /api/v1/users/` | usersMap for 應試者 name resolution | Parallel with exam fetch |
| AdminExamDetailPage | `DELETE /api/v1/exams/{id}` | — | Returns **204** |

**Acceptance criteria**:
- [ ] `cd frontend && npm run build` exits 0
- [ ] `cd frontend && npm run test` — `AdminExamListPage.test.jsx` passes; all prior tests pass
- [ ] Exam list shows all exams with a 考生 column rendering the resolved candidate name
  (not the raw UUID); status filter narrows rows without a new fetch
- [ ] Delete of a non-Ongoing exam removes the row; delete of Ongoing exam shows error in dialog
- [ ] Exam detail page shows 應試者 name (resolved from usersMap), not raw UUID
- [ ] Exam detail page exam_problems table renders sequence/title/difficulty/points
- [ ] Exam detail delete navigates back to `/admin/exams` on success
- [ ] No edit controls on the detail page (admin is read-only oversight)

**Risk / rollback**: Medium. The `DELETE /exams/{id}` for `Finished` exams does a soft-archive
(not hard delete) — backend returns success, the row should be removed from the list. Ongoing
→ 400. Confirm the delete API path uses UUID (exam_id is UUID per backend contract).

**Depends on**: P1

---

### P5 — Admin Problem List + Problem Detail Pages + Tests

**Goal**: Build `AdminProblemListPage` (all problems table with difficulty filter, delete) and
`AdminProblemDetailPage` (read-only problem inspection with test-case list); Vitest tests for
the list page's filter and delete logic.

**Risk tier**: low
**Use full ReAct in executor**: no

**Files**:
- `frontend/src/pages/admin/AdminProblemListPage.jsx` — create; fetches
  `GET /api/v1/problems/` returning `ProblemShortRead[]` (`{id (int), title, difficulty}`);
  table columns: 題目名稱 (`title`), 難度 (`difficulty` — display as colored badge using same
  DIFFICULTY_COLORS/DIFFICULTY_LABELS constants as Questioner panel); client-side difficulty
  filter via native `<select>` (Easy/Medium/Hard/全部); delete button per row → Dialog →
  `DELETE /api/v1/problems/{id}` (returns **204**, id is int); row click →
  `/admin/problems/{id}`; no 新增題目 button, no rejudge button (admin oversight only)
- `frontend/src/pages/admin/AdminProblemDetailPage.jsx` — create; on mount fetches
  `GET /api/v1/problems/{id}` (id is int from URL param); renders all ProblemRead fields
  read-only: title, description (pre-wrapped text), difficulty, time_limit (ms), memory_limit
  (MB), creator_id (UUID — displayed as-is), created_at; test_cases table: input_data,
  expected_output, score_weight, is_sample (boolean); no edit controls, no rejudge button;
  back button → `/admin/problems`
- `frontend/src/pages/admin/AdminProblemListPage.test.jsx` — create; tests: (a) difficulty
  filter "Easy" → only Easy rows; "全部" → all rows; filter is case-sensitive match against
  `DifficultyLevel` enum (capitalized: `Easy|Medium|Hard`), (b) delete confirm →
  `DELETE /api/v1/problems/{id}` called (204), row removed; mock `api.delete` resolves
  with `{status: 204, data: ''}`, (c) delete error → inline error, row stays
- `frontend/src/pages/admin/index.js` — update barrel: replace AdminProblemListPage and
  AdminProblemDetailPage stubs with real imports

**API calls in this phase**:
| Page | Call | Field resolved | Notes |
|---|---|---|---|
| AdminProblemListPage | `GET /api/v1/problems/` | title (`title`), 難度 (`difficulty`) | Returns `ProblemShortRead[]` |
| AdminProblemListPage | `DELETE /api/v1/problems/{id}` | — | Returns **204**; id is **int** |
| AdminProblemDetailPage | `GET /api/v1/problems/{id}` | all ProblemRead fields + test_cases[] | id is **int** |

**Acceptance criteria**:
- [ ] `cd frontend && npm run build` exits 0
- [ ] `cd frontend && npm run test` — `AdminProblemListPage.test.jsx` passes; all prior pass
- [ ] Problem list shows all problems; difficulty filter narrows rows client-side
- [ ] Delete confirms via dialog; on success row removed; on error dialog stays with inline error
- [ ] Problem detail shows title, description, difficulty, limits, test_cases table
- [ ] No edit controls on the detail page

**Risk / rollback**: Low. Only read + delete operations. Problem id is int (not UUID) — the
executor must use `problem_id` as an integer in the URL path (no UUID format). `DELETE /problems/{id}`
returns 204 (differs from user DELETE's 200 — confirm `api.delete` does not error on empty body).

**Depends on**: P1

---

### P6 — Dashboard Page + Dashboard Tests

**Goal**: Build `DashboardPage` with client-side aggregated statistics cards (exam counts by
status, submission verdict breakdown, member counts by role), a conditional Grafana link button,
and Vitest unit tests covering the aggregation logic and env-var visibility.

**Risk tier**: medium
**Use full ReAct in executor**: no

**Files**:
- `frontend/src/pages/admin/DashboardPage.jsx` — create; on mount fires
  `Promise.all([GET /api/v1/exams/, GET /api/v1/submissions/, GET /api/v1/users/])`;
  renders stat cards: 考試總數 + breakdown by `ExamStatus` (Draft/Published/Ongoing/Finished/
  Archived); 提交總數 + breakdown by `JudgeStatus` verdict (Pending/Judging/AC/WA/TLE/MLE/RE/CE)
  using counts from `SubmissionRead.status`; 成員總數 + breakdown by `UserRole`
  (Admin/Candidate/Interviewer/Questioner); Grafana link button reads
  `import.meta.env.VITE_GRAFANA_URL` — renders an `<a target="_blank">` button only when
  the value is a non-empty string; uses `Card` components from `@/components/ui/card`;
  loading handled with `LoadingSpinner`; error per-section with `ErrorMessage`
- `frontend/src/pages/admin/DashboardPage.test.jsx` — create; aggregation logic tests:
  (a) exam count: mock `GET /exams/` returns 3 exams (2 Draft, 1 Ongoing) → total "3",
  Draft card "2", Ongoing card "1"; (b) submission verdict: mock returns 5 submissions
  (3 AC, 2 WA) → AC count "3", WA count "2", total "5"; (c) member role breakdown: mock
  returns 4 users (2 Admin, 1 Candidate, 1 Interviewer) → correct counts per role;
  (d) Grafana button visible when `vi.stubEnv('VITE_GRAFANA_URL', 'http://grafana:3000')`,
  href equals the env value; (e) Grafana button absent when
  `vi.stubEnv('VITE_GRAFANA_URL', '')` or env var unset
- `frontend/src/pages/admin/index.js` — update barrel: replace DashboardPage stub with real
  import
- `frontend/.env.example` — create (or append); document `VITE_GRAFANA_URL=` with one-line
  comment explaining it enables the Grafana link button on the admin dashboard

**API calls in this phase**:
| Call | Field used | Notes |
|---|---|---|
| `GET /api/v1/exams/` | `status` (ExamStatus enum) for count breakdown | Returns CandidateExamListRead[] |
| `GET /api/v1/submissions/` | `status` (JudgeStatus enum) for verdict breakdown | Global read for Admin; may be large — no pagination in scope |
| `GET /api/v1/users/` | `role` (UserRole enum) for member count breakdown | Returns all users |

**Acceptance criteria**:
- [ ] `cd frontend && npm run build` exits 0
- [ ] `cd frontend && npm run test` — `DashboardPage.test.jsx` aggregation tests all pass;
  all prior tests pass; judge by summary + exit code (not stack trace — see L1)
- [ ] Navigating to `/admin` shows stat cards with correct totals derived from mock/live data
- [ ] Grafana button renders and links to `VITE_GRAFANA_URL` when the env var is set;
  button is absent from the DOM when unset or empty
- [ ] Dashboard renders without crash when any of the 3 API calls returns an empty array

**Risk / rollback**: Medium. `GET /submissions/` with no `limit` param returns all submissions —
could be slow if many exist. For a course project this is acceptable; document with a code comment
that a `limit` query param could be added if performance becomes an issue. No rollback complexity.

**Depends on**: P1 (routing), optionally P2–P5 (nav links to other pages)

---

## Whole-plan acceptance

- [ ] All 6 phase acceptance criteria pass in order
- [ ] `cd frontend && npm run build` exits 0 on the final commit
- [ ] `cd frontend && npm run test` reports 100% green; judge by `Test Files ... passed` summary
  line + exit code; ignore any ESM-teardown stack trace that appears after a green summary (L1)
- [ ] `StaffLayout` admin sidebar shows exactly: 儀表板 / 成員管理 / 考試管理 / 題目管理
- [ ] 儀表板 link does not stay highlighted when navigating to sub-pages (end prop correct)
- [ ] `AdminStubPage.jsx` is deleted; no dead import in App.jsx
- [ ] Manual smoke: Admin user can navigate all 8 routes, all pages render without error or blank
- [ ] PR base = `feat/interviewer-panel` (user merges — never `gh pr merge`)

---

## Not doing (and why)

- **System metrics (CPU/memory/queue backlog)** — no backend API exists; per user direction,
  these belong in Grafana surfaced via the link button, not in the frontend
- **Anomaly submission feed / detail drawer** — `GET /admin/dashboard/anomalies` does not exist
  and `SubmissionRead` has no source-IP field; descoped with user at intake
- **Admin "new exam" / "new problem" creation** — admin oversight only; creation remains with
  Interviewer and Questioner panels
- **Reusing Questioner/Interviewer pages** — user explicitly chose dedicated `/admin/*` pages;
  the admin pages are purpose-built oversight views
- **`POST /admin/dashboard/summary`** — endpoint does not exist; dashboard is client-side
  aggregation from existing list APIs
- **Pagination on submissions** — `GET /submissions/` returns all; acceptable for course project
  scale; adding `?limit=` is a future improvement documented with a code comment

---

## Open questions for supervisor

- **OQ-1 — RESOLVED 2026-05-21** (user chose option b): the AdminExamListPage **includes**
  the 考生 column via the N+2 fan-out (`GET /exams/` → `Promise.all` of `GET /exams/{id}`
  + `GET /users/`). P4 above has been updated to specify the fan-out, the 考生/分數 columns,
  the API table, the test, and the acceptance criteria. No remaining open questions.

---

## Prior lessons consulted

- **`63ed45b` L1 (interviewer-panel)**: Node 22 can print a fatal ESM-teardown stack trace
  AFTER a green Vitest run; process still exits 0. Every phase's acceptance criteria here says
  "judge by the `Test Files ... passed` summary line + exit code, not by the presence of a
  stack trace."
- **`63ed45b` L2 (interviewer-panel)**: Citing a spec field by its Chinese display name can
  be satisfied with wrong data (UUID where username was expected). Every phase's API table above
  maps each column label to its exact API field name (e.g. 帳號 = `username`, 應試者 resolved
  via `usersMap[exam.candidate_id]`, 難度 = `difficulty` enum capitalized).
- **questioner-panel (`f0472e9`)**: Re-deriving the backend contract from live source before
  planning eliminated mid-phase API corrections. This plan uses the contract re-derived in
  `prompt.md` (verified 2026-05-21 from live `backend/` source) as authoritative throughout.
