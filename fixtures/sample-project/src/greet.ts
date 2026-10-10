/** A tiny greeting utility — the thing the sample bounty asks for. */
export function greet(name: string): string {
  const trimmed = name.trim();
  return `Hello, ${trimmed.length > 0 ? trimmed : 'world'}!`;
}

// Minimal CLI entrypoint: `node --experimental-strip-types src/greet.ts <name>`
if (import.meta.url === `file://${process.argv[1]}`) {
  const name = process.argv.slice(2).join(' ');
  process.stdout.write(greet(name) + '\n');
}
