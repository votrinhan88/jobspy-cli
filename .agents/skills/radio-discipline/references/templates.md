# Message shapes

These fix what must be said and in what order, never labels. Write fragments or short sentences in that order. No `Field:` prefixes. No "none" or "nothing" lines: absence means nothing to report. Drop anything empty. Stay inside the length default unless the content is required.

## Done
Outcome with evidence. Then, only if real: what was not verified, assumed or left undone, attached to the claim it limits. Then, only if real: what you need from the operator.
> "Retry fix in, 14/14 tests pass (unit only; e2e not run). Assumed 5 retries. Needs your OK to merge."
Clean success: "Done, 14/14 pass."

## Blocked
Task, the single blocker, what you tried (one to three, with outcomes), the exact input you need, and your fallback with its trigger.
> "BLOCKED: deploy stalled, no write access to `prod-config`. Tried token A (403), token B (expired). Need a token with write, or I'll stage to `dev` instead."

## Error
What failed and its impact, the exact command and verbatim error, the state left behind, cause as known, suspected (with basis) or unknown, and your next step. After two failed recoveries, stop and report.
> "WARNING: migration 0042 failed, 2 of 9 tables altered, users locked. `alembic upgrade head` -> `column "plan_id" already exists`. DB dirty, nothing running. Suspect a half-applied earlier run. Rolling back tables 1-2 unless you stop me."

## Question
The decision, your pick first with one reason, the alternative(s) with their downside, and the reversible default.
> "QUESTION: tests need a Postgres container. Docker (slow, clean) or sqlite (fast, hides JSON bugs)? I'd take Docker. Going with it if you don't reply."

## Confirm (destructive or external)
One or two lines: the exact verb, object and scope, that it is irreversible and where the backup is, and the echo that proceeds. Changing the target or action voids prior approval.
> "CONFIRM: drop table `users` on prod, irreversible, backup at s3://bk/2026-11-14. Reply `go drop users` to proceed."

## Uncertain
The claim, how sure and why, what was not checked, what would change your view.
> "Likely the cache: stale entry at line 40, but I didn't reproduce it. A cold-start run would settle it."

## Long run
What changed, what you decided without the operator and why, what was verified and what was not, deviations from intent, risks, what needs the operator in order of priority, and where the log is. One short paragraph or a few fragments.
> "Auth migration done, 31 files. Chose bcrypt over argon2 (no native build on CI). Unit pass; login e2e not run. Needs you: rotate the session secret before deploy. Log: `./migration.log`."

## Handoff or context reset
For a person or agent with none of your context. In order, one line each, omitting empty ones:
- State: stable, watch or critical, with the reason.
- Goal and what is done.
- Dirty state: uncommitted files, running processes, temporary files.
- Remaining actions, in order.
- Contingencies: if X, then Y.
- Constraints in conflict, and dead ends so they are not retried.
- Refs: commit, paths, tests.

The receiver restates the goal and the next action before acting. The giver corrects the restatement.
