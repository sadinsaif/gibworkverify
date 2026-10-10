# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-05

### Added

- Initial release of **Gibwork Verity**, a terminal-first developer verification tool.
- Gibwork integration via the official `@gibwork/sdk` (v0.2.0), isolated behind `src/gibwork/`:
  read a bounty (`tasks.get`), a read-only connectivity probe (`tasks.listAvailable`), and the
  explicit prepare → sign → submit flow with intent recovery.
- Deterministic requirement analyzer: parser, criterion classifier (command/file/git/test/
  manual/informational), ambiguity detection, and a requirement-readiness score.
- Deterministic verification engine with command, file, git, and test checks; a command safety
  model (dangerous-pattern denylist, safe allowlist, explicit confirmation).
- Evidence collection with secret sanitization, SHA-256 hashing, and a canonical manifest.
- Tamper-evident Proof-of-Completion receipts (`proof.json`) and `verify-proof` recomputation.
- Markdown + JSON reports.
- `verity submit` wired to the real SDK submission flow with a confirmation gate, idempotency
  key persistence, and no-blind-retry recovery semantics.
- CLI: `doctor`, `init`, `status`, `bounty inspect|init|status`, `check`, `verify`,
  `evidence list|show`, `prove`, `report`, `submit`, `submission status`, `verify-proof`,
  all with `--json`.
- Unit + integration tests (Vitest), an opt-in live SDK test, a demo fixture, docs, and CI.

[0.1.0]: https://github.com/sadinsaif/gibwork-verity/releases/tag/v0.1.0
