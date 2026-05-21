# Harness Plan — interviewer-panel

**Created**: 2026-05-21
**Branch**: feat/interviewer-panel
**Intent**: see `.harness/prompt.md`
**Planner**: harness-planner (Sonnet)

> **REPLANNED — 2026-05-21 (resumed session after P3).** P1–P3 below were executed and
> shipped (commits `620b068`, `a730e6e`, `07f8efb`). After P3 the loop scope was expanded
> to match the full HackMD spec. This document replaces the stale P4/P5 with 6 fresh phases
> (P4–P9). P1–P3 phase blocks below remain accurate as a record of completed work.

---

## Summary (updated)

Full Interviewer panel per HackMD spec. P1–P3 done. Remaining: exam result page + list
enrichments (P4), candidate account management — list + create (P5), candidate detail (P6),
candidate problem-solving detail (P7, highest remaining risk — S3 presigned URL footgun),
profile/password (P8), Vitest tests for all new pages (P9). 6 new phases. P7 is high risk.
Tests are deferred to a dedicated P9 so all pages exist before their tests are written.

---

## Prior lessons consulted

- `f0472e9` L1 — editable lists must use stable keys (`problem.id`, not array index);
  numeric inputs (`duration_minutes`, `*_count`, `points`) must be coerced to `Number`
  before sending — NaN would silently 422. Pre-empted in P2/P3 acceptance criteria;
  carried forward to P5 (create-candidate password/username fields).
- `f0472e9` L2 — backend contract is verified in `prompt.md`; plan's acceptance criteria
  cite real status codes (201/200/204) and schema shapes (`CandidateExamListRead` is
  sparse; `ExamRead` adds `candidate_id` but not the candidate's name; `problem_id` is
  int while exam/user ids are UUID; submission ids are UUID).
- `7ca79b6` L3 — stubbed globals make spies vacuously pass. P9 must target the stub
  object, assert exact URL+body, and include "break the impl, watch it fail" style
  assertions for every logic-dense invariant (status-gating, presigned_url plain fetch,
  candidate-name resolution, numeric coercion).

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

## Phase 4 — Exam result page + exam-list enrichments

**Goal**: (a) Implement `ExamResultPage` mounted at `exams/:id/result` — fetches
`GET /api/v1/exams/{id}/result` (`ExamResultRead`) and renders total score banner +
per-problem table with `JudgeStatusBadge`. (b) Enrich the existing `ExamListPage` with
a `score` column (from `CandidateExamListRead.score`) and a status filter `<select>`.

**Risk tier**: low
**Use full ReAct in executor**: no
**Depends on**: P1 (routing + list page exists), P3 (result link lives in ExamDetailPage)

### Files to create / modify

| File | Action | Rationale |
|---|---|---|
| `frontend/src/pages/interviewer/ExamResultPage.jsx` | **create** | Read-only view. Fetches `GET /api/v1/exams/{id}/result`; renders `ExamResultRead`: total score banner, per-problem table (sequence, title, max_points, candidate_score, JudgeStatusBadge for submission_status). Handles `"Unsubmitted"` via the existing `JudgeStatusBadge` which already maps that string to "未提交". |
| `frontend/src/pages/interviewer/index.js` | **modify** | Add `ExamResultPage` export. |
| `frontend/src/App.jsx` | **modify** | Add `<Route path="exams/:id/result" element={<ExamResultPage />} />` under `/interviewer`. |
| `frontend/src/pages/interviewer/ExamListPage.jsx` | **modify** | Add `score` column (显示 `exam.score ?? '—'` with unit 分) and a status-filter `<select>` above the table (options: 全部/草稿/已發佈/進行中/已結束/已封存). Filter is client-side: derive `filteredExams` from `exams` based on `statusFilter` state. No new API call needed. |

### Key implementation notes

- **ExamResultPage**: `ExamResultRead.results[]` items use `submission_status` which is a
  string — when the candidate has not submitted, it is `"Unsubmitted"`. Pass directly to
  `JudgeStatusBadge` (which already handles `"Unsubmitted"` → "未提交"). Do NOT render
  `JudgeStatusBadge` for the `"Unsubmitted"` case specially — the badge handles it.
- **Score banner**: `total_candidate_score` may be `null` (exam not yet started/finished).
  Render `total_candidate_score ?? '—'` and `total_exam_points`. E.g. "— / 300 分".
- **ExamListPage score column**: `CandidateExamListRead.score` is nullable. Show `—` when
  null. The column header is "分數".
- **Status filter**: `statusFilter` state, default `''` (全部). Derive `filteredExams =
  statusFilter ? exams.filter(e => e.status === statusFilter) : exams`. Use the same
  status enum values as `ExamStatusBadge` (`Draft`, `Published`, `Ongoing`, `Finished`,
  `Archived`) for the option values; display their Chinese equivalents as option labels.
### Acceptance criteria

1. `cd frontend && npm run build` exits 0.
2. `cd frontend && npm run test` green.
3. Golden path (result page): navigate to `/interviewer/exams/:id/result` → see exam title,
   total score "135 / 300 分", per-problem table with sequence, problem title, max_points,
   candidate_score, and `JudgeStatusBadge` for `submission_status`.
4. Edge case (result page): `total_candidate_score === null` → shows "— / N 分", no crash.
5. Edge case (result page): `results[]` is empty → shows "尚無結果" empty state.
6. Golden path (list enrichment): exam list shows new "分數" column; when `score` is null
   the cell shows "—"; when score is 150 the cell shows "150 分".
7. Golden path (filter): selecting "草稿" from the status `<select>` → only `Draft` exams
   appear in the table; selecting "全部" restores all rows; no extra API call is made.
8. `ExamDetailPage`'s "查看結果" link (`/interviewer/exams/:id/result`) resolves to
   `ExamResultPage` and no longer 404s.

### Risk / rollback

Low. `ExamResultPage` is a new read-only file. `ExamListPage` modification is additive
(new column + filter state). Rollback: remove route wiring; revert ExamListPage changes.

---

## Phase 5 — Candidate account management: list + create

**Goal**: Implement two pages for managing candidate user accounts: (a) `CandidateListPage`
at `/interviewer/candidates` — table of candidates with "新增考生" button and row → detail
link; (b) `CandidateFormPage` at `/interviewer/candidates/new` — create-candidate form
(姓名 + 帳號 + 密碼 → `POST /api/v1/users/` with `role: 'Candidate'`). Add sidebar nav
entry. Note: the spec shows a delete button, but `DELETE /users/{id}` is Admin-only (403
for Interviewer) — omit the delete button entirely and note this limitation inline.

**Risk tier**: medium
**Use full ReAct in executor**: no
**Depends on**: P4 (App.jsx candidate route stubs added in P4)

### Files to create / modify

| File | Action | Rationale |
|---|---|---|
| `frontend/src/pages/interviewer/CandidateListPage.jsx` | **create** | Fetches `GET /api/v1/users/` (200 `UserRead[]`); filters client-side to `role === 'Candidate'`; renders table: 考生姓名 (`full_name ?? username`), 考生帳號 (`username`), 建立時間, 操作 (查看 link to `/interviewer/candidates/:id`). "新增考生" button navigates to `/interviewer/candidates/new`. Shows "目前沒有考生" empty state. No delete button (Admin-only endpoint — show a `<p className="text-xs text-muted-foreground">` note: "刪除考生帳號需由管理員操作"). |
| `frontend/src/pages/interviewer/CandidateFormPage.jsx` | **create** | Create-candidate form. Fields: 姓名 (`full_name`, optional, ≤100 chars), 帳號 (`username`, required, 3–50 chars), 密碼 (`password`, required, ≥8 chars, `type="password"`). Submit sends `POST /api/v1/users/` with `{ username, full_name: fullName || null, password, role: 'Candidate' }` → 201 `UserRead` → navigate to `/interviewer/candidates/:newId`. Client-side validation: username empty → "請填寫帳號"; username < 3 chars → "帳號至少需要 3 個字元"; password empty → "請填寫密碼"; password < 8 chars → "密碼至少需要 8 個字元". |
| `frontend/src/pages/interviewer/index.js` | **modify** | Add `CandidateListPage` and `CandidateFormPage` exports. |
| `frontend/src/App.jsx` | **modify** | Add real candidate routes under `/interviewer`: `candidates` index → `CandidateListPage`, `candidates/new` → `CandidateFormPage`. (P6 adds `candidates/:id`.) |
| `frontend/src/layouts/StaffLayout.jsx` | **modify** | In `NAV_BY_ROLE`, add `{ to: '/interviewer/candidates', label: '考生管理' }` to BOTH the `interviewer` array and the `admin` array (admin sees interviewer links too). The existing `{ to: '/interviewer', label: '面試管理' }` entry stays. `NAV_BY_ROLE` is a flat `{ role: [{to,label}] }` map. |

### Key implementation notes

- **No numeric coercion needed**: `POST /users/` body fields are all strings (`username`,
  `full_name`, `password`). `role` is sent as the string `'Candidate'`. No int fields.
- **UserCreate schema**: `username` (3–50 chars), `full_name` (optional, ≤100),
  `password` (≥8 chars), `role` (enum default `Candidate` — send explicitly to be safe).
  Backend returns `201 UserRead` on success; `422` on validation failure (show
  `err.response?.data?.detail` inline or a generic Chinese error).
- **Delete omission**: `DELETE /api/v1/users/{id}` is `get_admin_user` — 403 for
  Interviewer. Per the open-question resolution (carry forward): omit the delete button,
  add a small note "刪除考生帳號需由管理員操作" below the table.
- **StaffLayout sidebar**: `frontend/src/layouts/StaffLayout.jsx` has a flat
  `NAV_BY_ROLE` map (`questioner` / `interviewer` / `admin` → array of `{to,label}`).
  Add the `考生管理` entry to the `interviewer` and `admin` arrays only. Do not touch
  `questioner`. The fallback array (role unknown) may also get the entry for consistency.

### Acceptance criteria

1. `cd frontend && npm run build` exits 0.
2. `cd frontend && npm run test` green.
3. Golden path (list): navigate to `/interviewer/candidates` → table shows 考生姓名,
   考生帳號, 建立時間; "新增考生" button navigates to `/interviewer/candidates/new`;
   clicking "查看" on a row navigates to `/interviewer/candidates/:id`.
4. Edge case (list): `GET /api/v1/users/` returns users but none with `role === 'Candidate'`
   → shows "目前沒有考生".
5. Delete button is absent from the UI; "刪除考生帳號需由管理員操作" note is visible.
6. Golden path (create): fill 帳號 "alice123" + 密碼 "password8" → submit → `POST
   /api/v1/users/` called with `{ username: 'alice123', password: 'password8',
   role: 'Candidate' }` (`full_name` omitted or null when left blank) → 201 → navigate to
   `/interviewer/candidates/:newId`.
7. Validation: empty 帳號 → "請填寫帳號"; 帳號 "ab" → "帳號至少需要 3 個字元"; empty 密碼 →
   "請填寫密碼"; 密碼 "1234567" (7 chars) → "密碼至少需要 8 個字元"; no API call on any fail.
8. Sidebar shows "考生管理" link for interviewer role; clicking it navigates to
   `/interviewer/candidates`.

### Risk / rollback

Medium — `POST /api/v1/users/` is a new write endpoint; StaffLayout sidebar is a shared
component (verify the exact data structure before editing). Rollback: revert StaffLayout
and App.jsx; the new page files are standalone.

---

## Phase 6 — Candidate detail page

**Goal**: Implement `CandidateDetailPage` at `/interviewer/candidates/:id` — shows a
candidate's profile info (`GET /api/v1/users/{id}`) plus that candidate's exam sub-list.
The exam sub-list requires a fan-out: `GET /api/v1/exams/` returns all exams (no
`candidate_id` in the list schema), so each exam id must be individually fetched via
`GET /api/v1/exams/{id}` to get `candidate_id` and filter. The fan-out is acceptable for
this course-project scale (bounded exam count).

**Risk tier**: medium
**Use full ReAct in executor**: no
**Depends on**: P5 (candidate routes + barrel)

### Files to create / modify

| File | Action | Rationale |
|---|---|---|
| `frontend/src/pages/interviewer/CandidateDetailPage.jsx` | **create** | Two-section page: (1) 考生資料 card — `full_name`, `username`, `role`, `created_at` from `GET /api/v1/users/{id}` (200 `UserRead`). (2) 該考生的考試列表 — uses `GET /api/v1/exams/` to get all exam ids, then fans out to `GET /api/v1/exams/{id}` for each, filters to those whose `candidate_id === userId`, renders a sub-table (exam title, status badge, duration, "查看考試" link). |
| `frontend/src/pages/interviewer/index.js` | **modify** | Add `CandidateDetailPage` export. |
| `frontend/src/App.jsx` | **modify** | Add `<Route path="candidates/:id" element={<CandidateDetailPage />} />` under `/interviewer`. |

### Fan-out implementation pattern

```
// Pseudocode — executor should implement in plain useEffect + useState
const [examIds, setExamIds] = useState([])        // from GET /exams/ list
const [candidateExams, setCandidateExams] = useState([])
const [examsLoading, setExamsLoading] = useState(true)

// Step 1: fetch list to get ids
const listRes = await api.get('/api/v1/exams/')
const ids = listRes.data.map(e => e.id)

// Step 2: fan-out (Promise.all — all or nothing; ok for small N)
const details = await Promise.all(ids.map(id => api.get(`/api/v1/exams/${id}`)))
const mine = details.map(r => r.data).filter(e => e.candidate_id === userId)
setCandidateExams(mine)
```

Guard: if `ids.length === 0`, skip fan-out and show empty state immediately. Show a
`LoadingSpinner` while fan-out is in progress. If any `GET /exams/{id}` call fails, catch
the error and show "無法載入考試列表" — do not crash the whole page.

### Key implementation notes

- `userId` comes from `useParams()` (`candidates/:id`). This is a UUID string.
- `UserRead` shape: `id` (UUID), `username`, `full_name` (nullable), `role`, `created_at`.
  Display `full_name ?? username` as the display name.
- Candidate-exam sub-table columns: 考試標題, 狀態 (`ExamStatusBadge`), 時長, 操作
  (Button "查看考試" → Link to `/interviewer/exams/:examId`).
- Fan-out is two sequential async steps inside a single `useEffect`. Do NOT debounce or
  abort — keep it beginner-readable.
- Back link: "← 返回考生列表" → `/interviewer/candidates`.

### Acceptance criteria

1. `cd frontend && npm run build` exits 0.
2. `cd frontend && npm run test` green.
3. Golden path: navigate to `/interviewer/candidates/:id` → see 考生資料 card (姓名,
   帳號, 角色, 建立時間) + 考試列表 sub-table showing only exams where `candidate_id`
   matches this candidate; each row has "查看考試" link to `/interviewer/exams/:examId`.
4. Edge case: candidate has no exams → sub-table shows "尚無考試紀錄" empty state.
5. Edge case: `GET /api/v1/users/{id}` returns `404` → `ErrorMessage` shown; no crash.
6. Fan-out: if exam list is empty, fan-out is skipped and empty state renders without
   making any `GET /exams/{id}` call (confirm via code inspection — the test phase will
   assert this).

### Risk / rollback

Medium — fan-out introduces N+1 API calls (bounded, acceptable for this project scale).
If the fan-out proves too slow or hits rate limits in a real env, descoping to "link to
exam list" would be the rollback. The page file is standalone; rollback is removing the
route wiring.

---

## Phase 7 — Candidate problem-solving detail page

**Goal**: Implement `SubmissionDetailPage` at `/interviewer/exams/:examId/problems/:problemId`
— shows one candidate's submission for one problem: 題目描述 + 難度 (from
`GET /api/v1/problems/{problemId}`), submitted source code (fetched via `presigned_url`
using plain `fetch()` — NOT the shared `api` axios instance), per-testcase results table
(`details[]` with `JudgeStatusBadge`), and overall judge status + score.

**Risk tier**: high
**Use full ReAct in executor**: yes
**Depends on**: P3 (ExamDetailPage provides the drill-in link), P4 (route infra)

### Files to create / modify

| File | Action | Rationale |
|---|---|---|
| `frontend/src/pages/interviewer/SubmissionDetailPage.jsx` | **create** | Multi-step data fetch: (1) `GET /api/v1/exams/{examId}` → `candidate_id`; (2) `GET /api/v1/submissions/?exam_id={examId}&problem_id={problemId}&user_id={candidate_id}` → take newest (index 0); (3) `GET /api/v1/submissions/{submissionId}` → full `SubmissionRead` incl. `details[]` + `presigned_url`; (4) `GET /api/v1/problems/{problemId}` for description + difficulty (parallel with step 3). Source code: if `presigned_url` is non-null, `fetch(presigned_url)` (plain fetch, no auth header) → `.text()` → display in Monaco or a `<pre>`. |
| `frontend/src/pages/interviewer/index.js` | **modify** | Add `SubmissionDetailPage` export. |
| `frontend/src/App.jsx` | **modify** | Add `<Route path="exams/:examId/problems/:problemId" element={<SubmissionDetailPage />} />` under `/interviewer`. |
| `frontend/src/pages/interviewer/ExamDetailPage.jsx` | **modify** | Add "查看提交" link on each problem row in the `exam_problems` table: `<Link to={`/interviewer/exams/${id}/problems/${problem.problem_id}`}>查看提交</Link>`. Only show when `exam.status !== 'Draft'` (no submission possible on Draft exams). |

### Critical implementation notes

- **presigned_url footgun**: `presigned_url` is a time-limited MinIO/S3 GET URL. It MUST
  be fetched with `fetch(presigned_url)` (plain browser fetch). Do NOT use the shared
  `api` axios instance — `api` prepends `/api` and attaches a `Bearer` token, both of
  which are wrong for an S3 URL and will cause the request to fail or return 403. This is
  the single highest-risk line in the entire phase. The executor must add a comment:
  `// S3 presigned URL — must use plain fetch(), NOT api axios instance`.
- **presigned_url null guard**: if `presigned_url === null` (submission not yet judged, or
  S3 unavailable), show "程式碼暫無法顯示" instead of crashing.
- **Submission lookup**: `GET /api/v1/submissions/?exam_id=<uuid>&problem_id=<int>&user_id=<uuid>`
  returns an array newest-first. Take `[0]`. If the array is empty, the candidate has not
  submitted this problem — show "考生尚未提交此題" and stop (no further API calls).
- **`problem_id` type**: URL param `problemId` from `useParams()` is a string. Coerce to
  `Number(problemId)` before sending as the `problem_id` query param (lesson L1 applied
  to query strings).
- **Data flow summary**: `useParams()` gives `examId` (UUID string) and `problemId`
  (string → Number). Step 1 fetch exam → `candidate_id`. Step 2 find submission id. Step
  3+4 parallel: fetch full submission + fetch problem detail. Then fetch source text via
  `presigned_url` if non-null.
- **UI sections** (in order): 頁首 (back link + 考試 title + 考生帳號), 題目資訊 (title,
  描述, 難度 badge), 提交資訊 (語言, 狀態 `JudgeStatusBadge`, 分數, 執行時間), 程式碼
  (`<pre>` or Monaco read-only — use `<pre>` for simplicity to avoid async Monaco import
  complexity), 測資結果 table (`details[]`: testcase_id, status badge, score, exec time).
- **Monaco vs pre**: use `<pre className="bg-muted rounded p-4 text-sm overflow-auto">` for
  the source display — plain `<pre>` avoids the Monaco async loading complexity and keeps
  the page beginner-friendly. Monaco can be used if the executor judges it worthwhile, but
  `<pre>` is sufficient.

### Acceptance criteria

1. `cd frontend && npm run build` exits 0.
2. `cd frontend && npm run test` green.
3. Golden path: navigate to `/interviewer/exams/:examId/problems/:problemId` → see 題目標題
   + 難度 + 描述; 考生帳號 in header; 提交狀態 `JudgeStatusBadge`; source code in `<pre>`;
   `details[]` table with per-testcase `JudgeStatusBadge`, score, exec time.
4. Edge case: `presigned_url === null` → "程式碼暫無法顯示" shown instead of `<pre>`, no crash.
5. Edge case: submission list empty (candidate has not submitted) → "考生尚未提交此題" shown;
   no calls to `GET /submissions/{id}` or `presigned_url`.
6. Edge case: `GET /exams/{examId}` fails (404/500) → `ErrorMessage` with 返回 button.
7. Source code is fetched with plain `fetch(presigned_url)` — NOT `api.get(...)`. The
   executor must confirm this by code inspection; the test phase will mock `window.fetch`
   separately from `api` to verify this invariant.
8. `problem_id` query param is sent as a Number (e.g. `?problem_id=3`), not a string.
9. `ExamDetailPage` shows a "查看提交" link per problem row when status is not Draft.

### Risk / rollback

High — multi-step async data flow; the presigned_url plain-fetch requirement is easy to
get wrong (using `api` by muscle memory). Rollback: remove the route from App.jsx and
remove the "查看提交" links from ExamDetailPage; both new-file and modified-file changes
are reversible.

---

## Phase 8 — Profile / change-password page

**Goal**: Implement `ProfilePage` at `/interviewer/profile` — displays the logged-in
interviewer's profile (`GET /api/v1/users/me`), allows editing `full_name` ONLY
(`PATCH /api/v1/users/me` — `username` and `role` are NOT editable, shown read-only),
and provides a password-change form (`PUT /api/v1/users/me/password`).

**Risk tier**: low
**Use full ReAct in executor**: no
**Depends on**: P1 (App.jsx routing infra)

### Files to create / modify

| File | Action | Rationale |
|---|---|---|
| `frontend/src/pages/interviewer/ProfilePage.jsx` | **create** | Two sections: (1) 個人資料 — editable field `full_name` only; `username` + `role` shown read-only (the `UserUpdate` schema has NO `username`); save button → `PATCH /api/v1/users/me`; (2) 修改密碼 — fields `old_password` + `new_password` (≥8 chars) + `confirm_password`; submit → `PUT /api/v1/users/me/password`. Each section has its own inline error + success state. |
| `frontend/src/pages/interviewer/index.js` | **modify** | Add `ProfilePage` export. |
| `frontend/src/App.jsx` | **modify** | Add `<Route path="profile" element={<ProfilePage />} />` under `/interviewer`. |
| `frontend/src/layouts/StaffLayout.jsx` | **modify** | In `NAV_BY_ROLE`, add `{ to: '/interviewer/profile', label: '個人資料' }` to the `interviewer` and `admin` arrays. There is no header profile slot — the sidebar is the place. |

### Key implementation notes

- **PATCH /api/v1/users/me body**: `{ full_name }` ONLY. Verified — the `UserUpdate`
  schema is `{ full_name, role }`; it has NO `username` field, so `username` cannot be
  changed here (the endpoint silently ignores unknown fields). Do NOT send `role`
  (backend 403s a non-Admin role change). On `200` success update local state; no reload.
- **PUT /api/v1/users/me/password body**: verified `UserUpdatePassword` =
  `{ old_password, new_password }` — the field is `old_password` (NOT `current_password`);
  `new_password` min 8 chars; returns `200`. Client-side: validate
  `new_password.length >= 8` and `new_password === confirmPassword` before sending.
  On success, clear the password fields; show "密碼已更新" success message.
- **Two separate forms**: Do NOT combine profile edit and password change into one submit.
  Each section is its own `<form>` with its own submit button and its own error/success
  state.
- **`GET /api/v1/users/me`**: on mount, fetch this to populate the form. `UserRead` has
  `id`, `username`, `full_name` (nullable), `role`, `created_at`.

### Acceptance criteria

1. `cd frontend && npm run build` exits 0.
2. `cd frontend && npm run test` green.
3. Golden path (profile edit): page shows 帳號 (read-only) + 姓名 pre-filled from
   `GET /users/me`; editing 姓名 and clicking save → `PATCH /api/v1/users/me` called with
   `{ full_name: '...' }` → 200 → form stays populated with the new value; success
   message shown.
4. Golden path (password change): fill 目前密碼, 新密碼 (≥8), 確認新密碼 (matches) →
   submit → `PUT /api/v1/users/me/password` called with `{ old_password, new_password }`
   → 200 → password fields cleared; "密碼已更新" shown.
5. Validation: 新密碼 < 8 chars → "新密碼至少需要 8 個字元", no API call. 確認新密碼
   mismatch → "新密碼與確認密碼不一致", no API call.
6. Profile edit PATCH body contains ONLY `full_name` — no `role`, no `username`.
7. Sidebar (or header) shows a navigable "個人資料" link for the interviewer.

### Risk / rollback

Low — two standard forms with well-defined endpoints. StaffLayout sidebar modification is
the only shared-component touch; same pattern as P5. Rollback: remove route + sidebar link.

---

## Phase 9 — Vitest unit tests for P4–P8 pages

**Goal**: Write real Vitest unit tests for the logic-dense pieces of all pages built in
P4–P8. Tests must meet the L3 "break the impl, watch it fail" standard: every spy
assertion also asserts the exact URL+body; every gating/conditional test has a comment
explaining what removing the guard would break.

**Risk tier**: low
**Use full ReAct in executor**: no
**Depends on**: P4–P8 all complete

Tests are deferred to a single final phase (rather than inlined per page) because: all
pages need to exist before their full test surface is known; a single phase lets the
executor apply the L3 discipline uniformly; this mirrors the Questioner loop's structure.

### Files to create / modify

| File | Action | Key test cases |
|---|---|---|
| `frontend/src/pages/interviewer/ExamResultPage.test.jsx` | **create** | (a) renders total score "135 / 300 分"; (b) `total_candidate_score === null` → "— / 300 分", no crash; (c) `results[]` empty → "尚無結果"; (d) `"Unsubmitted"` status → JudgeStatusBadge renders "未提交". |
| `frontend/src/pages/interviewer/ExamListPage.test.jsx` | **create** | (a) status filter: selecting "Draft" → only Draft rows visible; selecting "全部" → all rows visible, no extra GET call; (b) score column: `score === null` → "—", `score === 150` → "150 分" (or similar); (c) delete confirm → `DELETE /api/v1/exams/{uuid}` called with exact UUID; delete success → row removed; (d) delete 400 → inline error, row stays. |
| `frontend/src/pages/interviewer/CandidateListPage.test.jsx` | **create** | (a) renders table rows filtered to `role === 'Candidate'` only (mock returns mixed roles); (b) non-Candidate users do NOT appear; (c) empty → "目前沒有考生"; (d) delete button is absent from the DOM. |
| `frontend/src/pages/interviewer/CandidateFormPage.test.jsx` | **create** | (a) empty username → "請填寫帳號", POST not called; (b) username 2 chars → "帳號至少需要 3 個字元"; (c) password 7 chars → "密碼至少需要 8 個字元"; (d) success → `POST /api/v1/users/` called with `{ username, password, role: 'Candidate' }` (exact body); (e) optional full_name omitted → body has `full_name: null` or field absent (whichever the impl does — assert the actual behavior). |
| `frontend/src/pages/interviewer/SubmissionDetailPage.test.jsx` | **create** | (a) `presigned_url` non-null → `window.fetch` called with the presigned URL; `api.get` NOT called with the presigned URL (this is the core L3 test for the S3 footgun); (b) `presigned_url === null` → "程式碼暫無法顯示" shown, no `fetch()` called; (c) submission list empty → "考生尚未提交此題" shown, no `GET /submissions/{id}` call; (d) `details[]` table renders per-testcase rows with `JudgeStatusBadge`; (e) `problem_id` query param is a Number (assert `api.get` called with URL containing `problem_id=3` not `problem_id=3` as string — use `toHaveBeenCalledWith` with exact URL string). |
| `frontend/src/pages/interviewer/ProfilePage.test.jsx` | **create** | (a) profile form pre-fills from `GET /users/me` response; (b) save → `PATCH /api/v1/users/me` called with `{ full_name }` only — no `username`, no `role`; (c) password < 8 → "新密碼至少需要 8 個字元", PUT not called; (d) password mismatch → "新密碼與確認密碼不一致", PUT not called; (e) password success → `PUT /api/v1/users/me/password` called with `{ old_password, new_password }`, "密碼已更新" shown, fields cleared. |

### Test-quality requirements (L3 pre-emption)

- Mock `@/lib/api` as `{ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), patch: vi.fn(), put: vi.fn() } }`.
- Mock `window.fetch` separately (via `vi.spyOn(window, 'fetch')`) for `SubmissionDetailPage`
  tests — this is what distinguishes plain `fetch()` from `api` and makes the S3 footgun
  test meaningful.
- Mock shadcn `Dialog` inline (avoid Radix portal issues in jsdom) — same pattern as
  `ProblemListPage.test.jsx`.
- Every `toHaveBeenCalledWith` assertion must include the exact URL string.
- Every gating test (e.g. "button disabled when not Draft") must include a comment:
  `// This test fails if the disabled={!isDraft} guard is removed`.
- `vi.clearAllMocks()` in `beforeEach`.

### Acceptance criteria

1. `cd frontend && npm run build` exits 0.
2. `cd frontend && npm run test` 100% green; all 45 existing tests pass; ≥ 20 new test
   cases across the 6 new files.
3. `SubmissionDetailPage` test: `window.fetch` spy is called with the presigned URL, AND
   `api.get` is NOT called with a URL containing the presigned URL — this directly tests
   the S3 footgun invariant.
4. `CandidateListPage` test: mock returns one `Candidate` and one `Interviewer` user;
   assert only the `Candidate` row appears — this directly tests the client-side filter.
5. Each test file has at least one test with the "break the impl" comment pattern.
6. No test spies on `console.error` as a substitute for real assertions.

### Risk / rollback

Low — pure test additions. If a test cannot be made green, the bug is in P4–P8 and must
be fixed before this phase closes. No rollback needed (test files are additive).

---

## What was explicitly NOT planned

- **`DELETE /api/v1/users/{id}` in Interviewer UI**: Admin-only endpoint (403 for
  Interviewer). Omitted from `CandidateListPage` and `CandidateDetailPage` per verified
  backend contract. A note in the UI explains users must ask an admin.
- **Candidate-panel changes**: no modifications to `/candidate/*` routes or pages.
- **Backend, judge-worker, docker-compose**: frontend-only loop.
- **Status `start_time`/`end_time` editing**: `ExamUpdate` supports these fields but the
  Interviewer edit form intentionally omits them (backend-managed).
- **Pagination / server-side filtering**: not in the backend contract; client-side only.
- **Monaco in SubmissionDetailPage**: `<pre>` is used instead for beginner-friendliness
  (Monaco is already used in the Candidate panel's ExamPage — no need to repeat the async
  import complexity here).
- **Admin panel**: final loop — not touched here.
- **i18n layer**: all UI strings hardcoded in Traditional Chinese per project convention.

---

## Open questions

1. ~~Fan-out in P6 (CandidateDetailPage)~~ — **RESOLVED 2026-05-21**: user chose the
   N+1 fan-out (`GET /exams/` → `Promise.all` of `GET /exams/{id}` → filter by
   `candidate_id`) for full HackMD-spec compliance. P6 stands as written.

2. ~~PUT /users/me/password body shape~~ — **RESOLVED 2026-05-21** (supervisor verified
   from `backend/app/schemas/user.py`): `UserUpdatePassword = { old_password, new_password }`
   (`new_password` min 8). Also discovered `PATCH /me` uses `UserUpdate = { full_name, role }`
   — there is NO `username` field, so the profile page cannot rename the account. P8 has
   been updated: edit `full_name` only; `username` is read-only.

3. ~~StaffLayout profile link placement~~ — **RESOLVED 2026-05-21**: `StaffLayout.jsx`
   lives at `frontend/src/layouts/` (NOT `components/`) and uses a flat `NAV_BY_ROLE`
   map. There is no header profile slot — sidebar entries are the way. P5/P8 file tables
   updated with the correct path and exact `NAV_BY_ROLE` instructions.
