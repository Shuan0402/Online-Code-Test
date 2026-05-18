# Loop: frontend-scaffold-and-panels

## Intent

Build the frontend SPA for the Online Code Test platform — four role panels (Candidate, Questioner, Interviewer, Admin) wired to the existing FastAPI backend.

This loop covers **scaffolding + Candidate panel (Phase 1)** as the priority deliverable. Subsequent loops will add Questioner, Interviewer, Admin.

## Branch

`feat/frontend-scaffold` (off `origin/main` @ d68471d)

## Scope boundary

**In scope this loop:**
- `frontend/` folder scaffold (Vite + React + JS + Tailwind + shadcn/ui + axios + Monaco + React Router)
- Vite proxy `/api` → `http://localhost:8000`
- Auth: login page (form-urlencoded), JWT in localStorage, axios interceptors, `GET /users/me` for role, role-based redirect, protected routes
- Layout shells: top-header-only (Candidate), sidebar+header (others) — even if other panels' pages are stubs
- **Candidate panel full implementation**: exam list, start exam confirmation, take exam page (Monaco + timer + adaptive polling + localStorage draft + offline recovery), finalize submission modal, result page

**Out of scope this loop (deferred to later loops):**
- Questioner / Interviewer / Admin panels — stub the routes only
- docker-compose integration for frontend service
- Production build configuration / CloudFront deployment
- i18n
- Refresh token flow
- WebSocket / SSE upgrade for polling

## Tech stack (locked)

- **Build**: Vite
- **Framework**: React (JavaScript, no TypeScript)
- **Routing**: React Router v6
- **Styling**: Tailwind CSS + shadcn/ui
- **HTTP**: axios (interceptors for Bearer + 401 redirect)
- **Code editor**: Monaco Editor (`@monaco-editor/react`)
- **No**: TanStack Query, i18n, TypeScript

## Backend ground truth (verified by reading source)

- `POST /auth/login` — form-urlencoded (`OAuth2PasswordRequestForm`), returns `{ access_token, token_type }`. **No user info, no refresh token in response.**
- `POST /auth/logout` — blacklists token in Redis (~24h TTL)
- `GET /users/me` — returns `{ id, username, full_name, role, created_at }`
- `GET /exams`, `POST /exams/:id/start`, `POST /exams/:id/submit`, `GET /exams/:id/result`
- `POST /submissions`, `GET /submissions/:id`, `GET /submissions/latest?problem_id=X`
- Submission status flow: `Pending → Judging → AC | WA | TLE | MLE | RE | CE`
- Exam status flow: `Draft → Published → Ongoing → Finished → Archived`
- Roles: `Candidate | Questioner | Interviewer | Admin` (enum)

## Key design decisions (from grill-me session)

1. **Single SPA**, role-based routing — not four separate apps.
2. **Login is form-urlencoded** — must use `URLSearchParams`, not JSON body. Common pitfall.
3. **Token storage**: localStorage. Acceptable XSS risk for this academic project; React's default escaping covers normal cases.
4. **Layout split**: Candidate top-header-only (full-screen editor during exam); others sidebar+header (admin-style CRUD).
5. **Submit only, no run**: backend has no "run-without-grading" endpoint. UI should not offer it.
6. **Exam-wide timer**: single countdown shared across problems; auto-submit on timeout.
7. **Adaptive polling**: delays = `[300, 500, 1000, 2000, 3000, 5000, 5000, 5000, 10000]` ms — saves ~70% requests vs fixed 1s polling.
8. **Offline recovery**: localStorage `pending:{problemId} = { submissionId, ts }` for in-flight; `GET /submissions/latest?problem_id=X` for cold restart.
9. **Code draft**: localStorage `draft:exam:{examId}:problem:{problemId}`, debounce 1s.
10. **UI language**: 純中文, no i18n layer.

## Constraints

- **User is a frontend beginner** — keep patterns simple, idiomatic React. Avoid clever abstractions. Comment only on non-obvious code (form-urlencoded login, adaptive polling, offline recovery).
- **No `package-lock.json` churn from manual edits** — let npm/pnpm manage it.
- **Don't break the backend** — frontend lives in its own folder, no changes to `backend/`, `judge-worker/`, or `docker-compose.yml` this loop.

## Success criteria

End of this loop, user can:
1. `cd frontend && npm run dev` → open browser → see login
2. Log in as a Candidate (using seed data from backend) → land on `/candidate/exams`
3. Start an exam → write code in Monaco → submit → see status transition from Pending → Judging → AC/WA
4. Refresh mid-exam → code draft restored, in-flight submission re-polled
5. Finalize exam → land on result page with per-problem score
6. Other panel routes (`/questioner/*`, `/interviewer/*`, `/admin/*`) exist as protected stubs
