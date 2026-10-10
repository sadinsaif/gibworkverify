# Demo

This walks the full Verity workflow — including the tamper story — **entirely offline**,
against the bundled fixture. No network, no wallet, no Gibwork account required.

The fixture:

- [`fixtures/sample-bounty.json`](../fixtures/sample-bounty.json) — a realistic Gibwork
  `TaskDetails` object (the bounty "input").
- [`fixtures/sample-project/`](../fixtures/sample-project) — a tiny TypeScript project with a
  passing test, a build/check script, and a README (the "work").

## 0. Build

```bash
npm install
npm run build
```

## 1. Run the workflow

From the repository root (using `--cwd` so nothing needs to be installed in the fixture):

```bash
node dist/cli.js init                 --cwd fixtures/sample-project
node dist/cli.js bounty init          --cwd fixtures/sample-project --from-file fixtures/sample-bounty.json
node dist/cli.js verify               --cwd fixtures/sample-project
node dist/cli.js prove                --cwd fixtures/sample-project
node dist/cli.js report               --cwd fixtures/sample-project
```

`bounty init` turns the bounty into criteria and seeds executable checks; note it flags the
"fast and user-friendly" requirement as **ambiguous**. `verify` runs the configured checks
(`npm test` and `npm run build` PASS; the README file check PASSES; unconfigured/CLI and
not-a-repo checks SKIP). `prove` writes `.verity/proofs/proof.json` with a root hash; `report`
writes Markdown + JSON.

## 2. Verify the proof (valid)

```bash
node dist/cli.js verify-proof fixtures/sample-project/.verity/proofs/proof.json
```

```
✓ PROOF VALID
  root hash    9c0a64a4…591e
  evidence     8 item(s), all intact
```

## 3. Tamper, then detect it

Change any collected evidence file, then re-check the proof:

```bash
printf '\n' >> fixtures/sample-project/.verity/evidence/check-include-a-readme-md.json
node dist/cli.js verify-proof fixtures/sample-project/.verity/proofs/proof.json
```

```
✗ PROOF INVALID

  expected     9c0a64a4…591e
  calculated   084de5ee…f18b

  Changed evidence: check-include-a-readme-md
  Evidence has changed since the proof was created.
```

The command exits non-zero (code `1`), and `--json` reports `{ "valid": false, … }`.

## 4. Re-verify and re-prove (fresh valid proof)

```bash
node dist/cli.js verify --cwd fixtures/sample-project
node dist/cli.js prove  --cwd fixtures/sample-project
node dist/cli.js verify-proof fixtures/sample-project/.verity/proofs/proof.json   # ✓ PROOF VALID
```

## Notes

- Replace `--cwd fixtures/sample-project … --from-file …` with a real `verity bounty init
  <TASK_ID>` inside your own repo to use a live bounty (requires network; the SDK uses an
  auto-generated read-only wallet).
- `verity submit <TASK_ID>` is **not** part of the offline demo: it performs a real, paid,
  on-chain submission and requires a funded wallet (`GIBWORK_PRIVATE_KEY`). Its flow is covered
  by the mocked integration tests in `tests/integration/submit-flow.test.ts`.
- Clean up the demo workspace at any time: `rm -rf fixtures/sample-project/.verity`.
