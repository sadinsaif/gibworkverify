# Architecture

Gibwork Verity is a small, layered TypeScript CLI. Each layer depends only on the ones
beneath it, and the Gibwork SDK is quarantined behind a single directory.

## Layering

```
cli.ts
  └── commands/*          composition root; one module per command + context.ts (Runtime)
        ├── gibwork/      ← the ONLY place @gibwork/sdk is imported
        ├── analyzer/     requirement-parser → criterion-generator (+ ambiguity)
        ├── verification/ engine → command-check / git-check / file-check / test-check
        ├── evidence/     collector → sanitizer / hasher / manifest
        ├── proof/        receipt / integrity (schema)
        ├── reports/      markdown / json
        └── storage/      paths / state
              └── utils/  errors / logger / output
```

Dependency direction is strictly downward. `analyzer`, `verification`, `evidence`, `proof`,
and `reports` have no knowledge of Gibwork; they operate on plain data. This is what lets the
entire pipeline run — and be tested — with no network.

## The Gibwork boundary

`src/gibwork/` exposes a narrow interface, `VerityGibworkClient`, describing exactly the SDK
methods Verity uses (`tasks.get`, `tasks.listAvailable`, `submissions.prepareCreate`,
`submissions.submitCreate`, `submissions.getIntent`). `createGibworkRuntime()` builds the real
client from a resolved wallet and bundles a `sign()` function (wrapping
`signPreparedTransaction`). Because commands depend on the *interface*, tests inject a fully
in-memory fake — no SDK, no keypair, no network.

SDK errors are translated once, in `gibwork/errors.ts`, into `VerityError` values carrying the
documented exit code. This keeps the SDK's error types out of the rest of the program while
preserving precise, actionable failures (including the ambiguous-transaction case → exit 22).

## Runtime & output discipline

`commands/context.ts` resolves per-invocation config (cwd, environment, timeout, json,
assume-yes) and lazily constructs the Gibwork runtime. Output is split: machine JSON goes to
**stdout** only (`{ ok, data }` / `{ ok, error }`); everything human goes to **stderr**. So a
consumer piping `--json` always gets clean, parseable stdout.

## State

A `.verity/` workspace holds all per-project artifacts: `config.json` (the executable checks),
`bounty.json` (a sanitized snapshot), `checklist.json` (generated criteria + warnings +
readiness), `evidence/` (sanitized evidence files + `manifest.json`), `reports/`, `proofs/`,
and `submission.json` (a secret-free recovery record). All reads are schema-validated with Zod,
so a hand-edited or corrupt file fails loudly.

## Determinism

Given fixed inputs, the analyzer, manifest canonicalization, and proof construction are
deterministic. Non-deterministic inputs (command durations, timestamps) live *inside* captured
evidence — that is expected: a proof is a snapshot of one verification run, and
`verify-proof` checks that *that* snapshot's evidence is unchanged.
