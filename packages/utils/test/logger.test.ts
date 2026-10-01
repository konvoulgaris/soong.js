import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

import { Environment } from '@soong/constants';

// The import anchors the type checks at the end of this file. Keep it a value import.
import { logger } from '../src/logger.ts';

const loggerUrl = new URL('../src/logger.ts', import.meta.url).href;

const script = `import { logger } from ${JSON.stringify(loggerUrl)}; logger.info({ key: 'TEST_KEY', value: 1 });`;

function runLog(nodeEnvironment: string | undefined): string {
  const environment = { ...process.env };
  delete environment.NODE_ENV;

  if (nodeEnvironment !== undefined) {
    environment.NODE_ENV = nodeEnvironment;
  }

  return execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
    env: environment,
    encoding: 'utf8',
    timeout: 10_000,
  });
}

void test('in production, writes one JSON line with the key and no msg', () => {
  const lines = runLog(Environment.Production).trim().split('\n');

  assert.equal(lines.length, 1);
  const log = JSON.parse(lines[0] ?? '') as Record<string, unknown>;
  assert.equal(log.key, 'TEST_KEY');
  assert.equal(log.value, 1);
  assert.equal('msg' in log, false);
});

void test('without NODE_ENV, writes pretty output with the key in the header line', () => {
  const output = runLog(undefined);

  assert.match(output.split('\n', 1)[0] ?? '', /TEST_KEY/);
  assert.throws(() => JSON.parse(output) as unknown);
});

void test('with an empty NODE_ENV, writes pretty output with the key in the header line', () => {
  const output = runLog('');

  assert.match(output.split('\n', 1)[0] ?? '', /TEST_KEY/);
  assert.throws(() => JSON.parse(output) as unknown);
});

void test('pnpm typecheck checks that the type rejects a log without an UPPER_CASE key', () => {
  const rejectedCalls = [
    (): void => {
      // @ts-expect-error a message string is not a log object
      logger.info('text');
    },
    (): void => {
      // @ts-expect-error a log object must have a key
      logger.info({ value: 1 });
    },
    (): void => {
      // @ts-expect-error the key must be UPPER_CASE
      logger.info({ key: 'lower' });
    },
  ];

  // TypeScript checks the calls above. The test only keeps them in a test file.
  assert.equal(rejectedCalls.length, 3);
});
