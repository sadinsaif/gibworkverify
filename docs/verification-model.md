# Verification model

Verity's verification is deliberately conservative: it reports what it can prove, flags what it
cannot, and never claims a check passed unless that check actually ran.

## Criteria

`verity bounty init` parses the bounty into **acceptance criteria**, each classified as one of:

| Type | Meaning | Verified by |
| --- | --- | --- |
| `test` | automated tests must pass | a configured test command |
| `command` | something runnable (build/lint/CLI) | a configured command |
| `file` | a file/path must exist | filesystem check |
| `git` | repository state (e.g. has commits) | read-only git |
| `manual` | needs human judgment | reviewer (reported WARN) |
| `informational` | context, not an acceptance test | — (reported SKIP) |

A requirement whose only signal is vague ("fast", "clean", "user-friendly") becomes `manual`
and raises an **ambiguity warning**. The **readiness score** = machine-verifiable,
non-ambiguous criteria ÷ total.

Crucially, a command found inside untrusted bounty text is recorded only as a *suggestion*; it
is never promoted into an executable step.

## Checks and statuses

The engine runs the checks listed in `.verity/config.json` (seeded from the verifiable criteria
during `bounty init`, then yours to edit). Each produces:

```
{ id, type, status, description, evidence, durationMs, error }
```

- **PASS** — the check ran and its condition held (e.g. command exited 0, file exists).
- **FAIL** — the check ran and failed, was refused as dangerous, or timed out.
- **WARN** — a manual criterion needing review.
- **SKIP** — not applicable or not configured (e.g. no command, or not a git repo).

A **PASS is never produced for a check that did not execute.**

## Command-execution safety

Commands are only ever taken from your local config. Before anything runs:

1. **Denylist (refused).** `rm -rf`, `sudo`/`doas`, `mkfs`, `dd if=`, broad `chmod`/`chown`,
   `curl|wget … | sh`, redirects to devices, fork bombs, `shutdown`/`reboot`, `git push`,
   `format <drive>`, `del /s`, … These return FAIL and are **not executed**.
2. **Allowlist (no prompt).** Common build/test commands (`npm test`, `npm run …`, `tsc`,
   `vitest`, `pytest`, `cargo test`, `go test`, `make test`, …) run directly.
3. **Everything else requires confirmation** — an interactive `y/N`, or `--yes`. Without
   authorization it is **SKIPPED**, never silently run.

Output is captured with a hard per-stream byte cap and a kill-on-timeout, so a runaway command
can neither exhaust memory nor hang the tool. Git is always spawned with an explicit argv and
no shell, read-only.

## Submission gating

`verity submit` requires every **mandatory** check to pass before it will proceed, then
generates a proof and report, shows the exact payload, and asks for explicit confirmation
before the paid on-chain mutation.
