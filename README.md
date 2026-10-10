# Gibwork Verity

> **From bounty requirements to verifiable proof.**

Gibwork Verity is a **terminal-first** developer verification tool for the Gibwork
Developer Hackathon. It takes a Gibwork bounty, turns its requirements into explicit
acceptance criteria, verifies your local implementation with deterministic checks,
collects Git/test/file/command evidence, hashes that evidence into a **tamper-evident
Proof-of-Completion receipt**, generates Markdown/JSON reports, and can **submit** the
verified work to Gibwork through the official SDK.

It is a CLI. There is no web app, no server, and no browser UI — by design.

---

## 1. What is Gibwork Verity?

A single binary, `verity`, that runs next to your Git checkout. It joins two sources of
truth:

- **Gibwork** — what the bounty asked for (fetched through the official `@gibwork/sdk`).
- **Your repository** — what you actually did (Git state, tests, build, required files).

…and produces a verifiable deliverable: a per-criterion verification result, a SHA-256
**root hash** over all collected evidence, a signed-off-free **proof receipt** you can
re-check at any time, and human/machine reports. Optionally, it submits the work.

## 2. The problem

After finishing a bounty, developers assemble proof of completion by hand: re-reading the
requirements, re-running the build, listing changed files and commits, pasting output, and
writing a summary. It is tedious, inconsistent, and easy to fudge — intentionally or not.
A reviewer, in turn, has no cheap way to tell whether the "evidence" in a submission still
matches the code.

## 3. Why this is different

- **Requirements → explicit criteria.** Verity parses the bounty into typed acceptance
  criteria and is honest about what it *cannot* verify (it flags ambiguous language instead
  of pretending to check it).
- **Deterministic verification.** Checks either ran and passed, or they did not. Verity
  never reports PASS for a check it did not actually execute.
- **Tamper-evident proof.** Evidence is SHA-256-hashed into a canonical manifest with a
  single root hash. `verity verify-proof` recomputes it; if any evidence changed, it fails
  loudly with the expected vs. calculated hash.
- **Real submission, done safely.** `verity submit` uses the official SDK's prepare → sign →
  submit flow with a confirmation gate, idempotency, and no blind retries.

This targets the **post-completion / submission** step of a bounty's life cycle — distinct
from discovery, tracking, or dashboards.

## 4. Architecture

```
src/
  cli.ts                 Commander wiring, exit codes, --json
  commands/              one module per command (+ context.ts runtime)
  gibwork/               ALL @gibwork/sdk usage lives here (client, tasks, submissions, wallet, errors)
  analyzer/              requirement-parser · criterion-generator · ambiguity
  verification/          engine · command-check · git-check · file-check · test-check
  evidence/              collector · sanitizer · hasher · manifest
  proof/                 schema · receipt · integrity
  reports/               markdown · json
  storage/               paths · state
  utils/                 errors · logger · output
```

Data flows one way: `analyzer → verification → evidence → proof → reports`, with `gibwork/`
isolated behind a narrow, dependency-injectable interface so the whole tool is testable with
zero network. See [docs/architecture.md](docs/architecture.md).

## 5. Installation

Requires **Node.js ≥ 22**.

```bash
git clone https://github.com/sadinsaif/gibwork-verity.git
cd gibwork-verity
npm install
npm run build
```

Run with `node dist/cli.js <command>`, or link it onto your PATH:

```bash
npm link
verity --help
```

During development you can skip the build:

```bash
npm run dev -- doctor
```

## 6. Configuration

Everything is optional for read/verify flows — Verity runs zero-config. It reads environment
variables directly and **never loads a `.env` file implicitly**. See [`.env.example`](.env.example).

| Variable | Default | Meaning |
| --- | --- | --- |
| `GIBWORK_ENV` | `production` | Gibwork environment: `production` or `stage` |
| `VERITY_TIMEOUT_MS` | `20000` | Gibwork API timeout (ms) |
| `GIBWORK_PRIVATE_KEY` | — | wallet secret key (base58 or JSON byte array) — **required for `submit`** |
| `GIBWORK_KEYPAIR_PATH` | — | path to a Solana keypair JSON file |
| `VERITY_HOME` | per-OS | directory for the auto-generated read-only key |

Per-command flags: `--json`, `--cwd <dir>`, `--env <production\|stage>`, `--timeout <ms>`,
`--yes` (assume yes), and `--from-file <path>` (read task details from a local file instead
of the network).

## 7. Gibwork setup

The Gibwork API is **wallet-authenticated**, even for reads — there is no API key. Verity
resolves a wallet in this order:

1. `GIBWORK_PRIVATE_KEY`
2. `GIBWORK_KEYPAIR_PATH`
3. An **auto-generated, read-only** keypair stored under your per-user app directory
   (`%APPDATA%\gibwork-verity` on Windows, `~/Library/Application Support/gibwork-verity`
   on macOS, `$XDG_CONFIG_HOME/gibwork-verity` on Linux), created with `0600` permissions.

The auto-generated key needs no funds; it only signs read requests. **`verity submit`
performs a real, paid on-chain submission** and therefore refuses the read-only key — you
must provide your own funded, eligible wallet via one of the env vars above.

## 8. CLI commands

```
verity doctor                      Environment & read-only connectivity checks
verity init                        Scaffold a .verity/ workspace
verity status                      Summarize the local workspace

verity bounty inspect <TASK_ID>    Fetch a bounty + parsed criteria + readiness score
verity bounty init    <TASK_ID>    Link a bounty: store snapshot, criteria, and seed config
verity bounty status  <TASK_ID>    Show a bounty's remote status

verity check [--criterion <ID>]    Run configured verification checks
verity verify                      Full verification (checks + manual criteria)

verity evidence list               List evidence items + root hash
verity evidence show <ID>          Show one evidence item

verity prove                       Collect evidence and write the proof receipt
verity report                      Generate Markdown + JSON reports
verity verify-proof <PROOF_FILE>   Recompute and verify a proof (tamper check)

verity submit <TASK_ID>            Verify → prove → report → submit (paid, on-chain)
verity submission status <INTENT>  Reconcile a submission intent (recovery)
```

Every command accepts `--json`: on stdout you get only a `{ "ok": true, "data": … }` (or
`{ "ok": false, "error": … }`) envelope; all human output goes to stderr. `bounty inspect`
and `bounty init` also accept `--from-file <path>`.

## 9. Example workflow

```bash
verity init
verity bounty init 123e4567-e89b-12d3-a456-426614174000
verity check
verity verify
verity prove
verity report
verity verify-proof .verity/proofs/proof.json
verity submit 123e4567-e89b-12d3-a456-426614174000 --yes
```

## 10. Verification model

Each check returns `{ id, status, description, evidence, durationMs, error }` with a status of
**PASS / FAIL / WARN / SKIP**. Checks come only from the local `.verity/config.json` you
control — never from untrusted bounty text. Command execution is guarded by a dangerous-pattern
denylist (`rm -rf`, `sudo`, `curl | sh`, `git push`, …), a safe allowlist, and an explicit
confirmation for anything else. Full details: [docs/verification-model.md](docs/verification-model.md).

## 11. Proof format

`verity prove` writes `.verity/proofs/proof.json`:

```json
{
  "schemaVersion": "1.0",
  "tool": { "name": "gibwork-verity", "version": "0.1.0" },
  "bounty": { "platform": "gibwork", "taskId": "…" },
  "repository": { "commit": "…", "branch": "…" },
  "verification": { "passed": 0, "failed": 0, "warnings": 0 },
  "evidence": [ { "id": "…", "type": "…", "path": "…", "sha256": "…", "size": 0, "createdAt": "…" } ],
  "rootHash": "…",
  "createdAt": "…"
}
```

The **root hash** is `SHA-256` over a canonical manifest: evidence entries are sorted by `id`,
every object key is sorted recursively, and the structure is serialized with no insignificant
whitespace. The hash deliberately excludes its own value and the wall-clock `createdAt`, so it
is reproducible. `verify-proof` re-reads each evidence file, recomputes its hash and the root
hash, and compares. It contains **no secrets**.

## 12. Security

- **Read-only by default.** Only `submit` mutates anything remote, and only behind an explicit
  confirmation (or `--yes`) and a funded wallet. No command touches Git history or pushes.
- **No blind retries.** The submission flow persists recovery identifiers *before* paying and
  surfaces an ambiguous transaction as its own exit code (22) with a recovery hint — it never
  resubmits an uncertain payment.
- **Secrets never leak.** Private keys are never printed, written to evidence/reports, or
  committed. All evidence is passed through a redactor (keys, tokens, `Authorization` headers,
  URL credentials, secret-looking env values) *before* it is written or hashed.
- **Dangerous commands are refused** outright; non-allowlisted commands require confirmation.
- The root hash is an **integrity checksum, not a digital signature** — it detects evidence
  drift, not a motivated forger who regenerates a fresh proof.

## 13. Development

```bash
npm run dev -- <command>   # run from source (Node strips types)
npm run typecheck          # tsc --noEmit (strict, NodeNext ESM)
npm run lint               # eslint (flat config + typescript-eslint)
npm run build              # compile to dist/
```

## 14. Testing

```bash
npm test                   # unit + integration (offline, deterministic)
npm run test:live          # OPT-IN: hits the real Gibwork API (read-only)
```

Tests cover requirement parsing, ambiguity detection, SHA-256 hashing, manifest
canonicalization, proof creation/verification, **tamper detection**, command-result handling,
and secret redaction. Integration tests use a mocked Gibwork client injected via the SDK
interface — **no real key is needed, and CI never uses one.**

## 15. Demo

A tiny TypeScript project under [`fixtures/sample-project/`](fixtures/sample-project) lets you
run the whole flow — including the tamper story — entirely offline. See
[docs/demo.md](docs/demo.md).

## 16. Limitations

- Criteria are **heuristic**: parsed from free-form text, they accelerate a reviewer but do not
  replace one. Verity marks what it cannot verify as `manual`/ambiguous rather than guessing.
- Executable checks run only commands you configure locally; a criterion with no configured
  command is reported `SKIP`, not PASS.
- Git evidence reflects the repository containing the working directory; outside a repo, git
  checks `SKIP`.
- The proof's root hash is tamper-*evident*, not tamper-*proof* (no signing key).
- The SDK has no participant lookup by submission id; recovery is by `(taskId, intentId)` via a
  locally persisted record (see `submission status`).

## 17. Hackathon submission notes

- **Uses the Gibwork SDK as a core integration** — `@gibwork/sdk@0.2.0` is the only path to
  Gibwork, isolated behind `src/gibwork/`. Exact methods used: `createGibworkClient` /
  `createKeypairSigner` / `signPreparedTransaction` (from `@gibwork/sdk/node`), `tasks.get`,
  `tasks.listAvailable`, `submissions.prepareCreate`, `submissions.submitCreate`,
  `submissions.getIntent`, and the typed error classes.
- **Non-web** — a terminal CLI, no server or browser.
- **A genuinely new use case** — tamper-evident proof-of-completion and safe submission, not a
  tracker/dashboard.
- **Honest** — no fake transactions, submissions, wallets, or API responses in production code;
  mocks exist only in tests and are clearly labeled.

## License

[MIT](LICENSE)
