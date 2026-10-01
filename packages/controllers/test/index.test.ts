import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as controllers from '../src/index.ts';

void test('exports the public API', () => {
  assert.deepEqual(
    Object.keys(controllers).toSorted((a, b) => a.localeCompare(b)),
    [
      'createRoutes',
      'defineController',
      'generateOpenApiDocument',
      'route',
      'ValidationErrorResponse',
    ],
  );
});
