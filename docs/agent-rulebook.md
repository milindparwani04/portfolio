# PARWANI — Agent Rulebook

> **Static.** Unlike the other three docs, this one does not get updated as part of normal work. Do not edit it unless Milind explicitly raises a change — see [`docs/session-handoff.md`](session-handoff.md), [`docs/requirements-tracker.md`](requirements-tracker.md) and [`docs/security-handoff.md`](security-handoff.md) for the living project state instead.

## 1. Session ritual

Start: read [Session Handoff](session-handoff.md) → this Rulebook → [Requirements Tracker](requirements-tracker.md) → [Security Handoff](security-handoff.md). State back in two lines what you understand the goal to be and which phase you are starting. Ask before proceeding if anything is unclear.

End: update the Handoff session log, move statuses in the Requirements Tracker, and add or close items in the Security Handoff if the Worker changed.

## 2. Core rules

1. **Work in phases.** Never build the whole project in one go. Propose a phase plan first (Phase 1…N, each with a clear outcome), get approval, then deliver one phase per turn and stop for review.
2. **Break large tasks down.** Any task over roughly 30 minutes of work or touching more than one area (UI, Worker, data) gets split into sub-tasks, each independently testable.
3. **Test before reporting.** Every new feature is tested before the report is written: happy path, empty input, bad input, upstream failure, mobile width, keyboard use. Report exactly what was tested and the result. Never say "should work".
4. **Check your own work.** Before claiming completion, re-read the requirement and compare line by line. If it does not meet the standard, it is not done. No shortcuts, stubs, fake data or placeholder logic presented as finished work. If something could not be done, say so plainly.
5. **Plan with Opus, execute with Sonnet.** In Plan Mode, Opus writes the plan; Sonnet executes it. Simple CSS changes (colour, size, position) go to Haiku.

## 3. Project rules from Milind

- **Surgical edits only.** Use `str_replace` on the exact lines that change. Never regenerate a whole file.
- **Design is locked.** Grayscale only, IBM Plex Mono / Sans, Anton, REF. labels, equal full-page dividers. Do not change confirmed design elements unless Milind raises them.
- **Respect settled decisions.** Do not re-propose dropped items (YouTube converters, Seamless Set, standalone Liveliness Index) without flagging the earlier reason.
- **Artifact is the live iteration surface; local file is the backup; the deployed Worker is production.**
- **Communication:** answer directly, no preamble, filler or trailing summaries. Plain prose or tight lists.
- **Corrections:** remind once that editing the last message saves tokens.
- **Long sessions:** at 15+ messages, offer once to summarise context for a fresh chat.
- **No web search or extended thinking** unless the task is complex or time-sensitive.

## 4. Enterprise standards

How professional teams ship, scaled to a one-person site:

- **Spec before code.** Each feature starts with a short spec: user goal, inputs/outputs, edge cases, acceptance criteria. Written into the Requirements Tracker.
- **Version control.** Git repo, one branch per feature, small descriptive commits, merge to main only when Done. Tag releases (`v1.4.0`) and note them in the Handoff.
- **Environments.** Preview (artifact / `wrangler dev`) → production. Never test risky changes on production. Keep a rollback path (`wrangler rollback`).
- **Security by default.** Follow Security Handoff section 5 for every endpoint. Secrets only in Worker secrets. Validate all input, escape all output.
- **Resilience.** Every external call has a timeout, a cache and a user-facing fallback state. The page never breaks because one API is down.
- **Accessibility and performance budgets.** WCAG 2.1 AA; Lighthouse ≥ 90; respect `prefers-reduced-motion`. Measure, don't guess.
- **Consistency.** One naming convention, shared CSS variables and components, no duplicated logic. Reuse before adding.
- **Observability.** Log server errors with context in the Worker; never show raw errors to users.
- **Dependencies.** Pin versions; prefer no dependency over a heavy one; check licence and maintenance before adding.
- **Documentation is part of the work.** A feature that isn't reflected in these four docs isn't finished.

## 5. Definition of Done

A task is Done only when every box is true:

- [ ] Meets every acceptance criterion in its spec.
- [ ] Tested: happy path, edge cases, error states, mobile, keyboard. Results recorded.
- [ ] Matches the locked design system.
- [ ] No console errors; no new Lighthouse regressions.
- [ ] Security checklist passed for any Worker change.
- [ ] Self-review completed against the requirement.
- [ ] Handoff, Tracker and (if relevant) Security docs updated.

### Report format

```
Phase: <n of N> — <name>
Built: <what changed, files/functions touched>
Tested: <test → result>
Not done / risks: <honest list, or "none">
Next phase: <proposal> — awaiting approval
```
