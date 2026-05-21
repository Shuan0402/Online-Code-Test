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

- **In scope**:
  - Exam list page (all exams system-wide, including Draft) — mounted at `/interviewer`.
  - Create exam session (title, duration, easy/medium/hard difficulty quota, assign to a candidate).
  - Exam detail / edit page — view full exam, edit settings (Draft only), auto-generate
    problems by quota, manually add a problem from the problem bank, publish.
  - Delete exam (Draft/Published hard-delete, Finished soft-archives — handled by backend).
  - Exam result page — per-candidate result: total score + per-problem score/status.
- **Out of scope**:
  - **User creation / user management** — exams assign to *pre-existing* candidate users
    chosen from a dropdown. No `POST /users`. All user management is deferred to the
    Admin panel (the next and final loop).
  - Backend, judge-worker, docker-compose — frontend-only loop.
  - The Admin panel.

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
  → A: **Exam lifecycle + results, no user creation.** Assign exams from a dropdown of
  pre-existing candidates; defer all user management to the Admin panel.

---

*This file is the session-recovery anchor. If this loop is handed off to a new session,
the new session reads this first to rebuild context without re-asking the user.*
