'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildWindowsInstallerScript, quotePowerShell } = require('../lib/updater');

test('quotes apostrophes in PowerShell literal strings', () => {
  assert.equal(quotePowerShell("C:\\Viktor's App"), "'C:\\Viktor''s App'");
});

test('Windows installer waits for exit, verifies the version, logs failures, and uses the normal launcher', () => {
  const script = buildWindowsInstallerScript({
    sourcePath: 'C:\\Temp\\source',
    destinationPath: 'C:\\Apps\\Batch Sender',
    stagingPath: 'C:\\Temp\\stage',
    logPath: 'C:\\Logs\\updater.log',
    parentPid: 1234,
    expectedVersion: '0.1.19',
  });

  const waitIndex = script.indexOf('while (Get-Process -Id $parentPid');
  const copyIndex = script.indexOf('Copy-Item -Destination $destination');
  const verifyIndex = script.indexOf('$installedVersion -ne $expectedVersion');
  const launchIndex = script.indexOf("launch-batch-sender.vbs");

  assert.ok(waitIndex >= 0 && waitIndex < copyIndex);
  assert.ok(copyIndex < verifyIndex && verifyIndex < launchIndex);
  assert.match(script, /Update failed:/);
  assert.match(script, /wscript\.exe/);
  assert.doesNotMatch(script, /npm\.cmd.*start/);
});
