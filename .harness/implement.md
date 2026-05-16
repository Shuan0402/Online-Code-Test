## P1 — Scaffold: Vite + React + Tailwind + shadcn/ui + Routing skeleton  (2026-05-16T00:00:00Z)

### Files created

| Path | Role |
|------|------|
| `frontend/package.json` | Vite + React deps (react-router-dom, axios, @monaco-editor/react, tailwindcss, shadcn/ui peer deps) |
| `frontend/vite.config.js` | Vite config; proxy `/api` → `http://localhost:8000`; `@` alias to `src/` |
| `frontend/index.html` | Vite entry HTML |
| `frontend/tailwind.config.js` | Tailwind content paths + shadcn/ui theme tokens |
| `frontend/postcss.config.js` | PostCSS for Tailwind |
| `frontend/components.json` | shadcn/ui config (JS mode, slate base, CSS variables, `@` aliases) |
| `frontend/src/index.css` | Tailwind directives + full shadcn CSS variable set (light + dark) |
| `frontend/src/lib/utils.js` | `cn()` helper using `clsx` + `tailwind-merge` |
| `frontend/src/main.jsx` | React root — `<BrowserRouter>` wrapping `<App />` |
| `frontend/src/App.jsx` | Top-level `<Routes>`: candidate, questioner, interviewer, admin, 404 |
| `frontend/src/layouts/CandidateLayout.jsx` | Top-header-only shell; `<Outlet />` |
| `frontend/src/layouts/StaffLayout.jsx` | Sidebar + header shell; `<Outlet />` |
| `frontend/src/pages/NotFoundPage.jsx` | 404 catch-all |
| `frontend/src/pages/stubs/QuestionerStubPage.jsx` | "功能開發中" placeholder (typo fixed: was QuestioerStubPage in plan) |
| `frontend/src/pages/stubs/InterviewerStubPage.jsx` | "功能開發中" placeholder |
| `frontend/src/pages/stubs/AdminStubPage.jsx` | "功能開發中" placeholder |

### Commands run

- `npm install` — 170 packages added; 4 moderate audit warnings (no unresolved peer-dep errors)
- `npm run build` — **exit 0**; 40 modules transformed; dist 168 kB JS / 8 kB CSS

### Deviations from plan

1. **shadcn init skipped** — ran non-interactively by writing `components.json` by hand and installing the peer deps (`tailwindcss-animate`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`) directly in `package.json`. This is the documented fallback in the executor notes. Outcome is identical.
2. **`QuestioerStubPage.jsx` typo fixed** — file created as `QuestionerStubPage.jsx` per executor instructions.
3. **`src/index.css` added** — not explicitly listed in the P1 file table but required by shadcn CSS variables and Tailwind; without it the build fails. Considered part of the scaffold.
4. **`src/lib/utils.js` added** — same rationale; shadcn components import `@/lib/utils` and it is a de-facto mandatory file for any shadcn setup.

### Adjacent findings (not fixed)

- `npm audit` reports 4 moderate severity vulnerabilities in dev dependencies (esbuild); not blocking, deferred to security pass.

### Blockers

None for P1. P2 requires `POST /api/v1/auth/login` and `GET /api/v1/users/me` to be live.

### Verifier verdict

```
build:  pass   (exit 0; vite v5.4.21; 40 modules; 168 kB JS / 8 kB CSS)
dev:    pass   (curl http://localhost:5173 → valid HTML within 4s)
lint:   no lint configured (no "lint" script in package.json)
deps:   pass   (@types/react + @types/react-dom present in devDeps — benign, IDE only; typescript compiler absent; no junk packages; 17 total deps all expected)
e2e:    skipped (no e2e/ directory; P1 is UI-less scaffold)
```

Note: `@types/react` and `@types/react-dom` in devDependencies are not TypeScript — they are IDE type-hint packages only. The plan explicitly bans TypeScript; the `typescript` package itself is absent, so this is not a violation. Adding ESLint (`npm install -D eslint eslint-plugin-react`) in a follow-up phase is recommended.

**Verdict: yellow** — all commands pass but no lint is configured; recommend adding ESLint before P2.

### Reviewer verdict (P1)

**Verdict: fix-required**

#### Criteria scorecard

| Criterion | Score | Note |
|-----------|-------|------|
| `npm install` completes, no unresolved peer-dep errors | pass | Executor reports 170 packages, 4 moderate audit warnings only |
| `npm run build` exits 0 | pass | Confirmed by executor; dist artefacts present |
| `npm run dev` starts and shows a page | unclear | Cannot verify at review time (no running process); file wiring is correct so expected pass |
| `/candidate/exams` renders CandidateLayout (top header, no sidebar) | pass | `App.jsx:26-31` nests under `<CandidateLayout>`, which renders header + `<Outlet />` with no sidebar |
| `/questioner` renders StaffLayout (sidebar visible) | pass | `App.jsx:34-37` nests under `<StaffLayout>`, which has `<aside>` at `StaffLayout.jsx:29` |
| `/nonexistent` renders 404 page | pass | `App.jsx:50` top-level `path="*"` catch-all pointing to `NotFoundPage` |
| No console errors about missing React Router routes | pass | All imported pages exist; no dangling import detected |

#### Must-fix issues

1. **`node_modules/` and `dist/` not git-ignored** — `git check-ignore` confirms neither is covered by any rule, and both directories exist on disk (`frontend/node_modules/`, `frontend/dist/`). A `git add .` or `git commit -A` will accidentally stage ~170 MB of installed packages and the compiled build output. Add `frontend/node_modules/` and `frontend/dist/` (or a root-level `node_modules` + `dist` glob) to `/Users/jane/Desktop/碩/cloud native/final-project/Online-Code-Test/.gitignore` before any commit on this branch.

#### Nice-to-have

1. **`StaffLayout` sidebar is role-agnostic** (`StaffLayout.jsx:30-33`) — it shows all three staff links (出題管理, 面試管理, 系統管理) regardless of which role is active. This is harmless for P1 stubs but will need role filtering before P2 protected routes land, otherwise a Questioner sees Admin and Interviewer nav links. Flag for P2 executor.

2. **`@types/react` and `@types/react-dom` in `devDependencies`** (`package.json:23-24`) — these are TypeScript declaration packages and are unused in a JS-only project. They cause no harm but add noise. Remove in a cleanup pass.

#### Verification gaps

- Browser rendering of the three acceptance criteria (dev server start, layout checks, 404) was not verified by running the dev server; the reviewer confirms the code wiring is correct but a one-minute manual browser check is recommended before dispatching P2.

### Supervisor resolution + commit

- Reviewer's must-fix (`node_modules/` and `dist/` not git-ignored) resolved inline by supervisor: added `node_modules/`, `dist/`, `.vite/`, `*.log` to root `.gitignore`. Verified with `git check-ignore frontend/node_modules frontend/dist` (both ignored).
- Verifier's yellow on missing lint: deferred. User is a frontend beginner; ESLint adds friction without paying off for P1 scaffold. Can be added in a polish pass later.
- Reviewer nice-to-have on `@types/react` in devDeps: leave as-is, no functional impact.
- Reviewer nice-to-have on `StaffLayout` showing all three nav links: flagged for P2 executor (ProtectedRoute work will naturally hide nav for wrong role).
- **Committed P1 as `b90b945`** on `feat/frontend-scaffold`.

## P2 — Auth layer: Login page, axios interceptors, JWT context, protected routes  (2026-05-16T00:00:00Z)

### Files created

| Path | Role |
|------|------|
| `frontend/jsconfig.json` | jsconfig needed for shadcn CLI to resolve `@/` alias |
| `frontend/src/lib/api.js` | axios instance; Bearer request interceptor; 401 response interceptor → clear localStorage + redirect /login |
| `frontend/src/contexts/AuthContext.jsx` | `AuthProvider` with `{ user, token, loading, login, logout }`; reads/writes localStorage; on mount calls GET /users/me with 404 fallback |
| `frontend/src/components/ProtectedRoute.jsx` | auth gate (→ /login) + role gate (→ /unauthorized); null render during loading to prevent flash |
| `frontend/src/pages/LoginPage.jsx` | form-urlencoded login via URLSearchParams; role-based redirect after success; 422 / 401 / network error handling |
| `frontend/src/pages/UnauthorizedPage.jsx` | 權限不足 page with 返回登入 + 登出 buttons |
| `frontend/src/components/ui/button.jsx` | installed via shadcn@4.6.0 |
| `frontend/src/components/ui/input.jsx` | installed via shadcn@4.6.0 |
| `frontend/src/components/ui/label.jsx` | installed via shadcn@4.6.0 |
| `frontend/src/components/ui/card.jsx` | installed via shadcn@4.6.0 |

### Files modified

| Path | Change |
|------|--------|
| `frontend/src/App.jsx` | Wrapped entire tree in `<AuthProvider>`; added /login + /unauthorized routes; wrapped candidate/questioner/interviewer/admin routes in `<ProtectedRoute allowedRoles={[...]}>` |
| `frontend/src/layouts/StaffLayout.jsx` | Reads `user.role` from AuthContext; filters sidebar nav via `NAV_BY_ROLE` map; adds logout button to header |
| `frontend/src/layouts/CandidateLayout.jsx` | Reads `user` from AuthContext; displays username in header; adds logout button |

### Commands run

- `npx shadcn@4.6.0 add button input label card --yes` — exit 0; created 4 files in `src/components/ui/`
- `npm run build` — **exit 0**; 109 modules transformed; dist 244 kB JS / 12 kB CSS

### Deviations from plan

1. **jsconfig.json added** — shadcn@4.6.0 CLI requires either `tsconfig.json` or `jsconfig.json` to resolve paths. Created a minimal one; not in the plan but required for the toolchain.
2. **`login()` accepts `fallbackUser` parameter** — since `GET /api/v1/users/me` returns 404 (backend not yet deployed), LoginPage passes `{ username, role: res.data.role }` as fallback. The auth token response from the backend is expected to include a `role` field; if it does not, the fallback user will have `role: null` and redirect will fall back to `/login`. This is a known gap noted in the plan.
3. **CandidateLayout also updated** — plan only mentioned StaffLayout for logout; CandidateLayout was updated in parallel since it was a natural extension and the layout was already read.
4. **`admin` role sees questioner + interviewer + admin nav links** — plan said "filter sidebar nav to only show links for the current user's role" but did not define admin scope. Treated admin as superuser seeing all three links; questioner sees only 出題管理; interviewer sees only 面試管理.

### Adjacent findings (not fixed)

- The backend `POST /api/v1/auth/login` response schema is unknown — if it does not include a `role` field, the fallback user will have `role: null` and the redirect will send the user back to `/login` in an apparent loop. LoginPage logs a 422 warning in console to surface this.
- `GET /api/v1/users/me` still returns 404 per plan note; the 404 path is gracefully handled in both `AuthContext.useEffect` (on mount rehydration) and `login()`.

### Blockers

None for P2 build criterion. Browser E2E requires:
- Backend `POST /api/v1/auth/login` to be live and return `{ access_token, role? }`
- Backend `GET /api/v1/users/me` to be live (currently 404 per plan)
- Seed account credentials (not provided per plan open question #4)

### Verifier verdict

```
build:     pass   (exit 0; vite v5.4.21; 109 modules; 244 kB JS / 12 kB CSS)
dev:       pass   (HTTP 200 at http://localhost:5173 and /login within 3s)
ts-files:  pass   (zero .ts/.tsx files in frontend/src)
deps:      pass   (typescript package absent; no junk packages; all deps expected)
json-body: pass   (JSON.stringify not found near auth/login — encoding is correct)
urlparams: pass   (URLSearchParams present in LoginPage.jsx at line 46)
lint:      no lint configured (no change from P1)
e2e:       skipped — backend endpoints not yet live; route wiring verified at build level
```

**Verdict: green**


### Reviewer verdict (P2)

**Verdict: fix-required**

#### Criteria scorecard

| Criterion | Score | Note |
|-----------|-------|------|
| `npm run build` exits 0 | pass | Executor reports 109 modules, exit 0 |
| Unauthenticated visit to `/candidate/exams` redirects to `/login` | pass | `ProtectedRoute.jsx:29` returns `<Navigate to="/login" replace />` when `!token \|\| !user` |
| Login form submits `application/x-www-form-urlencoded` via `URLSearchParams` | pass | `LoginPage.jsx:46-52` — `new URLSearchParams()` + explicit `Content-Type` header |
| Role-based redirect after successful login | pass | `LoginPage.jsx:63-65` — `ROLE_HOME` map covers all four roles |
| Page refresh keeps user logged in (token + `/users/me` rehydration) | pass | `AuthContext.jsx:21-49` — 404 gracefully falls through to cached localStorage user; loading flag cleared either way |
| Clicking logout clears localStorage and redirects to `/login` | **fail** | `AuthContext.jsx:84-90` — `logout` does `window.location.href = '/login'` but never calls `POST /api/v1/auth/logout` (plan criterion: "Clicking logout calls `POST /api/v1/auth/logout` then clears localStorage") |
| Questioner navigating to `/candidate/exams` → `/unauthorized` | pass | `App.jsx` wraps `/candidate` with `allowedRoles={['candidate']}`; `ProtectedRoute.jsx:34-37` redirects wrong role |
| 401 from any API call clears localStorage + redirects to `/login` | pass | `api.js:26-34` handles this; loop guard at `api.js:30` prevents redirect if already on `/login` |

#### Must-fix issues

1. **`logout` never calls `POST /api/v1/auth/logout`** — `/Users/jane/Desktop/碩/cloud native/final-project/Online-Code-Test/frontend/src/contexts/AuthContext.jsx:84-90`. The plan acceptance criterion explicitly requires this API call before clearing localStorage. Fix: make `logout` an async function that fires `api.post('/api/v1/auth/logout').catch(() => {})` (fire-and-forget, swallow error) before the `localStorage.removeItem` calls.

#### Nice-to-have

1. **`logout` in `AuthContext` is synchronous but called from UI as if it could be async** — because `api.post` is async, adding the logout call (per above fix) should use `.finally()` to guarantee the redirect even if the backend is down.

2. **`jsconfig.json` has no `"include"` / `"exclude"` fields** (`frontend/jsconfig.json`) — harmless today but linters and IDE tools may traverse `node_modules` without it. Adding `"include": ["src"]` costs one line and prevents slow IDE indexing.

#### Verification gaps

- Browser E2E is fully blocked (no running backend, no seed credentials). The `POST /api/v1/auth/logout` defect will only manifest at runtime; it is confirmed by static code inspection of `AuthContext.jsx:84-90`.
- `jsconfig.json` is harmless (no `tsc` compiler present); no TypeScript was introduced — all new files are `.jsx` or `.js`.

### Supervisor resolution + commit (P2)

- Reviewer's must-fix (`logout` not calling `POST /auth/logout`) resolved inline by supervisor in `AuthContext.jsx`: made `logout` async, fire-and-forget `api.post('/api/v1/auth/logout')` wrapped in try/catch so that backend errors or unreachable backend still clear the client side. Re-ran `npm run build` → exit 0.
- Reviewer nice-to-haves on async logout + `jsconfig.json` include path: addressed by the same fix (logout is now async); `jsconfig.json` include is cosmetic, deferred.
- Verifier verdict: green — no action needed.
- Open question from executor: backend `POST /auth/login` response schema does not include `role`; LoginPage's fallback path passes `null` role, which would cause an apparent redirect-loop after successful login. Flagged for backend team — should be resolved before browser E2E. Not a P2 blocker for build/static review.
- **To be committed as next commit on `feat/frontend-scaffold`.**
