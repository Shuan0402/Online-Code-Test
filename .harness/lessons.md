# Lessons — interviewer-panel

*(Written by Opus at Phase 6, loop end. Max 3 entries. Surprising/non-obvious only.)*

## L1 — `npm run test` can emit a fatal Node crash trace AFTER a fully-green run

On this machine (Node 25.8.1), `cd frontend && npm run test` intermittently prints a
`FATAL ERROR` / native + JavaScript stack trace (frames in `node:internal/modules/esm/*`,
worker-thread teardown) *after* Vitest has already reported `Test Files 13 passed / Tests
77 passed`. The process still exits **0**. It is a Node worker-thread ESM-loader shutdown
bug, not a test failure. **How to apply:** a verifier or supervisor must judge the run by
the Vitest summary line + exit code, NOT by the presence of a stack trace. Grep the log
for `Test Files .* passed` and check `$?` — do not call the run red on the trace alone.
Relevant for the next loop (Admin panel) on this same repo.

## L2 — A plan that cites a spec field by name can be satisfied literally with the wrong data

P7's plan said "考生帳號 in header" (acceptance criterion 3) but its file table did not
include a `GET /users/{id}` call. The executor satisfied the criterion by rendering the
candidate's raw UUID — technically "an account identifier" — and its self-review called
this spec-compliant. 「帳號」 means the *username*, so a UUID fails the actual HackMD
spec. The supervisor caught it at diff review and added the resolving call before commit.
**How to apply:** when a plan references a spec field by its (Chinese) display name,
the phase's file/API table must spell out exactly which call resolves that field —
otherwise the executor will render whatever value is already in hand and mark it done.
Planner should make "what data backs this label" explicit, not implicit.
