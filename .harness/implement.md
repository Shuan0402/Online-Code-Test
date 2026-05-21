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
