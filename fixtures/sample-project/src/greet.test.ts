import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greet } from './greet.ts';

test('greets a named person', () => {
  assert.equal(greet('Ada'), 'Hello, Ada!');
});

test('falls back to world when empty', () => {
  assert.equal(greet('   '), 'Hello, world!');
});
