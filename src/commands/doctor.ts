import { runArgv } from '../verification/command-check.js';
import { ping } from '../gibwork/tasks.js';
import { info, c } from '../utils/logger.js';
import { emitJson, kv, section } from '../utils/output.js';
import { workspaceExists } from '../storage/state.js';
import type { Runtime } from './context.js';

/** Environment + connectivity diagnostics. Read-only; never fails the process. */
export async function doctorCmd(rt: Runtime): Promise<void> {
  const nodeVersion = process.version;
  const nodeMajor = Number.parseInt(nodeVersion.replace(/^v/, '').split('.')[0] ?? '0', 10);
  const nodeOk = nodeMajor >= 22;

  let gitVersion: string | null = null;
  try {
    const r = await runArgv('git', ['--version'], { timeoutMs: 10_000 });
    if (r.code === 0) gitVersion = r.stdout.trim();
  } catch {
    gitVersion = null;
  }

  let wallet: { mode?: string; publicKey?: string; error?: string } = {};
  let gibwork: { reachable: boolean; total?: number; error?: string } = { reachable: false };
  try {
    const gw = rt.gibwork();
    wallet = { mode: gw.wallet.mode, publicKey: gw.wallet.publicKey };
    try {
      const probe = await ping(gw.client);
      gibwork = { reachable: probe.reachable, total: probe.total };
    } catch (err) {
      gibwork = { reachable: false, error: err instanceof Error ? err.message : String(err) };
    }
  } catch (err) {
    wallet = { error: err instanceof Error ? err.message : String(err) };
  }

  const workspace = workspaceExists(rt.paths);

  const data = {
    node: { version: nodeVersion, ok: nodeOk, required: '>=22' },
    platform: process.platform,
    environment: rt.config.environment,
    git: { available: gitVersion !== null, version: gitVersion },
    wallet,
    gibwork,
    workspace: { exists: workspace, path: rt.paths.root },
  };

  if (rt.json) {
    emitJson(data);
    return;
  }

  info(section('verity doctor'));
  info(kv('node', `${nodeVersion} ${nodeOk ? c.green('(ok)') : c.red('(needs >=22)')}`));
  info(kv('platform', process.platform));
  info(kv('env', rt.config.environment));
  info(kv('git', gitVersion ? c.green(gitVersion) : c.yellow('not found')));
  if (wallet.error) {
    info(kv('wallet', c.yellow(wallet.error)));
  } else {
    info(kv('wallet', `${wallet.mode} (${wallet.publicKey})`));
  }
  if (gibwork.reachable) {
    info(kv('gibwork', c.green(`reachable (${gibwork.total} tasks available)`)));
  } else {
    info(kv('gibwork', c.yellow(`unreachable${gibwork.error ? ` — ${gibwork.error}` : ''}`)));
  }
  info(kv('workspace', workspace ? rt.paths.root : c.dim('none (run `verity init`)')));
}
