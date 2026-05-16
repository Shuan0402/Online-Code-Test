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
