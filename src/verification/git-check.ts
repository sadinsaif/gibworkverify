import { runArgv } from './command-check.js';
import type { CheckOutcome } from './engine.js';

/**
 * Read-only Git evidence. Every git invocation uses an explicit argv and NO
 * shell, so repository data can never be interpreted as shell syntax. Verity
 * never commits, pushes, checks out, or rewrites history.
 */

export interface GitCommit {
  sha: string;
  subject: string;
}

export interface GitInfo {
  isRepo: boolean;
  commit: string | null;
  shortCommit: string | null;
  branch: string | null;
  clean: boolean;
  changedFiles: string[];
  diffStat: string | null;
  recentCommits: GitCommit[];
  remote: string | null;
}

export function emptyGitInfo(): GitInfo {
  return {
    isRepo: false,
    commit: null,
    shortCommit: null,
    branch: null,
    clean: true,
    changedFiles: [],
    diffStat: null,
    recentCommits: [],
    remote: null,
  };
}

async function tryGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    const r = await runArgv('git', args, { cwd, timeoutMs: 15_000 });
    return r.code === 0 ? r.stdout.trim() : null;
  } catch {
    return null;
  }
}

/** Gather read-only Git state for a directory. Returns isRepo:false if not a repo. */
export async function collectGitInfo(cwd: string): Promise<GitInfo> {
  const inside = await tryGit(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (inside !== 'true') return emptyGitInfo();

  const commit = await tryGit(cwd, ['rev-parse', 'HEAD']);
  const branch = await tryGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const status = await tryGit(cwd, ['status', '--porcelain']);
  const changedFiles = status
    ? status.split('\n').filter(Boolean).map((line) => line.slice(3))
    : [];
  const diffStat = commit
    ? await tryGit(cwd, ['diff', '--stat', 'HEAD'])
    : await tryGit(cwd, ['diff', '--stat']);
  const logOut = await tryGit(cwd, ['log', '-n', '10', '--pretty=format:%H%x09%s']);
  const recentCommits: GitCommit[] = logOut
    ? logOut
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [sha, ...rest] = line.split('\t');
          return { sha: sha ?? '', subject: rest.join('\t') };
        })
    : [];
  const remote = await tryGit(cwd, ['remote', 'get-url', 'origin']);

  return {
    isRepo: true,
    commit,
    shortCommit: commit ? commit.slice(0, 7) : null,
    branch: branch || null,
    clean: changedFiles.length === 0,
    changedFiles,
    diffStat: diffStat || null,
    recentCommits,
    remote,
  };
}

export interface GitExpectations {
  requireClean?: boolean;
  requireCommits?: boolean;
}

export interface GitCheckSpec {
  id: string;
  description: string;
  git?: GitExpectations;
}

/** Evaluate a git check against the repo state. SKIP when not in a repo. */
export async function gitCheck(spec: GitCheckSpec, cwd: string): Promise<CheckOutcome> {
  const base = { id: spec.id, type: 'git' as const, description: spec.description };
  const info = await collectGitInfo(cwd);

  if (!info.isRepo) {
    return {
      ...base,
      status: 'SKIP',
      evidence: 'Not a git repository.',
      durationMs: 0,
      error: null,
      detail: { ...info },
    };
  }

  const problems: string[] = [];
  const exp = spec.git ?? {};
  if (exp.requireCommits && !info.commit) problems.push('no commits found');
  if (exp.requireClean && !info.clean) {
    problems.push(`working tree is dirty (${info.changedFiles.length} changed file(s))`);
  }

  const state = `${info.branch ?? 'DETACHED'} @ ${info.shortCommit ?? 'none'}, ${
    info.clean ? 'clean' : `${info.changedFiles.length} changed`
  }`;

  return {
    ...base,
    status: problems.length === 0 ? 'PASS' : 'FAIL',
    evidence: state,
    durationMs: 0,
    error: problems.length === 0 ? null : problems.join('; '),
    detail: { ...info },
  };
}
