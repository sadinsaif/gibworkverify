import type { ReportModel } from './json.js';
import { DISCLAIMER } from './json.js';
import type { VerificationResult } from '../verification/engine.js';

/** Markdown rendering of the report model. */

function statusMark(status: string): string {
  switch (status) {
    case 'PASS':
      return '✓ PASS';
    case 'FAIL':
      return '✗ FAIL';
    case 'WARN':
      return '! WARN';
    default:
      return '· SKIP';
  }
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function resultsTable(results: VerificationResult[]): string {
  if (results.length === 0) return '_No checks were run._';
  const rows = results.map(
    (r) =>
      `| ${statusMark(r.status)} | ${escapeCell(r.id)} | ${escapeCell(r.type)} | ${
        r.mandatory ? 'yes' : 'no'
      } | ${escapeCell(r.evidence)} |`,
  );
  return ['| Status | Check | Type | Mandatory | Evidence |', '| --- | --- | --- | --- | --- |', ...rows].join(
    '\n',
  );
}

function criteriaTable(model: ReportModel): string {
  if (model.criteria.length === 0) return '_No acceptance criteria were generated._';
  const rows = model.criteria.map(
    (c) =>
      `| ${escapeCell(c.id)} | ${escapeCell(c.type)} | ${c.mandatory ? 'yes' : 'no'} | ${
        c.ambiguous ? 'yes' : 'no'
      } | ${escapeCell(c.description)} |`,
  );
  return ['| Id | Type | Mandatory | Ambiguous | Requirement |', '| --- | --- | --- | --- | --- |', ...rows].join(
    '\n',
  );
}

function rewardLine(model: ReportModel): string {
  const reward = model.bounty?.reward;
  if (!reward) return 'n/a';
  const usd = reward.priceUsd != null ? ` (~$${reward.priceUsd})` : '';
  return `${reward.amount} ${reward.symbol}${usd}`;
}

export function renderMarkdownReport(model: ReportModel): string {
  const b = model.bounty;
  const v = model.verification;
  const g = model.git;
  const lines: string[] = [];

  lines.push('# Gibwork Verity — Verification Report', '');
  lines.push(`_Generated ${model.generatedAt} by ${model.tool.name} v${model.tool.version}._`, '');

  lines.push('## Bounty', '');
  if (b) {
    lines.push(`- **Title:** ${b.title}`);
    lines.push(`- **Task ID:** ${b.taskId}`);
    lines.push(`- **Reward:** ${rewardLine(model)}`);
    lines.push(`- **Status:** ${b.status}${b.isOpen ? ' (open)' : ''}`);
    lines.push(`- **Tags:** ${b.tags.length ? b.tags.join(', ') : 'none'}`);
    lines.push(`- **URL:** ${b.url}`);
  } else {
    lines.push('_No bounty is linked to this workspace._');
  }
  lines.push('');

  if (model.readiness) {
    lines.push('## Requirement readiness', '');
    lines.push(
      `- **Machine-verifiable criteria:** ${model.readiness.verifiable} / ${model.readiness.total}`,
    );
    lines.push(`- **Readiness score:** ${model.readiness.score}`);
    lines.push('');
  }

  lines.push('## Acceptance criteria', '', criteriaTable(model), '');

  lines.push('## Verification results', '');
  lines.push(
    `**${v.passed} passed · ${v.failed} failed · ${v.warnings} warnings · ${v.skipped} skipped** (of ${v.total})`,
    '',
  );
  lines.push(resultsTable(v.results), '');

  lines.push('## Repository', '');
  if (g.isRepo) {
    lines.push(`- **Commit:** ${g.commit ?? 'none'}${g.branch ? ` (${g.branch})` : ''}`);
    lines.push(`- **Working tree:** ${g.clean ? 'clean' : `${g.changedFiles.length} changed file(s)`}`);
    if (g.remote) lines.push(`- **Remote:** ${g.remote}`);
    if (g.diffStat) {
      lines.push('', '```', g.diffStat, '```');
    }
    if (g.recentCommits.length) {
      lines.push('', '**Recent commits:**');
      for (const c of g.recentCommits.slice(0, 5)) {
        lines.push(`- \`${c.sha.slice(0, 7)}\` ${c.subject}`);
      }
    }
  } else {
    lines.push('_Not a git repository._');
  }
  lines.push('');

  lines.push('## Evidence', '');
  lines.push(`- **Items:** ${model.evidenceCount}`);
  lines.push(`- **Root hash:** \`${model.rootHash ?? 'not generated'}\``);
  if (model.proofCreatedAt) lines.push(`- **Proof created:** ${model.proofCreatedAt}`);
  lines.push('');

  lines.push('## Ambiguity warnings', '');
  if (model.warnings.length === 0) {
    lines.push('_None._');
  } else {
    for (const w of model.warnings) {
      lines.push(`- **${w.term}** — ${w.message}`);
    }
  }
  lines.push('');

  lines.push('---', '', `> ${DISCLAIMER}`, '');
  return lines.join('\n');
}
