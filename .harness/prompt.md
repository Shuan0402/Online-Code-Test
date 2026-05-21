# Loop Prompt — interviewer-panel

**Loop started**: 2026-05-21T04:09:47Z
**Branch**: feat/interviewer-panel (stacked on feat/questioner-panel)
**Supervisor**: Opus 4.7

## Original intent

Build the **Interviewer (面試官) panel** for the Online Code Test frontend SPA. This is
the missing link in the platform's data flow: the Questioner produces problems, the
Interviewer assembles and publishes exams from those problems, and the Candidate consumes
them. The panel lets an interviewer manage the full exam lifecycle — create exam sessions,
configure them, populate them with problems (auto-generate by difficulty quota and/or
manually pick), publish them to a candidate, delete drafts, and review per-candidate
results after an exam finishes.

## Scope boundary

> **SCOPE EXPANDED — 2026-05-21, mid-loop after P3.** The intake answer was overridden
> once the user shared the panel spec. The Interviewer panel must now match the full
> HackMD spec (https://hackmd.io/@st980155/rJvy4aORWg), including candidate-account
> management. See "Scope change log" near the end of this file.

- **In scope** (full HackMD Interviewer spec):
  - Exam list / create / detail-edit pages — **DONE in P1–P3** (committed).
  - Exam result / per-problem scoring page — planned (was P4).
  - **Candidate account management** — candidate list page, create-candidate page
    (name + username + password → `POST /api/v1/users/`), candidate detail page.
  - **Candidate problem-solving detail page** — drill from an exam into one candidate's
    submission for one problem: description, test-case results, submitted source code,
    execution result. (Needs submission endpoints — VERIFY backend first.)
  - **Profile page** — view username / role / full_name, edit profile, change password.
  - Exam list enrichments per spec — score column, filter control.
  - Vitest unit tests for the logic-dense pieces.
- **Out of scope**:
  - Backend, judge-worker, docker-compose — frontend-only loop.
  - The Admin panel (the final loop).

## Constraints

- **Tech stack is locked** (see CLAUDE.md): Vite + React (**JavaScript only, no TypeScript**),
  React Router v6, Tailwind + shadcn/ui, axios via shared `frontend/src/lib/api.js`,
  Vitest + @testing-library/react. Do **not** introduce TanStack Query, i18n, or TS.
- UI strings are **純中文 (Traditional Chinese)**, hardcoded in JSX — no i18n layer.
- Beginner-friendly idiomatic React: plain `useEffect` + `useState` + `axios`. No clever
  abstractions. Comment only non-obvious code.
- All API paths are `/api/v1/...` **with trailing slash on collection routes** (the dev
  proxy forwards `/api` → `:8000`). Match the existing Questioner pages' call style.
- Reuse shared components: `LoadingSpinner`, `ErrorMessage`, `ExamStatusBadge`,
  `JudgeStatusBadge`, and `@/components/ui/*` (button, card, dialog, input, label, tabs).
- `cd frontend && npm run build` must exit 0; `npm run test` must stay 100% green.
- Never `gh pr merge` — the user merges PRs. PR base for this loop = `feat/questioner-panel`.

## Verified backend contract (re-derived from live `backend/` source 2026-05-21)

Prior loops were burned by treating a pre-backend plan's API section as ground truth.
The backend now exists; the following was read directly from
`backend/app/api/api_v1/endpoints/exam.py` + `user.py` and
`backend/app/schemas/exam.py` + `user.py`. **Treat this as authoritative.**

### ID-type footgun (critical)

- `exam.id`, `candidate_id`, `creator_id`, `user.id` → **UUID** (string).
- `problem_id` → **int**. Exam-problem rows and the problem bank are integer-keyed.
- Mixing these up will silently 422. Route params: `/exams/:examId` is a UUID.

### Exam endpoints (router prefix `/api/v1/exams`)

| Method & path | Body | Returns | Notes |
|---|---|---|---|
| `GET /api/v1/exams/` | — | `200` `CandidateExamListRead[]` | Interviewer/Admin gets **all** exams incl. Draft. **Sparse schema** — see below. |
| `POST /api/v1/exams/` | `ExamCreate` | `201` `ExamRead` | Interviewer/Admin only. New exam is always `Draft`. `creator_id` from JWT. |
| `GET /api/v1/exams/{exam_id}` | — | `200` `ExamRead` | Full detail incl. `exam_problems[]`. |
| `PATCH /api/v1/exams/{exam_id}` | `ExamUpdate` | `200` `ExamRead` | Blocked `400` if status is `Ongoing`. |
| `DELETE /api/v1/exams/{exam_id}` | — | `204` | `Ongoing`→`400`; `Finished`→soft-archive; `Draft`/`Published`→hard delete. |
| `POST /api/v1/exams/{exam_id}/problems/generate` | — | `200` `ExamRead` | **Draft only** (`400` otherwise). Fills the easy/medium/hard quota gap by random pick; keeps already-added problems. `400` if the bank lacks enough problems at a difficulty. |
| `POST /api/v1/exams/{exam_id}/problems` | `ExamProblemCreate` | `200` `ExamRead` | **Draft only.** Manually append one problem. |
| `POST /api/v1/exams/{exam_id}/publish` | — | `200` `ExamRead` | **Draft only.** `400` if the exam has **zero** problems. Moves status `Draft`→`Published`. |
| `GET /api/v1/exams/{exam_id}/result` | — | `200` `ExamResultRead` | Per-candidate live scoring. Interviewer/Admin may read any exam. |

### Request schemas

- **`ExamCreate`**: `title` (str, 1–100 chars, required), `duration_minutes` (int, >0,
  default 120), `easy_count`/`medium_count`/`hard_count` (int, ≥0, default 0),
  `candidate_id` (**UUID, required** — the assigned candidate).
- **`ExamUpdate`** (all optional): `title`, `duration_minutes` (>0), `status`,
  `start_time`, `end_time`. For the Interviewer's edit form, send only `title` +
  `duration_minutes`; do not touch `status`/times from the edit form.
- **`ExamProblemCreate`**: `problem_id` (**int, required**), `points` (int, default 100).
  (`random_difficulty` exists in the schema but `problem_id` is schema-required, so the
  practical manual-add call is just `{ problem_id, points }`.)

### Response schemas — the sparse-list gotcha

- **`CandidateExamListRead`** (what `GET /exams/` returns, even for Interviewers):
  `id`, `title`, `status`, `duration_minutes`, `score` (nullable), `start_time`,
  `end_time`, `created_at`. **It does NOT include `candidate_id`, `creator_id`,
  difficulty counts, or `exam_problems`.** To show those, fetch `GET /exams/{id}`.
- **`ExamRead`** (`POST`/`GET {id}`/`PATCH`/generate/add/publish): base fields
  (`title`, `duration_minutes`, `easy_count`, `medium_count`, `hard_count`) plus `id`,
  `creator_id`, `candidate_id`, `status`, `score`, `start_time`, `end_time`,
  `created_at`, `exam_problems[]`. **`ExamRead` exposes `candidate_id` (UUID) but NOT
  the candidate's name** — resolve names client-side via `GET /users/`.
- **`ExamProblemRead`** (items of `exam_problems`): `problem_id` (int), `sequence` (int),
  `points` (int), `title` (str), `difficulty` (`Easy|Medium|Hard`).
- **`ExamResultRead`**: `id`, `title`, `status`, `total_exam_points`,
  `total_candidate_score`, `start_time`, `end_time`, `results[]`. Each result
  (`ExamProblemResultRead`): `problem_id` (int), `title`, `sequence`, `max_points`,
  `candidate_score`, `submission_status` (string; `"Unsubmitted"` when no submission).

### Supporting endpoints

- **`GET /api/v1/users/`** → `200` `UserRead[]` (`id` UUID, `username`, `full_name`
  nullable, `role`, `created_at`). Interviewer-allowed. Filter client-side to
  `role === 'Candidate'` for the create-exam candidate dropdown AND to resolve
  `candidate_id` → display name in list/detail views.
- **`GET /api/v1/problems/`** → problem bank list (already used by the Questioner panel,
  see `ProblemListPage.jsx`). Needed for the manual "add a problem" picker.

### Exam status state machine

`Draft → Published → Ongoing → Finished → Archived`. Interviewer-mutating actions
(edit, generate, manual-add, publish, hard-delete) are **Draft-gated** — the UI should
disable/hide them once an exam leaves Draft, and surface the backend's `400` detail
gracefully if a stale action slips through.

## Frontend integration points

- **Routing** (`frontend/src/App.jsx`): the `/interviewer` route currently renders
  `InterviewerStubPage` (`<Route index>` + `<Route path="*">`). Replace those with real
  nested routes under the existing `StaffLayout` + `ProtectedRoute allowedRoles={['interviewer','admin']}`.
  Mirror the Questioner panel's route shape (list at index, `new`, `:id/edit`, etc.).
- **Layout**: `StaffLayout.jsx` already has the interviewer sidebar entry
  (`{ to: '/interviewer', label: '面試管理' }` in `NAV_BY_ROLE`) — no layout change needed.
  Like the Questioner panel, the sidebar has one link; sub-navigation is via in-page
  buttons/`<Link>`s.
- **Pattern to copy**: `frontend/src/pages/questioner/ProblemListPage.jsx` is the
  canonical list-page pattern (`useState`/`useEffect`/`useCallback` + `api`, loading/error
  states, delete-confirm `Dialog`, client-side filtering). New pages live in
  `frontend/src/pages/interviewer/` with a barrel `index.js` (mirror `questioner/index.js`).
- The old `frontend/src/pages/stubs/InterviewerStubPage.jsx` becomes unused — delete it
  and its import once the real pages are wired in.
- **Tests**: Vitest + jsdom; setup at `frontend/src/test/setup.js`. Logic-dense pieces
  (status-gated action enabling, candidate-name resolution, quota math, form validation)
  get unit tests — not just a build-passes check.

## Inherited context

- Sprint: frontend panel-by-panel build. Order: Candidate ✓ → Questioner ✓ →
  **Interviewer (this loop)** → Admin (final loop).
- Related memory: `project_frontend-roadmap.md`, `feedback_logic-tests.md`,
  `user_frontend-learner.md`.
- Related prior lessons (consult via `git log --all --oneline -- .harness/lessons.md`):
  `f0472e9` (questioner-panel) and `7ca79b6` (frontend-scaffold-and-panels).

## Open questions resolved at intake

- Q: How broad is the Interviewer panel — does it include candidate-user management?
  → A (intake): Exam lifecycle + results, no user creation.
  → **A (OVERRIDDEN 2026-05-21, mid-loop)**: full HackMD spec INCLUDING candidate-account
  management. See "Scope change log" below.

## Scope change log

**2026-05-21, after P3 shipped** — the user shared the panel spec
(https://hackmd.io/@st980155/rJvy4aORWg) and confirmed the Interviewer panel must match
it fully, including creating candidate accounts. The intake "no user creation" answer is
void. The new session must re-plan the remaining scope.

### HackMD spec — Interviewer panel (what is still missing after P1–P3)

- **Candidate account management**: candidate list page (table: 考生姓名 / 考生帳號; row →
  candidate detail; "新增考生" button; per-spec a delete button — see backend caveat),
  create-candidate page (姓名 + 帳號 + 密碼 inputs, submit/cancel), candidate detail page
  (考生資料 + that candidate's exam list).
- **Candidate problem-solving detail page**: reachable from the exam detail page — shows
  one candidate's work on one problem: 題目描述, 測資與結果, 難度, 考生提交的程式碼,
  執行結果, 考生帳號.
- **Profile page**: 帳號 / 角色 / 姓名 display, 修改密碼, 編輯使用者資訊.
- **Exam list enrichments**: spec wants a 分數 column and a 篩選 control. (`score` IS in
  the list schema; the 考生姓名 column is NOT doable — see caveat.)

### Backend reality check (verified from source / to verify)

- `POST /api/v1/users/` — create user; **Interviewer allowed** (`get_interviewer_user`).
  Body `UserCreate`: `username` (3–50 chars), `full_name` (optional, ≤100), `password`
  (≥8 chars), `role` (enum, default `Candidate`). Returns `201` `UserRead`.
- `GET /api/v1/users/` and `GET /api/v1/users/{user_id}` — Interviewer allowed.
- `DELETE /api/v1/users/{user_id}` — **Admin ONLY** (`get_admin_user`). The spec's
  "delete candidate" button is NOT doable for an Interviewer — it 403s. Flag this to the
  user when planning the candidate list page (hide the button, or note the limitation).
- `GET /api/v1/users/me` → `UserRead`. `PATCH /api/v1/users/me` body `UserUpdate` =
  `{ full_name, role }` — **no `username` field**, so the profile page CANNOT rename the
  account (`username` is read-only); non-Admin sending `role` gets `403`. `PUT
  /api/v1/users/me/password` body `UserUpdatePassword` = `{ old_password, new_password }`
  (`new_password` min 8 chars), returns `200`. These back the profile page.
- Candidate detail page wants "that candidate's exam list", but `GET /api/v1/exams/`
  returns the sparse `CandidateExamListRead` with **no `candidate_id`** — and **verified
  2026-05-21: there is NO per-candidate exam query** (`GET /exams/` takes zero query
  params; Interviewers always get every exam). Filtering a candidate's exams therefore
  requires a `GET /exams/{id}` fan-out over every exam id (each `ExamRead` carries
  `candidate_id`). The planner should either accept the fan-out (small system, fine) or
  descope the candidate-detail exam sub-list — flag the tradeoff to the user.

### Verified submission contract (read from `submission.py` + `schemas/submission.py` 2026-05-21)

Router prefix **`/api/v1/submissions`**. Backs the candidate problem-solving detail page.
Non-Candidate roles (incl. **Interviewer**) have **global read access** — no ownership
check. **Treat as authoritative.**

| Method & path | Query / body | Returns | Notes |
|---|---|---|---|
| `GET /api/v1/submissions/` | `?problem_id=<int>&exam_id=<uuid>&user_id=<uuid>&skip=&limit=` (all optional) | `200` `SubmissionRead[]`, newest-first | Interviewer may filter by any combo. **`presigned_url` is NULL here** and `details[]` is not eagerly loaded — this endpoint is for *finding* a submission id, not for the full view. |
| `GET /api/v1/submissions/{submission_id}` | — | `200` `SubmissionRead` | Interviewer global read. **This call populates `details[]` AND `presigned_url`.** Use it for the detail page. |

- **`SubmissionRead`**: `id` (UUID), `user_id` (UUID), `problem_id` (int), `exam_id`
  (UUID, nullable), `submission_type`, `language` (`"python"|"cpp"`), `code_s3_url`,
  `status` (`JudgeStatus`), `score` (int), `execution_time` (int, nullable),
  `memory_usage` (int, nullable), `judge_log` (str, nullable), `created_at`,
  `details[]` (`SubmissionDetailRead`), `presigned_url` (str, nullable).
- **`SubmissionDetailRead`** (per-testcase): `id` (int), `testcase_id` (int), `status`
  (`JudgeStatus`), `execution_time` (int, nullable), `memory_usage` (int, nullable),
  `score` (int), `runtime_info` (str, nullable).
- **`JudgeStatus`** enum: `Pending | Judging | AC | WA | TLE | MLE | RE | CE`. The shared
  `JudgeStatusBadge` already renders these.
- **Source-code footgun**: the submitted source lives in object storage. `presigned_url`
  is a time-limited **MinIO/S3 GET URL** — fetch it with **plain `fetch()`**, NOT the
  shared axios `api` instance (`api` prepends the `/api` base and attaches the Bearer
  token, both wrong for an S3 URL). The response body is the raw source text.
- Candidate-solving page data flow: from the exam detail page, drill in with `examId`
  (UUID) + `problemId` (int). The exam's `candidate_id` comes from `GET /exams/{examId}`.
  Then `GET /submissions/?exam_id=&problem_id=&user_id=<candidate>` → take the newest →
  `GET /submissions/{id}` for `details[]` + `presigned_url`. Problem description / 難度
  come from `GET /api/v1/problems/{problemId}` (the Questioner panel already consumes it).

---

*This file is the session-recovery anchor. If this loop is handed off to a new session,
the new session reads this first to rebuild context without re-asking the user.*
