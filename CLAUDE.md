# PARWANI portfolio — instructions for Claude

This file is read automatically at the start of every session in this repo, on any device. It exists so that Claude Code on Milind's other computer and Claude Code here follow the same process and share the same understanding of the project — the docs below are the source of truth, not this laptop's memory.

## Read these first, in order

1. [`docs/session-handoff.md`](docs/session-handoff.md) — project snapshot, architecture, current build state, session log.
2. [`docs/agent-rulebook.md`](docs/agent-rulebook.md) — how to work: phasing, testing, communication style, Definition of Done.
3. [`docs/requirements-tracker.md`](docs/requirements-tracker.md) — status of every requirement, section, project and toolbox item.
4. [`docs/security-handoff.md`](docs/security-handoff.md) — verified security posture, open findings, rules for new endpoints.

State back in two lines what you understand the goal to be and which phase you're starting, per the Rulebook §1. Ask before proceeding if anything is unclear.

## Every push updates the living docs

Three of the four docs are living documents, updated continuously — not just once at the end of a session:

- `docs/session-handoff.md` — add a Session Log entry, update Current Build State and Priorities if they changed.
- `docs/requirements-tracker.md` — move statuses as things ship.
- `docs/security-handoff.md` — add or close findings if the Worker changed.

**Any push that changes the project's state includes the matching doc update in the same commit or PR.** Don't wait until a session ends to write it up — the next device may pull mid-session. If you push code without the docs reflecting it, the other device's next Claude session starts from stale information.

`docs/agent-rulebook.md` is the one exception: it's static. Don't edit it unless Milind explicitly asks for a rule to change.

## The short version of the rules

Grayscale-only design, locked (see Rulebook §3). Surgical edits, not full-file regeneration. Work in phases, get approval before each one. Test before reporting — never "should work". Secrets only via `wrangler secret put`, never committed (see Security Handoff §5 and finding S-10 for why this matters here specifically). Full detail lives in `docs/agent-rulebook.md` — this section is a summary, not a replacement.
