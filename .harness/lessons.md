# Lessons — admin-panel

*(Written by Opus at Phase 6, loop end. Max 3 entries. Surprising/non-obvious only.)*

## L1 — A stub-barrel scaffold phase makes every later phase's scope trivially auditable

P1 wired all 8 `/admin/*` routes through a `pages/admin/index.js` barrel exporting
`() => null` stubs, so `App.jsx` and `StaffLayout.jsx` were frozen after P1. Every
phase P2–P6 then touched only its own page files, its own test, and the one barrel
line it un-stubbed. Result: the reviewer's "no scope creep" check became a one-line
`git diff` confirmation, and 6 phases ran with zero scope-creep findings and zero
executor retries. Worth repeating for any multi-phase frontend feature that adds
several routes at once — front-load the routing/scaffold into phase 1.

## L2 — The exam list endpoint's sparse shape forces a client-side fan-out, twice

`GET /api/v1/exams/` returns `CandidateExamListRead[]` with **no `candidate_id`**, so
rendering a 考生/應試者 column requires N extra `GET /exams/{id}` calls plus a
`GET /users/` map. This loop's P4 hit it; the interviewer-panel loop hit the identical
wall. It is a recurring backend-shape gap, not a one-off — if a future loop touches
`backend/`, adding `candidate_id` to `CandidateExamListRead` would delete the N+2
fan-out from two separate frontend pages.
