# verity-sample-project

A tiny TypeScript utility used to demonstrate **Gibwork Verity** end-to-end,
entirely offline. It exposes a single `greet(name)` function and a minimal CLI.

## Usage

```bash
node --experimental-strip-types src/greet.ts Ada
# → Hello, Ada!
```

## Scripts

- `npm test` — run the unit tests with Node's built-in test runner.
- `npm run build` — type-check/syntax-check the source.

No dependencies are required (Node 22+ runs the TypeScript sources directly).
