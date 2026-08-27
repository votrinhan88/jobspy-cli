## What it does

`handoff` compacts the conversation you are in into a **handoff document**: one markdown file written to `.claude/HANDOFF.md` in the project root, committed alongside the code so a fresh agent can read it to pick the work up.

What it buys is **portability**, not compression. That makes the skill narrower than it sounds. You need a file only when the work has to *travel*: to a new harness, a new directory, a colleague, or a side task you want to fork off. If nothing is travelling, you do not need a handoff: staying in the session, `/clear`, a subagent and `/compact` cover the ordinary end-of-phase case, and `/compact` covers it more often than this skill does.

## When to reach for it

You invoke this by typing `/handoff`; the agent won't reach for it on its own. Pass a note about what the next session is for, and the document is written for it.

Four situations are the whole trigger:

| Situation | Why a file |
| --- | --- |
| Swapping harness (Claude → Codex) | The new harness cannot see the old context |
| Moving to a different directory or repo | A prototype directory is the common case |
| Sending the work to a colleague | They need something they can read |
| Forking a side task found mid-phase | You keep working; a second agent takes the fork |

For anything else (same harness, same directory, you are done grilling and moving to implementation), `/compact` is the move.

## Branching is the use people skip

The fork case is the one worth knowing. You **stay in your session** and hand a copy of the accumulated context to a second agent working in parallel.

You are deep in a design conversation, you hit a question that only running code will settle, and you do not want to spend the thread you built on finding out. Hand off to a prototype session, get the answer, hand the answer back, and reference it from the original thread. Two crossings, one live conversation, nothing re-explained.

## What travels, and what doesn't

The document carries the live thread (what's in flight, why, and what's next) plus a **suggested skills** section naming what the next agent should reach for. Secrets are redacted before it's written.

What it deliberately does not carry is anything already written down. Specs, plans, ADRs, issues, commits and diffs are referenced by path or URL, never copied. That keeps the file small, and it keeps the settled detail in one place instead of two that drift.

## Common questions

**Handoff or compact?**
`/compact` unless something is travelling. `/handoff`'s advantage is not that it summarises better; it's that the result is a file you can carry somewhere `/compact` can't reach.

**Where did my handoff file go?**
`.claude/HANDOFF.md` in the project root. It is committed with the code and survives across sessions, machines, and harnesses.

**How do I actually hand it to the next agent?**
Open the fresh session and say: "Read `.claude/HANDOFF.md`, then continue." The file is already in the repo — no path needed.

**When does something belong in `CLAUDE.md` instead?**
Ask whether it's true next month. `CLAUDE.md` is standing context about the project. A handoff is about one piece of work in flight and is dead once that work lands. Facts that keep getting re-explained are a `CLAUDE.md` problem; a half-finished task is a handoff.

**It captures the what, not the why.**
Two things help. Pass the argument (tell it what the next session is for) so the reasoning that bears on *that* is kept rather than flattened. And watch for confident claims the session never actually verified — the next agent treats the document as a contract and will not re-check it.

## It's working if

- The document is a small fraction of the conversation, and specs, issues, and diffs appear as paths and URLs rather than copied text.
- You can read it cold, without the original session open, and know what to do next.
- The fresh agent starts working instead of asking you to re-explain the setup.
- The file lives at `.claude/HANDOFF.md` and is committed with the code.
- In the fork case, your original session is still sitting there untouched when you come back to it.
- The suggested-skills section names the skill you'd have reached for yourself.
- Nothing in it is a key, a token, or a password.
