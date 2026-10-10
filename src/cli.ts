#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Command } from 'commander';
import { resolveRuntimeConfig, createRuntime, type RuntimeFlags, type Runtime } from './commands/context.js';
import { setJsonMode, errline, c } from './utils/logger.js';
import { emitJsonError } from './utils/output.js';
import { exitCodeFor, errorEnvelope, ExitCode } from './utils/errors.js';
import { doctorCmd } from './commands/doctor.js';
import { initCmd } from './commands/init.js';
import { statusCmd } from './commands/status.js';
import { bountyInspectCmd, bountyInitCmd, bountyStatusCmd } from './commands/bounty.js';
import { checkCmd } from './commands/check.js';
import { verifyCmd, verifyProofCmd } from './commands/verify.js';
import { evidenceListCmd, evidenceShowCmd } from './commands/evidence.js';
import { proveCmd } from './commands/prove.js';
import { reportCmd } from './commands/report.js';
import { submitCmd, submissionStatusCmd } from './commands/submit.js';

function readVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const VERSION = readVersion();

interface CommonOpts extends RuntimeFlags {
  criterion?: string;
  demo?: string;
  link?: string[];
}

function collectLink(value: string, previous: string[] = []): string[] {
  return previous.concat([value]);
}

/** Attach the options shared by every command. */
function common(cmd: Command): Command {
  return cmd
    .option('-j, --json', 'emit machine-readable JSON on stdout')
    .option('--cwd <dir>', 'project directory to operate on (default: current directory)')
    .option('--env <env>', 'Gibwork environment: production | stage')
    .option('--timeout <ms>', 'Gibwork API timeout in milliseconds')
    .option('-y, --yes', 'assume yes for confirmations (non-interactive)')
    .option('--from-file <path>', 'read task details from a local JSON file instead of Gibwork');
}

function runtimeFrom(opts: CommonOpts): Runtime {
  setJsonMode(Boolean(opts.json));
  const flags: RuntimeFlags = {
    cwd: opts.cwd,
    env: opts.env,
    timeout: opts.timeout,
    json: opts.json,
    yes: opts.yes,
    fromFile: opts.fromFile,
  };
  return createRuntime(resolveRuntimeConfig(flags), VERSION);
}

async function runSafely(json: boolean, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const { code, message } = errorEnvelope(err);
    if (json) emitJsonError(code, message);
    else errline(c.red('✗ ') + message);
    process.exitCode = exitCodeFor(err);
  }
}

const program = new Command();

program
  .name('verity')
  .description('Gibwork Verity — from bounty requirements to verifiable proof.')
  .version(VERSION, '-v, --version', 'print version')
  .showHelpAfterError();

common(program.command('doctor').description('run environment & connectivity checks')).action(
  async (opts: CommonOpts) => {
    const rt = runtimeFrom(opts);
    await runSafely(rt.json, () => doctorCmd(rt));
  },
);

common(program.command('init').description('scaffold a .verity workspace')).action(
  async (opts: CommonOpts) => {
    const rt = runtimeFrom(opts);
    await runSafely(rt.json, () => initCmd(rt));
  },
);

common(program.command('status').description('summarize the local .verity workspace')).action(
  async (opts: CommonOpts) => {
    const rt = runtimeFrom(opts);
    await runSafely(rt.json, () => statusCmd(rt));
  },
);

// bounty <subcommand>
const bounty = program.command('bounty').description('inspect and link a Gibwork bounty');
common(
  bounty.command('inspect').argument('[taskId]', 'Gibwork task id or URL').description('fetch and display a bounty + parsed criteria'),
).action(async (taskId: string | undefined, opts: CommonOpts) => {
  const rt = runtimeFrom(opts);
  await runSafely(rt.json, () => bountyInspectCmd(taskId, rt));
});
common(
  bounty.command('init').argument('[taskId]', 'Gibwork task id or URL').description('link a bounty: store snapshot, criteria, and config'),
).action(async (taskId: string | undefined, opts: CommonOpts) => {
  const rt = runtimeFrom(opts);
  await runSafely(rt.json, () => bountyInitCmd(taskId, rt));
});
common(
  bounty.command('status').argument('[taskId]', 'Gibwork task id or URL').description('show a bounty’s remote status'),
).action(async (taskId: string | undefined, opts: CommonOpts) => {
  const rt = runtimeFrom(opts);
  await runSafely(rt.json, () => bountyStatusCmd(taskId, rt));
});

common(
  program.command('check').option('--criterion <id>', 'run only the check with this id').description('run configured verification checks'),
).action(async (opts: CommonOpts) => {
  const rt = runtimeFrom(opts);
  await runSafely(rt.json, () => checkCmd(rt, opts.criterion));
});

common(program.command('verify').description('run full verification (checks + manual criteria)')).action(
  async (opts: CommonOpts) => {
    const rt = runtimeFrom(opts);
    await runSafely(rt.json, () => verifyCmd(rt));
  },
);

// evidence <subcommand>
const evidence = program.command('evidence').description('inspect collected evidence');
common(evidence.command('list').description('list evidence items + root hash')).action(
  async (opts: CommonOpts) => {
    const rt = runtimeFrom(opts);
    await runSafely(rt.json, () => evidenceListCmd(rt));
  },
);
common(evidence.command('show').argument('<id>', 'evidence item id').description('show one evidence item')).action(
  async (id: string, opts: CommonOpts) => {
    const rt = runtimeFrom(opts);
    await runSafely(rt.json, () => evidenceShowCmd(id, rt));
  },
);

common(program.command('prove').description('collect evidence and write the proof receipt')).action(
  async (opts: CommonOpts) => {
    const rt = runtimeFrom(opts);
    await runSafely(rt.json, () => proveCmd(rt));
  },
);

common(program.command('report').description('generate Markdown + JSON reports')).action(
  async (opts: CommonOpts) => {
    const rt = runtimeFrom(opts);
    await runSafely(rt.json, () => reportCmd(rt));
  },
);

common(
  program
    .command('submit')
    .argument('<taskId>', 'Gibwork task id or URL')
    .option('--demo <url>', 'demo URL to include in the submission')
    .option('--link <url>', 'additional link (repeatable)', collectLink)
    .description('verify, prove, and submit work to Gibwork (paid, on-chain)'),
).action(async (taskId: string, opts: CommonOpts) => {
  const rt = runtimeFrom(opts);
  await runSafely(rt.json, () => submitCmd(taskId, rt, { demo: opts.demo, link: opts.link }));
});

// submission <subcommand>
const submission = program.command('submission').description('recover a submission by intent id');
common(
  submission.command('status').argument('<intentId>', 'submission intent id').description('read a submission intent’s status'),
).action(async (intentId: string, opts: CommonOpts) => {
  const rt = runtimeFrom(opts);
  await runSafely(rt.json, () => submissionStatusCmd(intentId, rt));
});

common(
  program.command('verify-proof').argument('<proofFile>', 'path to a proof.json').description('recompute and verify a proof (tamper check)'),
).action(async (proofFile: string, opts: CommonOpts) => {
  const rt = runtimeFrom(opts);
  await runSafely(rt.json, () => verifyProofCmd(proofFile, rt));
});

program.addHelpText(
  'after',
  `
Example workflow:
  $ verity init
  $ verity bounty init <TASK_ID>
  $ verity check
  $ verity verify
  $ verity prove
  $ verity report
  $ verity verify-proof .verity/proofs/proof.json
  $ verity submit <TASK_ID> --yes

Exit codes:
  0 success · 1 verification failure · 2 invalid input · 10 config/credential
  20 Gibwork API · 21 network · 22 ambiguous transaction · 130 interrupted

Verity is read-only against Gibwork except for \`submit\`, which performs an
explicit, confirmed, paid on-chain submission. It never pushes or rewrites Git.
`,
);

process.on('SIGINT', () => {
  process.exit(ExitCode.Interrupted);
});

async function main(): Promise<void> {
  if (process.argv.length <= 2) {
    program.outputHelp();
    return;
  }
  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  errline(c.red('✗ ') + (err instanceof Error ? err.message : String(err)));
  process.exitCode = exitCodeFor(err);
});
