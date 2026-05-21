# Loop Prompt — admin-panel

**Loop started**: 2026-05-21T08:30:16Z
**Branch**: feat/admin-panel (stacked on feat/interviewer-panel)
**Supervisor**: Opus 4.7

## Original intent

Build the **Admin (管理員) panel** for the Online Code Test frontend SPA — the final
panel of the panel-by-panel build (Candidate ✓ → Questioner ✓ → Interviewer ✓ → **Admin**).
The Admin panel gives a system administrator cross-cutting oversight: a statistics
dashboard, full member-account management (create / inspect / edit / delete users of any
role), and management views over all exams and all problems with delete + filter.

## Scope boundary

Scope was reconciled with the user against the HackMD panel spec
(https://hackmd.io/@st980155/rJvy4aORWg) **and** the live `backend/` source **before**
planning. The spec lists 5 Admin pages; one (the Dashboard) depends on backend endpoints
that do not exist. The resolved scope below is final — do not re-expand it without asking.

- **In scope** — 5 dedicated `/admin/*` page areas, all newly built (the user explicitly
  chose dedicated Admin pages over reusing the Questioner/Interviewer pages):

  1. **儀表板 Dashboard** (`/admin`) — business statistic cards computed **client-side**
     from existing APIs: exam counts (total + by `ExamStatus`), submission counts (total +
     by `JudgeStatus` verdict), member counts (total + by `UserRole`). Plus a **「系統監控
     (Grafana)」 link button** that opens an external Grafana URL in a new tab; the URL
     comes from a Vite env var (`VITE_GRAFANA_URL`) and the button is **hidden when the
     var is unset/empty**. A compact "recent submissions" table is acceptable but optional.
  2. **成員管理 Member Management** (`/admin/members`) — table of all users (姓名 / 帳號 /
     建立時間), a **role filter** (client-side), a **新增成員** button → create form, a
     **刪除成員** action per row, and row click → User Info page.
  3. **使用者資訊 User Info** (`/admin/members/:id`) — detail of one member: full_name,
     username, role, password shown masked (`••••••••` — there is NO password field in the
     API). **編輯使用者資訊** (edit full_name + role) and **修改密碼** (admin force-reset).
  4. **考試管理 Exam Management** (`/admin/exams`) — table of all exams (考試名稱 / 考生 /
     狀態 / 分數), a **filter** control, a **刪除考試** action, row click → exam detail.
  5. **題目管理 Problem Management** (`/admin/problems`) — table of all problems (題目名稱 /
     難度), a **filter** control, a **刪除題目** action, row click → problem detail.

- **Out of scope** (descoped with the user — do NOT build):
  - **System metrics** — CPU load, memory load, evaluation-queue backlog. No backend API
    exists; per the user these belong in Grafana, surfaced via the dashboard link button.
  - **Anomaly submission feed / detail drawer** — the spec's `GET /admin/dashboard/anomalies`
    does not exist, and `SubmissionRead` carries no source-IP field. Not built.
  - **`POST /admin/dashboard/summary`** — does not exist; the dashboard is computed
    client-side from `/exams/`, `/submissions/`, `/users/` instead.
  - Backend, judge-worker, docker-compose — frontend-only loop.
  - Reusing or modifying the Candidate / Questioner / Interviewer pages.

- **Admin exam-detail & problem-detail pages**: build them **read-only oversight views**
  (`GET /exams/{id}` / `GET /problems/{id}` rendered for inspection). Do NOT re-implement
  the Interviewer's edit/result pages or the Questioner's problem form — the Admin's job
  here is oversight + delete, not editing exam contents.

## Constraints

- **Tech stack is locked** (see CLAUDE.md): Vite + React (**JavaScript only, no TypeScript**),
  React Router v6, Tailwind + shadcn/ui, axios via shared `frontend/src/lib/api.js`,
  Vitest + @testing-library/react. Do **not** introduce TanStack Query, i18n, or TS.
- UI strings are **純中文 (Traditional Chinese)**, hardcoded in JSX — no i18n layer.
- Beginner-friendly idiomatic React: plain `useEffect` + `useState` + `axios`. No clever
  abstractions. Comment only non-obvious code.
- All API paths are `/api/v1/...` **with trailing slash on collection routes**. Match the
  existing Questioner / Interviewer pages' call style.
- Reuse shared components: `LoadingSpinner`, `ErrorMessage`, `ExamStatusBadge`,
  `JudgeStatusBadge`, and `@/components/ui/*` (badge, button, card, dialog, input, label,
  tabs, tooltip). **There is NO shadcn `select` component** — use a native `<select>` for
  the role filter and the role picker (match how the Interviewer forms do dropdowns).
- `cd frontend && npm run build` must exit 0; `npm run test` must stay 100% green.
- Never `gh pr merge` — the user merges PRs. PR base for this loop = `feat/interviewer-panel`.

## Verified backend contract (re-derived from live `backend/` source 2026-05-21)

Read directly from `backend/app/api/api_v1/endpoints/{user,problem,exam,submission}.py`,
`backend/app/schemas/{user,problem}.py`, `backend/app/models/enums.py`, and
`backend/app/api/deps.py`. **Treat this as authoritative.** A prior loop's lesson:
verifying the contract up front removes an entire class of mid-phase rework.

### Role gating — there is NO `/admin` router

The backend has **no `/admin` prefix** at all. Admin access works because
`deps.RoleChecker` **always adds `Admin` to every allowed-role set** — so Admin can call
every Questioner/Interviewer-gated endpoint. Endpoints gated `get_admin_user` are
**Admin-exclusive**.

### Enums (exact casing — capitalized)

- `UserRole`: `Admin | Candidate | Interviewer | Questioner`
- `DifficultyLevel`: `Easy | Medium | Hard`
- `ExamStatus`: `Draft | Published | Ongoing | Finished | Archived`
- `JudgeStatus`: `Pending | Judging | AC | WA | TLE | MLE | RE | CE`

### User endpoints (router prefix `/api/v1/users`) — back the member pages

| Method & path | Body | Returns | Role gate | Notes |
|---|---|---|---|---|
| `GET /api/v1/users/` | — | `200` `UserRead[]` | Interviewer+ (Admin ok) | Returns **all** users. |
| `POST /api/v1/users/` | `UserCreate` | `201` `UserRead` | Interviewer+ (Admin ok) | Duplicate username → `400 "該帳號名稱已存在"`. |
| `GET /api/v1/users/{user_id}` | — | `200` `UserRead` | Interviewer+ (Admin ok) | `404 "找不到該使用者"` if missing. `user_id` is a **UUID**. |
| `PATCH /api/v1/users/{user_id}` | `UserUpdate` | `200` `UserRead` | **Admin only** | Edit a member's `full_name` and/or `role`. |
| `PUT /api/v1/users/{user_id}/password-reset` | `UserPasswordReset` | `200` `{detail}` | **Admin only** | Force-reset another user's password — **no old password needed**. |
| `DELETE /api/v1/users/{user_id}` | — | **`200`** `{detail}` | **Admin only** | ⚠️ **Returns `200`, not `204`.** Deleting your own account → `400 "管理員無法刪除自身的管理員帳號"`. |
| `PUT /api/v1/users/me/password` | `UserUpdatePassword` | `200` `{detail}` | any logged-in | Changing **your own** password (needs old password). |
| `PATCH /api/v1/users/me` | `UserUpdate` | `200` `UserRead` | any logged-in | Edit own profile. |

**User schemas:**
- `UserCreate`: `username` (str, 3–50), `full_name` (str, ≤100, optional), `password`
  (str, ≥8), `role` (`UserRole`, default `Candidate`).
- `UserUpdate`: `full_name` (optional), `role` (optional). **No `username`** — usernames
  are immutable; the User Info edit form shows `username` read-only.
- `UserRead`: `id` (UUID), `username`, `full_name` (nullable), `role`, `created_at`.
  **No password field of any kind** — render the spec's "password (masked)" as a static
  `••••••••`.
- `UserPasswordReset`: `new_password` (str, ≥8). `UserUpdatePassword`: `old_password`,
  `new_password` (str, ≥8).

**Password change on the User Info page**: this page can target any member by `:id`.
Use the **Admin force-reset** call `PUT /users/{id}/password-reset` (single new-password
field) — uniform for every member, including the Admin's own record. (The old-password
`PUT /me/password` flow is only relevant if you also give the Admin a self-profile form;
not required by the spec.)

**Delete-self guard**: the Member list / User Info delete action must be **disabled for
the row matching the current Admin's own `id`** (backend rejects it with `400`). The
current user is available from `useAuth()` → `user` (a `UserRead` with `id`).

### Problem endpoints (`/api/v1/problems`) — back the problem-management pages

| Method & path | Returns | Notes |
|---|---|---|
| `GET /api/v1/problems/` | `200` `ProblemShortRead[]` | `ProblemShortRead` = `{ id (int), title, difficulty }` — exactly the 題目名稱/難度 columns. |
| `GET /api/v1/problems/{problem_id}` | `200` `ProblemRead` | Full problem detail for the read-only Admin detail page. `problem_id` is an **int**. |
| `DELETE /api/v1/problems/{problem_id}` | **`204`** | ⚠️ `204` (differs from user DELETE's `200`). Admin allowed. |

### Exam endpoints (`/api/v1/exams`) — back the exam-management pages

| Method & path | Returns | Notes |
|---|---|---|
| `GET /api/v1/exams/` | `200` `CandidateExamListRead[]` | Sparse list — `id`, `title`, `status`, `duration_minutes`, `score` (nullable), `start_time`, `end_time`, `created_at`. **No `candidate_id`.** |
| `GET /api/v1/exams/{exam_id}` | `200` `ExamRead` | Full detail incl. `candidate_id` (UUID) + `exam_problems[]`. `exam_id` is a **UUID**. |
| `DELETE /api/v1/exams/{exam_id}` | **`204`** | `Ongoing` → `400`; `Finished` → soft-archive; `Draft`/`Published` → hard delete. Admin allowed. |

**考生欄位 footgun**: `GET /exams/` does **not** return `candidate_id`, and there is no
per-candidate exam query. To show a 考生 column in the exam table you must either fan-out
`GET /exams/{id}` per row (then resolve `candidate_id` → name via `GET /users/`), or
descope the column. Flag this tradeoff at plan time — the Interviewer loop hit the same
wall and the user chose the fan-out there.

### Submission endpoints (`/api/v1/submissions`) — back the dashboard counts

- `GET /api/v1/submissions/` → `200` `SubmissionRead[]`, newest-first, optional query
  `?problem_id=&exam_id=&user_id=&skip=&limit=`. Admin has global read. `SubmissionRead.status`
  is a `JudgeStatus` — use it for the verdict breakdown. **No source-IP field exists.**

## Frontend integration points

- **Routing** (`frontend/src/App.jsx`): the `/admin` route currently renders
  `AdminStubPage` for `index` and `*`. Replace with real nested routes under the existing
  `StaffLayout` + `ProtectedRoute allowedRoles={['admin']}`:
  `index`→Dashboard, `members`, `members/new`, `members/:id`, `exams`, `exams/:id`,
  `problems`, `problems/:id`. Mirror the Interviewer panel's nested-route shape.
- **Layout** (`frontend/src/layouts/StaffLayout.jsx`): `NAV_BY_ROLE.admin` currently
  points at Questioner/Interviewer routes. Replace the `admin` array with the dedicated
  Admin entries (儀表板 `/admin`, 成員管理 `/admin/members`, 考試管理 `/admin/exams`,
  題目管理 `/admin/problems`). The dashboard `NavLink to="/admin"` needs the **`end`**
  prop or it stays highlighted on every sub-route.
- **New pages** live in `frontend/src/pages/admin/` with a barrel `index.js` (mirror
  `pages/interviewer/index.js`). `frontend/src/pages/stubs/AdminStubPage.jsx` becomes
  unused — delete it and its `App.jsx` import once the real pages are wired in.
  (`QuestionerStubPage.jsx` may still exist — leave it alone.)
- **Patterns to copy**: `pages/interviewer/CandidateListPage.jsx` (list + client-side
  filter + delete-confirm `Dialog`), `pages/interviewer/CandidateFormPage.jsx` (create
  form + validation), `pages/questioner/ProblemListPage.jsx` (canonical list page).
- **Auth**: `useAuth()` returns `{ user, token, loading, login, logout }`; `user` is a
  `UserRead` with `id`/`role`/`username` — use `user.id` for the delete-self guard.
- **Grafana env var**: Vite exposes only `VITE_`-prefixed vars via `import.meta.env`.
  Read `import.meta.env.VITE_GRAFANA_URL`; render the link button only when it is a
  non-empty string. Add a documented entry to `frontend/.env.example` if one exists.
- **Tests**: Vitest + jsdom; setup at `frontend/src/test/setup.js`. Logic-dense pieces
  (dashboard count aggregation, role/status client-side filtering, delete-self guard,
  member-create form validation, Grafana-button visibility) get unit tests — not just a
  build-passes check.

## Inherited context

- Sprint: frontend panel-by-panel build — **Admin is the final panel.**
- Related memory: `project_frontend-roadmap.md`, `feedback_logic-tests.md`,
  `user_frontend-learner.md`, `feedback_spec-before-intake.md`, `reference_panel-spec.md`.

## Prior lessons consulted (via `git log --all -- .harness/lessons.md`)

- **L1 (interviewer-panel `63ed45b`)** — on this machine `npm run test` can print a fatal
  Node worker-thread ESM-teardown stack trace **after** a fully-green Vitest run; the
  process still exits `0`. The verifier must judge by the `Test Files … passed` summary
  line + exit code, **not** by the presence of a stack trace.
- **L2 (interviewer-panel `63ed45b`)** — a plan that cites a spec field by its Chinese
  display name can be satisfied with the wrong data (a UUID rendered where 「帳號」 means
  username). Every phase's API table must spell out exactly which call resolves each
  labelled field.
- **questioner-panel (`f0472e9`)** — re-deriving the backend contract from live source
  before planning eliminated all mid-phase API-contract corrections; the reviewer's
  "nice-to-have" tag is an opinion, not a verdict — the supervisor must re-triage every
  one for data-corruption bugs.

## Open questions resolved at intake

- Q: How should the Dashboard be built given no backend dashboard API?
  → A: Business-stat cards computed client-side from `/exams/`+`/submissions/`+`/users/`,
  plus a Grafana link button (`VITE_GRAFANA_URL`, hidden if unset). No system metrics,
  no anomaly feed.
- Q: Reuse the Questioner/Interviewer pages, or build dedicated `/admin/*` pages?
  → A: Dedicated `/admin/*` pages.

---

*This file is the session-recovery anchor. If this loop is handed off to a new session,
the new session reads this first to rebuild context without re-asking the user.*
