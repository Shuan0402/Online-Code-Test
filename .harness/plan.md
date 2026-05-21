# Harness Plan — interviewer-panel

**Created**: 2026-05-21
**Branch**: feat/interviewer-panel
**Intent**: see `.harness/prompt.md`
**Planner**: harness-planner (Sonnet)

> ⚠️ **STALE FROM P4 ONWARD — 2026-05-21.** P1–P3 below were executed and shipped
> (commits `620b068`, `a730e6e`, `07f8efb`). After P3 the loop scope was expanded — see
> `.harness/prompt.md` "Scope change log": the Interviewer panel must now match the full
> HackMD spec, adding candidate-account management, a candidate problem-solving detail
> page, and a profile/password page. **P4 and P5 below are SUPERSEDED.** A new session
> must re-run the harness planner over the remaining scope (exam result page + the three
> new spec areas + exam-list enrichments + tests), then execute. P1–P3 phase blocks
> below remain accurate as a record of completed work.

---

## Summary

Build the Interviewer (面試官) panel: exam list, create-exam form, exam detail/edit page
(the heaviest piece — view + edit + auto-generate + manual-add + publish), delete, and
exam result page. 5 phases: P1 scaffold + list, P2 create form, P3 detail/edit,
P4 result page, P5 polish + tests. P3 carries the highest risk.

---

## Prior lessons consulted

- `f0472e9` L1 — editable lists must use stable keys (`problem.id`, not array index);
  numeric inputs (`duration_minutes`, `*_count`, `points`) must be coerced to `Number`
  before sending — NaN would silently 422. Pre-empted in P2/P3 acceptance criteria.
- `f0472e9` L2 — backend contract is verified in `prompt.md`; plan's acceptance criteria
  cite real status codes (201/200/204) and schema shapes (`CandidateExamListRead` is
  sparse; `ExamRead` adds `candidate_id` but not the candidate's name; `problem_id` is
  int while exam/user ids are UUID).
- `7ca79b6` L3 — stubbed globals make spies vacuously pass. P5 must target the stub
  object and include "break the impl, watch it fail" style assertions (e.g. confirm the
  actual URL called, confirm action buttons disabled when status != Draft, confirm
  candidate name appears after user list resolves).

---

## Phase 1 — Scaffold: directory, barrel, routing, exam list page

**Goal**: Replace `InterviewerStubPage` with a real `ExamListPage` that fetches
`GET /api/v1/exams/` and shows all exams in a table with `ExamStatusBadge`, a delete
confirm dialog (204 on success), and a "新增考試" button.

**Risk tier**: low
**Use full ReAct in executor**: no
**Depends on**: nothing

### Files to create / modify

| File | Action | Rationale |
|---|---|---|
| `frontend/src/pages/interviewer/ExamListPage.jsx` | **create** | Main list page — mirrors `ProblemListPage.jsx` pattern; fetches `GET /api/v1/exams/`; shows title, status badge, candidate name (resolved from `GET /api/v1/users/`), duration, actions (detail link, delete). |
| `frontend/src/pages/interviewer/index.js` | **create** | Barrel export — mirrors `questioner/index.js`. |
| `frontend/src/App.jsx` | **modify** | Replace the two stub routes under `/interviewer` with real nested routes: `index` → `ExamListPage`, `exams/new` → `ExamFormPage` (stub import for now — will be wired in P2), `exams/:id` → `ExamDetailPage` (stub for P3), `exams/:id/result` → `ExamResultPage` (stub for P4). Delete `InterviewerStubPage` import. |
| `frontend/src/pages/stubs/InterviewerStubPage.jsx` | **delete** | No longer needed once routing is wired. |

### Candidate-name resolution note

`GET /api/v1/exams/` returns `CandidateExamListRead[]` which has no `candidate_id`.
Fetch `GET /api/v1/users/` in parallel; build a `Map<uuid, username>` client-side.
Since the list schema has no `candidate_id`, show "—" in the candidate column for the
list; the detail page (P3) has `candidate_id` from `ExamRead` and resolves from the same
map. (This matches the verified contract: sparse list schema has no `candidate_id`.)

### Acceptance criteria

1. `cd frontend && npm run build` exits 0.
2. `cd frontend && npm run test` all green (existing tests unaffected; new tests not
   required yet — that is P5).
3. Golden path: logged-in interviewer navigates to `/interviewer` → sees a table with
   exam title, `ExamStatusBadge`, duration, and a "新增考試" button; clicking delete opens
   confirm dialog; confirming calls `DELETE /api/v1/exams/{uuid}` (204) and removes the row.
4. Edge case: `GET /api/v1/exams/` returns `[]` → renders "目前沒有考試" empty state.
5. Edge case: delete on a `Finished` exam returns `400` from backend → inline error inside
   dialog stays visible; row is NOT removed.
6. `InterviewerStubPage` is no longer imported anywhere (build would fail if stale import
   remained).

### Risk / rollback

Low risk — additive new files; `App.jsx` change is a well-scoped route swap. If broken,
revert `App.jsx` and keep stub routes.

---

## Phase 2 — Create exam form

**Goal**: Implement `ExamFormPage` for `POST /api/v1/exams/` — title, duration,
easy/medium/hard quota inputs, candidate dropdown (from `GET /api/v1/users/` filtered to
`role === 'Candidate'`), client-side validation, and 201 → redirect to exam detail.

**Risk tier**: low
**Use full ReAct in executor**: no
**Depends on**: P1 (routing and barrel must exist)

### Files to create / modify

| File | Action | Rationale |
|---|---|---|
| `frontend/src/pages/interviewer/ExamFormPage.jsx` | **create** | Create-only form (no edit — edit lives in P3 detail page). Fetches users on mount; filters to candidates; renders a `<select>` for `candidate_id`. Integer fields (`duration_minutes`, `easy_count`, `medium_count`, `hard_count`) use `type="number"` inputs with `min`. |
| `frontend/src/pages/interviewer/index.js` | **modify** | Add `ExamFormPage` export. |
| `frontend/src/App.jsx` | **modify** | Wire `exams/new` route to real `ExamFormPage` (replacing the stub placeholder from P1). |

### Numeric-input footgun pre-emption

`ExamCreate` requires `candidate_id` (UUID string) and integer counts. The submit handler
must call `Number()` / `parseInt()` on all count/duration fields and guard against
`NaN` (set to 0 / 120 respectively) before sending, matching the pattern in
`ProblemFormPage.jsx` lines 156–179. `candidate_id` is sent as the raw UUID string from
the dropdown value — never coerced to int.

### Acceptance criteria

1. `cd frontend && npm run build` exits 0.
2. `cd frontend && npm run test` green.
3. Golden path: fill title ("Spring 2026 面試"), set duration 60, set easy 2 / medium 1 /
   hard 0, pick a candidate from dropdown → submit → `POST /api/v1/exams/` called with
   `{ title, duration_minutes: 60, easy_count: 2, medium_count: 1, hard_count: 0,
   candidate_id: "<uuid>" }` → 201 → navigate to `/interviewer/exams/:newId`.
4. Numeric coercion: clearing the duration field must NOT send `NaN` — fallback 120.
5. Validation: empty `title` → Chinese error "請填寫考試標題", no API call.
   No candidate selected → Chinese error "請選擇應試者", no API call.
6. `candidate_id` in POST body is a UUID string, not an integer.

### Risk / rollback

Low. Form is a new file; only `App.jsx` wiring changes. Rollback = remove route wiring.

---

## Phase 3 — Exam detail / edit page (heaviest phase)

**Goal**: Implement `ExamDetailPage` mounted at `exams/:id`. This single page handles:
viewing full exam detail (fetches `GET /api/v1/exams/{id}` for `ExamRead`), editing title
+ duration (Draft only) via inline `PATCH`, auto-generating problems (`POST .../generate`,
Draft only), manually adding one problem from the bank (`POST .../problems`, Draft only,
opens a picker dialog backed by `GET /api/v1/problems/`), publishing (`POST .../publish`,
Draft only, disabled if zero problems), and delete (via confirm dialog, same 204/400
handling as list).

**Risk tier**: high
**Use full ReAct in executor**: yes
**Depends on**: P1, P2

### Files to create / modify

| File | Action | Rationale |
|---|---|---|
| `frontend/src/pages/interviewer/ExamDetailPage.jsx` | **create** | The core of the panel. Draft-gate logic controls which action buttons are enabled/visible. Resolves `candidate_id` → display name from user list (same `GET /api/v1/users/` call, filtered). |
| `frontend/src/pages/interviewer/index.js` | **modify** | Add `ExamDetailPage` export. |
| `frontend/src/App.jsx` | **modify** | Wire `exams/:id` route to real `ExamDetailPage`. |

### Key implementation points

- **Draft-gating**: Edit form fields, "自動生成題目" button, "新增題目" button, and
  "發佈考試" button are all `disabled` (or hidden) when `exam.status !== 'Draft'`. Each
  backend action that is Draft-only also shows the `400` detail gracefully inline if a
  stale action slips through.
- **Problem list keys**: `exam_problems` items are keyed by `problem_id` (int) — never by
  array index (lesson L1 pre-emption). `problem_id` is int; exam id is UUID; do not mix.
- **Manual-add picker**: Opens a `Dialog` listing problems from `GET /api/v1/problems/`
  (already used by Questioner; reuse the same call style). Each row has an "加入" button
  that calls `POST /api/v1/exams/{id}/problems` with `{ problem_id: <int>, points: 100 }`.
  `problem_id` must be sent as an integer, not a string.
- **Publish guard**: "發佈考試" button is disabled when `exam_problems.length === 0`.
  Even if clicked when `length > 0`, handle backend `400` (e.g. status already Published)
  gracefully.
- **Edit form**: Only `title` and `duration_minutes` are sent in PATCH — do not include
  `status` or times. `duration_minutes` coerced via `Number()`, fallback 120.
- **Candidate name**: Use `GET /api/v1/users/` (same fetch pattern as P2 candidate
  dropdown); `ExamRead` has `candidate_id` (UUID); map to `username` or `full_name`.

### Acceptance criteria

1. `cd frontend && npm run build` exits 0.
2. `cd frontend && npm run test` green.
3. Golden path (Draft exam): navigate to `/interviewer/exams/:id` → see title, status
   badge (草稿), candidate name (resolved, not raw UUID), duration, problem list; click
   "自動生成題目" → `POST .../generate` → problems table refreshes; click "新增題目" →
   picker dialog opens, click "加入" on a row → `POST .../problems` with
   `{ problem_id: <int>, points: 100 }` → problems table refreshes; edit title and save →
   `PATCH` called with only `{ title, duration_minutes }` → page reflects new title;
   click "發佈考試" → `POST .../publish` → status badge changes to "已發佈", all Draft
   action buttons become disabled.
4. Edge case: exam in `Published` status → edit form, generate, add, and publish buttons
   are all disabled; attempting to PATCH via keyboard submit still shows "非草稿狀態不可編輯"
   or the 400 detail.
5. Edge case: publish with zero `exam_problems` → "發佈考試" button is disabled (client
   guard); if backend returns `400` regardless → inline error shown.
6. `problem_id` in add-problem body is an int (never a string).
7. `exam_problems` table rows use `key={problem.problem_id}` not `key={idx}`.

### Risk / rollback

High — most logic lives here; multiple API mutations; status-gating must be correct.
Rollback: revert `App.jsx` wiring to stub route; the new file is standalone.

---

## Phase 4 — Exam result page

**Goal**: Implement `ExamResultPage` mounted at `exams/:id/result` that fetches
`GET /api/v1/exams/{id}/result` and renders `ExamResultRead`: total score banner,
per-problem table with `sequence`, `title`, `max_points`, `candidate_score`,
`submission_status` (using `JudgeStatusBadge` for the status column).

**Risk tier**: low
**Use full ReAct in executor**: no
**Depends on**: P1 (routing); P3 not strictly required but shares context

### Files to create / modify

| File | Action | Rationale |
|---|---|---|
| `frontend/src/pages/interviewer/ExamResultPage.jsx` | **create** | Read-only view; fetches `GET /api/v1/exams/{id}/result`; renders `ExamResultRead`. Handles `"Unsubmitted"` `submission_status` gracefully (show as "未提交"). |
| `frontend/src/pages/interviewer/index.js` | **modify** | Add `ExamResultPage` export. |
| `frontend/src/App.jsx` | **modify** | Wire `exams/:id/result` route to real `ExamResultPage`. |

### Acceptance criteria

1. `cd frontend && npm run build` exits 0.
2. `cd frontend && npm run test` green.
3. Golden path: navigate to `/interviewer/exams/:id/result` → see exam title, total score
   (e.g. "135 / 300 分"), per-problem table showing sequence, problem title, max_points,
   candidate_score, and `JudgeStatusBadge` for `submission_status`; "未提交" shown for
   `"Unsubmitted"` status.
4. Edge case: `total_candidate_score` is `null` (exam not started yet) → shows "— / N 分"
   not a crash.
5. Edge case: `results[]` is empty → shows "尚無結果" empty state.

### Risk / rollback

Low — read-only page with simple data rendering. Rollback = remove route wiring.

---

## Phase 5 — Polish + Vitest unit tests

**Goal**: Write real unit tests for the four logic-dense areas called out in `prompt.md`
and `feedback_logic-tests.md`; verify all tests pass; fix any cosmetic polish issues
found during review.

**Risk tier**: low
**Use full ReAct in executor**: no
**Depends on**: P1–P4 all complete

### Files to create / modify

| File | Action | Rationale |
|---|---|---|
| `frontend/src/pages/interviewer/ExamListPage.test.jsx` | **create** | Tests: (a) renders exam rows from mocked GET list; (b) delete confirm → DELETE called with UUID, row removed; (c) delete 400 → inline error, row stays. |
| `frontend/src/pages/interviewer/ExamFormPage.test.jsx` | **create** | Tests: (a) candidate dropdown populated from mocked users filtered to Candidate role; (b) empty title → validation error, POST not called; (c) numeric coercion — clearing duration → Number coercion, not NaN in POST body; (d) successful submit → POST called with UUID candidate_id (string), int counts. |
| `frontend/src/pages/interviewer/ExamDetailPage.test.jsx` | **create** | Tests: (a) Draft exam → action buttons enabled; (b) Published exam → edit/generate/add/publish all disabled; (c) candidate name resolved (UUID → username via mocked users list); (d) `exam_problems` rows keyed by `problem_id`; (e) publish with 0 problems → button disabled; (f) manual-add sends `problem_id` as int. |
| `frontend/src/pages/interviewer/ExamResultPage.test.jsx` | **create** | Tests: (a) renders total score and per-problem rows; (b) `"Unsubmitted"` status → "未提交" text shown; (c) null `total_candidate_score` → graceful display. |

### Test-quality requirements (L3 pre-emption)

Every test that asserts a spy was called must also assert the **exact URL and body** (e.g.
`expect(api.post).toHaveBeenCalledWith('/api/v1/exams/<uuid>/publish')`). Every
status-gate test must break the implementation when the gate is removed and observe the
test fail — document this with a comment in the test. Shadcn `Dialog` must be mocked
inline as in the Questioner tests (avoid Radix portal issues in jsdom).

### Acceptance criteria

1. `cd frontend && npm run build` exits 0.
2. `cd frontend && npm run test` 100% green; ≥ 12 new test cases across the 4 files.
3. Each of the four logic categories has at least one test that would fail if the logic
   were removed: status-gating, candidate-name resolution, numeric coercion, publish guard.
4. No test uses `key={index}` on dynamic lists — tests confirm `problem_id`-keyed rows
   survive reorder (or at minimum confirm `key` is not index-based via DOM structure).

### Risk / rollback

Low. Pure test additions. If a test cannot be made green, the bug is in P1–P4 and must
be fixed before this phase closes.

---

## What was explicitly NOT planned

- **User creation / management**: deferred to Admin panel loop (out of scope per
  `prompt.md`).
- **Candidate-panel changes**: no modifications to `/candidate/*` routes or pages.
- **Backend, judge-worker, docker-compose**: frontend-only loop.
- **Status `start_time`/`end_time` editing**: `ExamUpdate` supports these fields but the
  Interviewer edit form intentionally omits them (send only `title` + `duration_minutes`
  per the verified contract note); they are backend-managed.
- **Pagination / server-side filtering**: not in the backend contract; client-side only.
- **Admin panel**: final loop — not touched here.

---

## Open questions (supervisor must resolve before dispatching P1)

None — all ambiguities were resolved at intake (see `prompt.md` "Open questions resolved
at intake"). The backend contract is authoritative as documented in `prompt.md`.
