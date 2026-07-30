'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

for (const file of ['run-static-tests.js', 'run-logic-tests.js', 'run-regression-tests.js']) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio:'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('All LIMU v20.19 checks passed.');
