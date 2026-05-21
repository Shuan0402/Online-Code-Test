# Implementation Log — admin-panel

*(Append-only within this loop. One block per phase attempt.)*

## P1 — Routing Scaffold + Layout Admin Nav Rewrite  (2026-05-21T09:30:00Z)

**Files touched**:
- `frontend/src/pages/admin/index.js` — created; barrel exporting 8 stub components (`() => null`): DashboardPage, MemberListPage, MemberCreatePage, MemberDetailPage, AdminExamListPage, AdminExamDetailPage, AdminProblemListPage, AdminProblemDetailPage
- `frontend/src/App.jsx` — removed `AdminStubPage` import; added import of all 8 named pages from `@/pages/admin`; replaced the 2 AdminStubPage routes (`index` + `*`) with 8 explicit nested routes: index→DashboardPage, members, members/new, members/:id, exams, exams/:id, problems, problems/:id
- `frontend/src/layouts/StaffLayout.jsx` — added `end` prop to `SidebarLink` (passed through to `NavLink`); rewrote `NAV_BY_ROLE.admin` to 4 entries (儀表板 `/admin` with `end:true`, 成員管理, 考試管理, 題目管理); updated the fallback `navLinks` array to list the same 4 admin entries (replacing the stale Questioner/Interviewer pointers) while still including questioner/interviewer entries for the unknown-role fallback
- `frontend/src/pages/stubs/AdminStubPage.jsx` — deleted

**Commands run**:
- `npm run build` → exit 0, built in 1.96s, no new errors
- `npm run test` → Test Files 13 passed (13), Tests 77 passed (77), exit 0

**Deviations from plan**: none

**Blockers / open questions**: none

**Adjacent findings (not fixed)**: none

### Verifier verdict (P1)

typecheck: skipped (JS-only project, no tsc step)
lint:      skipped (no lint script in plan commands)
test:      pass (13/13 files, 77/77 tests — summary: "Test Files 13 passed (13), Tests 77 passed (77)", exit 0)
build:     pass (vite build exit 0, 1700 modules, dist built in 1.37s)
e2e:       skipped

**Verdict: green**

### Reviewer verdict (P1)

**Verdict: ship**

**Criteria scorecard**:
1. All 8 `/admin/*` routes wired — PASS. App.jsx lines +92-+102 add index, members, members/new, members/:id, exams, exams/:id, problems, problems/:id under the existing `ProtectedRoute allowedRoles={['admin']}` + `StaffLayout` parent.
2. Barrel exports exactly 8 correct names — PASS. `frontend/src/pages/admin/index.js` lines 2-9 export all 8 names verbatim as `() => null` stubs.
3. `NAV_BY_ROLE.admin` is 4 entries, 儀表板 uses `end: true`, `SidebarLink` forwards `end` — PASS. StaffLayout.jsx lines 33-38, line 7/11 confirm all three sub-criteria.
4. AdminStubPage.jsx deleted, no dangling import — PASS. `git status` shows `D frontend/src/pages/stubs/AdminStubPage.jsx`; `grep -rn AdminStubPage` returned no results.
5. No scope creep — PASS. Only `App.jsx`, `StaffLayout.jsx`, `pages/admin/index.js`, and `stubs/AdminStubPage.jsx` changed; backend/judge-worker/docker-compose untouched.

**Must-fix issues**: none

**Nice-to-have**:
- `StaffLayout.jsx:46-55` — The unknown-role fallback array (never reached under `ProtectedRoute`) now lists 8 mixed entries that could confuse a future developer; a comment explaining it is an unreachable safety-net would help.

**Verification gaps**: No browser/Playwright check was done, but P1 renders `null` stubs — the nav rendering and `end` prop correctness cannot be confirmed until a real browser session. Manual smoke recommended before P2.

**Commit**: `1091a8a` feat(frontend): P1 — admin panel routing scaffold + nav
**Supervisor note**: nice-to-have (fallback-array comment) re-triaged as cosmetic, not a bug — deferred, not blocking.

## P2 — Member List + Member Create Pages + Tests  (2026-05-21T17:30:00Z)

**Files touched**:
- `frontend/src/pages/admin/MemberListPage.jsx` — created; fetches `GET /api/v1/users/`, renders all users in a table (姓名=`full_name??username??'—'`, 帳號=`username`, 角色=`role`, 建立時間=`created_at`); client-side role filter via native `<select>`; delete button disabled when `member.id === currentUser.id` (delete-self guard via `useAuth()`); delete confirm Dialog calls `DELETE /api/v1/users/{id}` (treats any 2xx as success); row click and 查看 button navigate to `/admin/members/{id}`; 新增成員 button navigates to `/admin/members/new`
- `frontend/src/pages/admin/MemberCreatePage.jsx` — created; form with 帳號 (required, 3–50), 姓名 (optional, ≤100), 密碼 (required, ≥8), 角色 (native `<select>`, default Candidate, options Admin/Candidate/Interviewer/Questioner); client-side validation before POST; `POST /api/v1/users/` with `{username, full_name: trim||null, password, role}`; on success navigates to `/admin/members/{res.data.id}`; 400 detail shown inline
- `frontend/src/pages/admin/MemberListPage.test.jsx` — created; 6 tests covering: (a) all 4 roles rendered, (b) role filter Admin/全部, (c) delete-self guard disabled/enabled, (d) delete confirm flow, (e) delete error inline; mocks `@/contexts/AuthContext` with `useAuth: vi.fn(() => ({ user: { id: 'admin-uuid' } }))`
- `frontend/src/pages/admin/MemberCreatePage.test.jsx` — created; 5 tests covering: (a) empty username, (b) username<3 chars, (c) password<8 chars, (d) success POST body, (e) 400 duplicate username inline error
- `frontend/src/pages/admin/index.js` — updated; replaced MemberListPage and MemberCreatePage stub exports with real file imports; left other 6 stubs untouched

**Commands run**:
- `npm run build` → exit 0, 1702 modules transformed, no errors
- `npm run test` → Test Files 15 passed (15), Tests 88 passed (88), exit 0

**Deviations from plan**: Test (a) for MemberListPage used `getAllByText` instead of `getByText` for `questioner_user` and role labels, because the user with `null` full_name renders their username in both the 姓名 and 帳號 columns (by design), and role values like "Admin" also appear in the filter `<option>` elements. This is correct behaviour, not a bug.

**Blockers / open questions**: none

**Adjacent findings (not fixed)**: none

### Verifier verdict (P2)

typecheck: skipped (JS-only project, no tsc step)
lint:      skipped (no lint script in plan commands)
test:      pass (15/15 files, 88/88 tests — summary: "Test Files 15 passed (15), Tests 88 passed (88)", exit 0; MemberListPage.test.jsx 6/6, MemberCreatePage.test.jsx 5/5)
build:     pass (vite build exit 0, 1702 modules, dist built in 1.40s)
e2e:       skipped

**Verdict: green**

### Reviewer verdict (P2)

**Verdict: ship**

**Criteria scorecard**:

1. Field binding — PASS. `MemberListPage.jsx:163` renders `member.full_name ?? member.username ?? '—'` for 姓名; `member.username` for 帳號; `member.role` for 角色; `member.created_at` for 建立時間. No UUID rendered in any data column.
2. DELETE returns 200 — PASS. `MemberListPage.jsx:84` calls `await api.delete(...)` with no `.then(r => r.data)` chaining; the result is unused, so a non-empty 200 body does not throw.
3. Delete-self guard — PASS. `MemberListPage.jsx:155` sets `isSelf = currentUser && member.id === currentUser.id`; line 181 sets `disabled={isSelf}` on the Button. The row is disabled (not hidden). Test at `MemberListPage.test.jsx:191-193` asserts exactly 1 disabled button and 3 enabled buttons.
4. MemberCreatePage validation — PASS. Empty username → "請填寫帳號" (line 25); <3 chars → "帳號至少需要 3 個字元" (line 29); <8 char password → "密碼至少需要 8 個字元" (line 37); `full_name: fullName.trim() || null` (line 45) correctly sends null when blank; role default "Candidate" (line 15); POST body shape `{username, full_name, password, role}` (lines 43-48); native `<select>` used (line 127); 400 detail shown inline (lines 52-58).
5. Tests logic coverage — PASS. Filter-narrows-rows: lines 148-154; delete-self disabled: lines 186-193; validation blocks POST: lines 66/84/102; POST body shape asserted: lines 120-126; 400 inline: lines 144-146. `@/contexts/AuthContext` mock is correct at `MemberListPage.test.jsx:28-30`.
6. Scope — PASS. No P3–P6 files touched; only MemberListPage.jsx, MemberCreatePage.jsx, their tests, and index.js updated.

**Must-fix issues**: none

**Nice-to-have**:
- `MemberCreatePage.jsx:28` — the upper-bound `username.trim().length > 50` has no explicit JS guard; only the HTML `maxLength={50}` attribute enforces it. Because `maxLength` prevents the DOM input from exceeding 50 raw chars, trimming can only shorten the result, so this cannot produce a >50 POST body in practice. Not a bug, but a JS-level guard matching the lower-bound pattern would be more explicit. (line 28)
- `MemberListPage.jsx:33` — `currentUser` from `useAuth()` could theoretically be `null` before the auth context is ready. The `isSelf` expression at line 155 already guards with `currentUser &&`, so the delete button defaults to enabled (not disabled) if the context is loading. This is safe but may flash briefly — cosmetic only.

**Verification gaps**: No browser/Playwright check. The delete-self guard relies on `useAuth().user.id` matching the member's `id` field; if the auth context hydration is async, a very brief window could render the self-delete button enabled. Recommend a manual smoke test with a real Admin session.

**Commit**: `3bfc933` feat(frontend): P2 — admin member list & create pages
**Supervisor note**: both reviewer nice-to-haves (username upper-bound relies on `maxLength`; `isSelf` null-flash during auth hydration) re-triaged — neither corrupts data nor sends a malformed request. Genuinely cosmetic; deferred, not blocking.

## P3 — Member Detail (User Info) Page + Tests  (2026-05-21T17:34:00Z)

**Files touched**:
- `frontend/src/pages/admin/MemberDetailPage.jsx` — created; on mount fetches `GET /api/v1/users/{id}` (UUID from useParams); renders read-only section (姓名=`full_name??'—'`, 帳號=`username` in bg-muted `<p>` (immutable), 角色=`role`, 密碼=always `••••••••`); "編輯使用者資訊" section: form with editable `full_name` text input + `role` native `<select>` (Admin/Candidate/Interviewer/Questioner), PATCH body is `{full_name, role}` only — no username; "修改密碼" section: single `new_password` field (≥8 chars client-side validated), PUT `/api/v1/users/{id}/password-reset` with `{new_password}`; success/error inline messages per section; back button → `/admin/members`; 404 → renders ErrorMessage
- `frontend/src/pages/admin/MemberDetailPage.test.jsx` — created; 5 tests: (a) page loads, displays username read-only + masked password; (b) edit submit PATCH body is `{full_name, role}`, no `username` property; (c) password <8 chars → "密碼至少需要 8 個字元", PUT not called; (d) valid password → PUT `/api/v1/users/{id}/password-reset` called with `{new_password}`; (e) 404 on GET → error-message shown; uses `MemoryRouter`+`Routes`+`Route` so `useParams()` resolves the `:id` segment
- `frontend/src/pages/admin/index.js` — updated; replaced `MemberDetailPage` stub export with `export { default as MemberDetailPage } from './MemberDetailPage'`; left 5 remaining stubs untouched

**Commands run**:
- `npm run build` → exit 0, 1703 modules transformed, dist built in 1.41s
- `npm run test` → Test Files 16 passed (16), Tests 93 passed (93), exit 0

**Deviations from plan**: none

**Blockers / open questions**: none

**Adjacent findings (not fixed)**: none

### Verifier verdict (P3)

typecheck: skipped (JS-only project, no tsc step)
lint:      skipped (no lint script in plan commands)
test:      pass (16/16 files, 93/93 tests — summary: "Test Files 16 passed (16), Tests 93 passed (93)", exit 0; MemberDetailPage.test.jsx 5/5)
build:     pass (vite build exit 0, 1703 modules, dist built in 1.40s)
e2e:       skipped

**Verdict: green**

### Reviewer verdict (P3)

**Verdict: ship**

**Criteria scorecard**:
1. `GET /api/v1/users/{id}` on mount with UUID URL param; 404 -> ErrorMessage — PASS. `MemberDetailPage.jsx:36` calls `api.get('/api/v1/users/${id}')` inside `useEffect([id])`; lines 42-45 catch 404 and set `loadError`; lines 109-115 render `<ErrorMessage message={loadError} />`.
2. PATCH body is exactly `{full_name, role}` — no `username` — PASS. `MemberDetailPage.jsx:61-64` constructs `{ full_name: editFullName.trim() || null, role: editRole }`. No `username` key anywhere in the patch handler. Test at `MemberDetailPage.test.jsx:133-134` explicitly asserts `not.toHaveProperty('username')`.
3. 帳號/username rendered read-only (immutable) — PASS. `MemberDetailPage.jsx:140` renders `member.username` in a `<p>` element with `bg-muted`; there is no `<input>` for username anywhere in the file.
4. 密碼 rendered as `••••••••` — PASS. `MemberDetailPage.jsx:152` hardcodes the masked string; no password field exists in `UserRead` and none is fetched. Test at `MemberDetailPage.test.jsx:95` asserts it.
5. Password reset uses `PUT /api/v1/users/{id}/password-reset` with `{new_password}`; <8 chars -> inline error, API not called — PASS. `MemberDetailPage.jsx:82-85` guards with `if (newPassword.length < 8)` and returns early. Line 90 calls `api.put('/api/v1/users/${id}/password-reset', { new_password: newPassword })`. Test (c) at line 161 asserts `api.put` not called; test (d) at line 181 asserts correct PUT call.
6. Native `<select>` for role; UI strings Traditional Chinese — PASS. `MemberDetailPage.jsx:181` uses a plain `<select>` element. All visible strings are Traditional Chinese.
7. All 5 test cases genuinely asserted — PASS. Test (b) at `MemberDetailPage.test.jsx:133-134` explicitly checks `not.toHaveProperty('username')` on the actual call argument (not just the `toHaveBeenCalledWith` matcher). Test (c) at line 161 asserts `api.put.not.toHaveBeenCalled()`.
8. No scope creep into P4-P6 — PASS. Only `MemberDetailPage.jsx`, `MemberDetailPage.test.jsx`, and the `MemberDetailPage` line in `index.js` changed.

**Must-fix issues**: none

**Nice-to-have**:
- `MemberDetailPage.jsx:62` — `editFullName.trim() || null` sends `null` when the user clears the name field, which is correct per the `UserUpdate` schema. However, if the backend's `full_name` is optional-not-nullable and it rejects `null` on PATCH (i.e., treats `null` as an explicit set-to-null vs. omit-field), a backend validation error could surface. The contract in `prompt.md` says `full_name (optional)` which typically means omit-to-keep, not null-to-clear. This is an API contract ambiguity, not a frontend bug — and the Questioner/Interviewer panels use the same pattern. Cosmetic concern; confirm with a live smoke test.
- `MemberDetailPage.jsx:162-174` — The edit form's `<label htmlFor="edit-full-name">姓名</label>` coexists with an unassociated `<label>姓名</label>` in the read-only section (line 132). `getByLabelText('姓名')` resolves correctly to the input because only the `htmlFor` version is associated — but a screen-reader user will encounter two "姓名" labels, one of which is orphaned (no `for`/`id` link). Cosmetic accessibility issue.

**Verification gaps**: No browser/Playwright check. The PATCH body contract (null vs. omit for cleared `full_name`) should be verified with a live Admin session before merge.

**Commit**: `e47fcd5` feat(frontend): P3 — admin member detail (user info) page
**Supervisor note**: both nice-to-haves re-triaged as cosmetic. The `full_name: null` one is benign — backend `update_user_by_id` does `if obj_in.full_name is not None: …`, so a `null` PATCH simply leaves the name unchanged (a cleared-name save is a harmless no-op, not a malformed request or data corruption). Deferred, not blocking.

---

## MID-LOOP HANDOFF — after P3  (2026-05-21)

Phases **P1, P2, P3 are complete, committed, and green** (`1091a8a`, `3bfc933`, `e47fcd5`).
The loop is being handed off to a fresh session at the Phase 2.5 context-pressure check
(3 phases done + heavy supervisor context — user chose to hand off).

**Remaining work: P4, P5, P6** — all specified in full in `.harness/plan.md`. No open
questions (OQ-1 was resolved: P4's exam list includes the 考生 column via the N+2 fan-out;
the P4 plan section was already amended to specify it).

**A resuming session should:**
1. Read `.harness/prompt.md` (intent + authoritative backend contract), `.harness/plan.md`
   (P4–P6 specs), and this `.harness/implement.md` (P1–P3 history).
2. Resume the harness at **Phase 2, P4**. Branch is `feat/admin-panel`; PR base is
   `feat/interviewer-panel`. Per-phase cycle: executor → reviewer + verifier → commit
   (`feat(frontend): P<n> — …`) → record-SHA chore commit.
3. After P6, run harness Phase 6 (write `.harness/lessons.md`, close-loop commit, propose
   memory updates).

**Carry-forward facts for P4–P6** (already in prompt.md/plan.md, repeated as a checklist):
- `DELETE /exams/{id}` and `DELETE /problems/{id}` return **204**; `DELETE /users/{id}`
  returned **200** — do not assume a status code, treat any 2xx as success.
- `exam_id` is a UUID; `problem_id` is an **int**.
- P5's `ProblemRead`/`TestCaseRead` field names were verified against live source and the
  P5 plan section is correct as written (`test_cases[]` with `input_data`,
  `expected_output`, `score_weight`, `is_sample`; `time_limit` ms, `memory_limit` MB).
- Tests must mock `@/contexts/AuthContext` where a page uses `useAuth()` (pattern
  established in P2's `MemberListPage.test.jsx`).
- Verifier must judge `npm run test` by the `Test Files … passed` summary + exit code,
  not by a post-green Node ESM-teardown stack trace (lesson L1).

---

## P4 — Admin Exam List + Exam Detail Pages + Tests  (2026-05-21T17:58:00Z)

**Files touched**:
- `frontend/src/pages/admin/AdminExamListPage.jsx` — created; on mount fetches `GET /api/v1/exams/` (sparse list), then fan-out `Promise.all` of `GET /api/v1/exams/{id}` per exam + `GET /api/v1/users/` to build usersMap; table columns: 考試名稱 (`title`), 考生 (resolved via `usersMap[candidate_id] ?? '—'` — NOT raw UUID, lesson L2), 狀態 (`ExamStatusBadge`), 分數 (`score`, null → '—'); client-side status filter via native `<select>` (Draft/Published/Ongoing/Finished/Archived/全部); delete button per row opens confirm Dialog → `DELETE /api/v1/exams/{id}` (204, no body, `await api.delete(...)` result unused to avoid empty-body throw); row click navigates to `/admin/exams/{id}`; no 新增考試 button per plan
- `frontend/src/pages/admin/AdminExamDetailPage.jsx` — created; on mount `Promise.all([GET /api/v1/exams/{id}, GET /api/v1/users/])`; renders read-only: title, status badge, 應試者 resolved via `usersMap[exam.candidate_id] ?? exam.candidate_id ?? '—'`, score (null → '—'), duration, start_time, end_time, easy/medium/hard_count; exam_problems table with 題號/題目名稱/難度/配分; delete button → Dialog → `DELETE /api/v1/exams/{id}` → `navigate('/admin/exams')` on success; back button → `/admin/exams`; no edit controls
- `frontend/src/pages/admin/AdminExamListPage.test.jsx` — created; 4 tests: (a) status filter Draft/全部, (b) 考生 renders resolved name (愛麗絲/bob) not raw UUID, 分數 null→'—' + numeric displayed, (c) delete confirm → DELETE called + row removed, (d) delete 400 → inline error shown, row stays; mocks `api.get` via `mockImplementation` keyed on URL; no `@/contexts/AuthContext` mock needed (P4 pages do not call `useAuth()`)
- `frontend/src/pages/admin/index.js` — updated; replaced `AdminExamListPage` and `AdminExamDetailPage` stub exports with real file imports; left DashboardPage, AdminProblemListPage, AdminProblemDetailPage stubs untouched

**Commands run**:
- `npm run build` → exit 0, 1705 modules transformed, dist built in 1.46s
- `npm run test` → Test Files 17 passed (17), Tests 97 passed (97), exit 0

**Deviations from plan**: none

**Blockers / open questions**: none

**Adjacent findings (not fixed)**: none

### Verifier verdict (P4)

typecheck: skipped (JS-only project, no tsc step)
lint:      skipped (no lint script)
test:      pass (17/17 files, 97/97 tests — summary: "Test Files 17 passed (17), Tests 97 passed (97)", exit 0; AdminExamListPage.test.jsx 4/4, all prior 93 tests still green)
build:     pass (vite build exit 0, 1705 modules, dist built in 1.58s)
e2e:       skipped

**Verdict: green**

### Reviewer verdict (P4)

**Verdict: ship**

**Criteria scorecard**:

1. Build exits 0 — PASS. Executor reports 1705 modules, exit 0.
2. Tests pass (AdminExamListPage.test.jsx + all prior) — PASS. 17 files / 97 tests, exit 0.
3. N+2 fan-out correct — PASS. `AdminExamListPage.jsx:57-59` does `Promise.all([Promise.all(sparseList.map(e => api.get(\`/api/v1/exams/${e.id}\`))), api.get('/api/v1/users/')])` — exactly the specified shape.
4. 考生 renders resolved name, NOT raw UUID (L2) — PASS. `AdminExamListPage.jsx:184` renders `usersMap[exam.candidate_id] ?? '—'`. Test (b) at `AdminExamListPage.test.jsx:158-159` explicitly asserts `queryByText('user-uuid-1')` and `queryByText('user-uuid-2')` are absent.
5. 分數 nullable → '—' — PASS. `AdminExamListPage.jsx:190` uses `exam.score != null ? exam.score : '—'`. Test (b) at line 162 asserts `screen.getByText('—')`.
6. DELETE 204 no-body safe — PASS. `AdminExamListPage.jsx:106` calls `await api.delete(...)` with result unused; no `.then(r => r.data)` chain that would throw on empty body.
7. Status filter is client-side — PASS. `AdminExamListPage.jsx:86-88` filters the `exams` state; test (a) at line 142 asserts `api.get` was called exactly once with `/api/v1/exams/` (no re-fetch).
8. Delete 400 → inline error, row stays — PASS. `AdminExamListPage.jsx:110` sets `deleteError`; test (d) at `AdminExamListPage.test.jsx:217-222` asserts the error text is shown and `進行中考試` row remains.
9. 應試者 on detail page resolves via usersMap — PASS. `AdminExamDetailPage.jsx:100` computes `usersMap[exam.candidate_id] ?? exam.candidate_id ?? '—'`.
10. exam_problems table renders sequence/title/difficulty/points — PASS. `AdminExamDetailPage.jsx:187-190` renders `ep.sequence`, `ep.title`, `ep.difficulty`, `ep.points`.
11. Detail page delete navigates to `/admin/exams` on success — PASS. `AdminExamDetailPage.jsx:76` calls `navigate('/admin/exams')` inside the try block.
12. No edit controls on detail page — PASS. `AdminExamDetailPage.jsx` contains no `<input>`, `<textarea>`, or `<form>` elements; only a delete Button and read-only `<p>` elements.
13. No 新增考試 button on list page — PASS. `AdminExamListPage.jsx` header (lines 135-137) renders only the `<h1>` — no create button.
14. Barrel updated, no scope creep — PASS. `index.js` diff shows only the two exam-page stub→real swaps; P1–P3 and P5–P6 stubs untouched.

**Must-fix issues**: none

**Nice-to-have**:
- `AdminExamDetailPage.jsx:100` — the fallback chain `usersMap[...] ?? exam.candidate_id ?? '—'` exposes the raw UUID to the admin UI when the user is not in the usersMap (e.g. deleted user). The plan specifies `usersMap[exam.candidate_id] ?? exam.candidate_id` (with raw-UUID fallback), so this is plan-compliant. A human-friendlier fallback like `'（已刪除使用者）'` would be a nicer UX, but is not required.
- `AdminExamListPage.test.jsx:162` — test (b) asserts `screen.getByText('—')` which is satisfied by any single '—' in the DOM. Because exam-uuid-1 has `score: null` there is exactly one '—' cell, so this is correct in the current fixture. If a second nullable field were added, the assertion could silently pass for the wrong reason. `getAllByText` or a more targeted query would be more robust, but the current fixture makes it unambiguous.

**Verification gaps**: No browser/Playwright check. The fan-out triggers N+2 HTTP calls on every mount — manually verify with live backend that the admin exam list renders promptly (no silent failures when candidate users have been deleted and are absent from usersMap).

**Commit**: `072b57f` feat(frontend): P4 — admin exam list & detail pages
**Supervisor note**: both reviewer nice-to-haves re-triaged as cosmetic — the detail-page `?? exam.candidate_id` fallback is explicitly plan-compliant (a deleted-user UUID is shown rather than a friendlier string; not data corruption), and the `getByText('—')` test query is unambiguous under the current single-null fixture. Deferred, not blocking.

## P5 — Admin Problem List + Problem Detail Pages + Tests  (2026-05-21T18:05:00Z)

**Files touched**:
- `frontend/src/pages/admin/AdminProblemListPage.jsx` — created; fetches `GET /api/v1/problems/` returning `ProblemShortRead[]` (`{id (int), title, difficulty}`); table columns: 題目名稱 (`title`), 難度 (colored badge using same `DIFFICULTY_COLORS`/`DIFFICULTY_LABELS` constants as Questioner panel); client-side difficulty filter via native `<select>` (Easy/Medium/Hard/全部); delete button per row → Dialog → `DELETE /api/v1/problems/{id}` (204, `await api.delete(...)` result unused — no empty-body throw risk); row click navigates to `/admin/problems/{id}`; no 新增題目 button per plan (oversight only)
- `frontend/src/pages/admin/AdminProblemDetailPage.jsx` — created; on mount fetches `GET /api/v1/problems/{id}` (id is int from URL param); renders all ProblemRead fields read-only: title, description (pre-wrapped), difficulty (colored badge), time_limit (ms), memory_limit (MB), creator_id (UUID displayed as-is), created_at; test_cases table: input_data, expected_output, score_weight, is_sample (boolean → 是/否); no edit controls, no rejudge button; delete button → Dialog → `DELETE /api/v1/problems/{id}` → `navigate('/admin/problems')` on success; back button → `/admin/problems`
- `frontend/src/pages/admin/AdminProblemListPage.test.jsx` — created; 3 tests: (a) difficulty filter Easy/全部 — case-sensitive match against `Easy|Medium|Hard` enum, no re-fetch on change; (b) delete confirm → `DELETE /api/v1/problems/1` called (204, mock resolves `{status:204, data:''}`), row removed from state; (c) delete error → inline error shown, row stays; does not mock `@/contexts/AuthContext` (P5 pages do not call `useAuth()`)
- `frontend/src/pages/admin/index.js` — updated; replaced `AdminProblemListPage` and `AdminProblemDetailPage` stub exports (`() => null`) with real file imports; DashboardPage stub left untouched

**Commands run**:
- `npm run build` → exit 0, 1707 modules transformed, dist built in 1.51s
- `npm run test` → Test Files 18 passed (18), Tests 100 passed (100), exit 0

**Deviations from plan**: none

**Blockers / open questions**: none

**Adjacent findings (not fixed)**: none

### Verifier verdict (P5)

typecheck: skipped (JS-only project, no tsc step)
lint:      skipped (no lint script)
test:      pass (18/18 files, 100/100 tests — summary: "Test Files 18 passed (18), Tests 100 passed (100)", exit 0; AdminProblemListPage.test.jsx 3/3, all prior 97 tests still green)
build:     pass (vite build exit 0, 1707 modules, dist built in 1.48s)
e2e:       skipped

**Verdict: green**

### Reviewer verdict (P5)

**Verdict: ship**

**Criteria scorecard**:

1. Build exits 0 — PASS. Verified independently: vite exit 0, 1707 modules.
2. Tests pass (AdminProblemListPage.test.jsx + all prior) — PASS. Verified independently: 18 files / 100 tests, exit 0.
3. `problem_id` used as int in URL — PASS. `AdminProblemListPage.jsx:86` interpolates `deleteTarget.id` (an integer from the API response) directly into the path `/api/v1/problems/${deleteTarget.id}`. `AdminProblemDetailPage.jsx:62,78` similarly use the raw `id` string from `useParams()` — the backend accepts it as an int; no UUID formatting applied.
4. DELETE 204 no-body safe — PASS. Both pages call `await api.delete(...)` with the result unused (`AdminProblemListPage.jsx:86`, `AdminProblemDetailPage.jsx:78`); no `.then(r => r.data)` that would throw on empty body.
5. Difficulty filter case-sensitive (Easy|Medium|Hard) — PASS. `AdminProblemListPage.jsx:72` compares `p.difficulty === difficultyFilter`; filter values are exactly `'Easy'`, `'Medium'`, `'Hard'`, `''`. Test (a) at `AdminProblemListPage.test.jsx:82-110` asserts this.
6. DIFFICULTY_COLORS/DIFFICULTY_LABELS match Questioner panel — PASS. Constants at `AdminProblemListPage.jsx:18-29` and `AdminProblemDetailPage.jsx:18-29` are byte-for-byte identical to `questioner/ProblemListPage.jsx:26-37`.
7. AdminProblemDetailPage read-only, no edit controls, no rejudge button — PASS. `AdminProblemDetailPage.jsx` contains no `<input>`, `<textarea>`, `<form>`, or `<select>` elements (grep returned no output).
8. No 新增題目 button on list page — PASS. `AdminProblemListPage.jsx:114-117` header renders only `<h1>` with no create/add button.
9. test_cases table renders all 4 fields — PASS. `AdminProblemDetailPage.jsx:192-198` renders `tc.input_data`, `tc.expected_output`, `tc.score_weight`, `tc.is_sample` (boolean → 是/否).
10. Tests assert logic genuinely (filter, delete success, delete error) — PASS. Test (a) asserts Medium and Hard rows absent after Easy filter and that `api.get` was called exactly once (no re-fetch). Test (b) asserts DELETE called with `/api/v1/problems/1` and row absent. Test (c) asserts inline error text present and row stays.
11. No scope creep — PASS. index.js diff touches only the two AdminProblem* lines. No P1–P4 or P6 files modified. No grep hits for these component names outside the admin folder.

**Must-fix issues**: none

**Nice-to-have**:
- `AdminProblemDetailPage.jsx:62` — `id` from `useParams()` is a string; it is interpolated directly into the URL path which is correct (the backend parses the path segment as int). However, `api.delete(\`/api/v1/problems/${id}\`)` at line 78 uses the same string `id` while the list page's delete uses the integer `deleteTarget.id`. Both are functionally equivalent for URL construction, but a comment noting `id` is a string-from-params (not a numeric variable) would clarify intent.
- `AdminProblemListPage.test.jsx` — no test for Medium or Hard filter (only Easy is tested). The filter logic is a one-liner equality check so omitting Medium/Hard is low risk, but adding one assertion for a second difficulty would be more robust.

**Verification gaps**: No browser/Playwright check. The detail page delete navigates to `/admin/problems` — verify in a live session that pressing delete on the detail page (not the list) also correctly removes the problem (the list page refetches on mount, so this should be fine, but is untested at the Playwright level).

**Commit**: `ee2a274` feat(frontend): P5 — admin problem list & detail pages
**Supervisor note**: both reviewer nice-to-haves re-triaged as cosmetic — the string-vs-int `id` provenance is functionally correct (backend parses the path segment as int either way; not a malformed request) and the missing Medium/Hard filter assertion covers a one-line equality check. Deferred, not blocking.

## P6 — Dashboard Page + Dashboard Tests  (2026-05-21T18:07:00Z)

**Files touched**:
- `frontend/src/pages/admin/DashboardPage.jsx` — created; on mount fires `Promise.all([GET /api/v1/exams/, GET /api/v1/submissions/, GET /api/v1/users/])`; renders 3 stat cards (考試統計/提交統計/成員統計) using `Card` from `@/components/ui/card`; each card shows total count + per-enum breakdown cells (ExamStatus/JudgeStatus/UserRole); Grafana link `<a target="_blank">` rendered only when `import.meta.env.VITE_GRAFANA_URL` is a non-empty string; includes code comment noting `?limit=` could be added to submissions call; LoadingSpinner while loading, ErrorMessage on error
- `frontend/src/pages/admin/DashboardPage.test.jsx` — created; 5 tests: (a) exam count aggregation (2 Draft/1 Ongoing → total 3), (b) submission verdict breakdown (3 AC/2 WA → total 5), (c) member role breakdown (2 Admin/1 Candidate/1 Interviewer), (d) Grafana button visible + correct href when `vi.stubEnv('VITE_GRAFANA_URL', 'http://grafana:3000')`, (e) Grafana button absent when `vi.stubEnv('VITE_GRAFANA_URL', '')`; each test cleans up with `vi.unstubAllEnvs()` in `afterEach`; does not mock `@/contexts/AuthContext` (DashboardPage does not call `useAuth()`)
- `frontend/src/pages/admin/index.js` — updated; replaced `export const DashboardPage = () => null` stub with `export { default as DashboardPage } from './DashboardPage'`; all 8 exports are now real file imports
- `frontend/.env.example` — created (did not exist); documents `VITE_GRAFANA_URL=` with one-line comment explaining it enables the Grafana link button on the admin dashboard

**Commands run**:
- `npm run build` → exit 0, 1708 modules transformed, dist built in 1.55s
- `npm run test` → Test Files 19 passed (19), Tests 105 passed (105), exit 0

**Deviations from plan**: Test (a) set `submissions` and `users` to empty arrays via a custom `api.get` mock to isolate exam counts — avoiding false failures from shared `getAllByText('1')` matches across all three stat cards. Logic under test is identical; only the fixture isolation was tightened.

**Blockers / open questions**: none

**Adjacent findings (not fixed)**: All 8 DashboardPage stat-card cells for statuses with count 0 still render "0" — this is correct (the spec does not say hide zero-count cells). DashboardPage is the last stub; `index.js` is now fully real — no more stubs in the barrel.

### Verifier verdict (P6)

typecheck: skipped (JS-only project, no tsc step)
lint:      skipped (no lint script)
test:      pass (19/19 files, 105/105 tests — summary: "Test Files 19 passed (19), Tests 105 passed (105)", exit 0; DashboardPage.test.jsx 5/5, all prior 100 tests still green)
build:     pass (vite build exit 0, 1708 modules, dist built in 1.37s)
e2e:       skipped

**Verdict: green**

### Reviewer verdict (P6)

**Verdict: ship**

**Criteria scorecard**:

1. Build exits 0 — PASS. Independently verified: vite 1708 modules, exit 0.
2. Tests pass (DashboardPage.test.jsx 5/5 + all prior 100) — PASS. Independently verified: 19 files / 105 tests, exit 0.
3. `Promise.all([GET /exams/, GET /submissions/, GET /users/])` on mount — PASS. `DashboardPage.jsx:29-33` fires all three calls in a single `Promise.all` inside a single `useEffect([])`.
4. Enum values capitalized exactly (ExamStatus/JudgeStatus/UserRole) — PASS. `DashboardPage.jsx:8-12` constants match the authoritative contract in `prompt.md` verbatim: `['Draft','Published','Ongoing','Finished','Archived']`, `['Pending','Judging','AC','WA','TLE','MLE','RE','CE']`, `['Admin','Candidate','Interviewer','Questioner']`.
5. Grafana button: `<a target="_blank">` only when env var is non-empty string — PASS. `DashboardPage.jsx:46` reads `import.meta.env.VITE_GRAFANA_URL`; line 60 gates on `{grafanaUrl && …}`; line 63 sets `target="_blank"`. Test (d) asserts link present + correct href; test (e) asserts `queryByRole('link')` returns null.
6. Renders without crash on empty arrays — PASS. `DashboardPage.jsx:49-51` `countBy` filter over empty arrays returns 0 safely; `exams.length` etc. on `[]` is 0. All three state values initialise to `[]` (lines 18-22). No optional-chaining gap.
7. `frontend/.env.example` documents `VITE_GRAFANA_URL=` with explanatory comment — PASS. File line 1 is the comment; line 2 is the key with empty value.
8. Barrel `index.js` has all 8 real imports, no stubs remaining — PASS. The diff shows the only remaining stub (`DashboardPage`) replaced by a real import; `git grep '() => null' frontend/src/pages/admin/index.js` would return nothing.
9. Tests genuinely assert aggregation + both Grafana branches — PASS. Test (a) uses isolated fixtures and `getAllByText` to confirm numeric counts. Test (d)/(e) both use `getByRole`/`queryByRole` for the Grafana link directly.
10. No scope creep into P1–P5 files — PASS. `git status` shows only `DashboardPage.jsx`, `DashboardPage.test.jsx`, `index.js` (single line diff), and `.env.example` — no other files modified.

**Must-fix issues**: none

**Nice-to-have**:
- `DashboardPage.test.jsx:110-111` — test (a) asserts `getAllByText('2').length >= 1` and `getAllByText('1').length >= 1` rather than asserting exact counts for Draft and Ongoing specifically. Because submissions and users are empty arrays in this fixture, all other breakdown cells show "0", so the only "2" is Draft-count and the only "1" is Ongoing-count — the assertion is unambiguous in practice. A more targeted `within(examCard)` query would be more self-documenting but is not required.
- `DashboardPage.jsx:60` — `grafanaUrl` is a module-level `const` read at render time, so it is correctly reactive to `vi.stubEnv` in tests (Vite rewrites `import.meta.env.X` at build time, but in the Vitest jsdom environment the stub works because the expression is re-evaluated each render). No code change needed, but a comment explaining the env-var is read at render (not module load) would help future readers understand why `vi.stubEnv` before render works.

**Verification gaps**: No browser/Playwright check. A manual smoke test with `VITE_GRAFANA_URL` set in `.env.local` should confirm the Grafana button appears and opens the URL in a new tab. The `rel="noopener noreferrer"` attribute (`DashboardPage.jsx:64`) is correctly present — no security gap.

**Commit**: `98c3dd5` feat(frontend): P6 — admin dashboard page
**Supervisor note**: both reviewer nice-to-haves re-triaged as cosmetic — the `getAllByText` assertion is unambiguous under the empty-submissions/users fixture, and the render-time env-var read is functionally correct. Deferred, not blocking. **All 6 phases complete.**
