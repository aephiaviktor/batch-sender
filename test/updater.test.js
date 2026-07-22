'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { buildWindowsInstallerScript, quotePowerShell } = require('../lib/updater');

test('quotes apostrophes in PowerShell literal strings', () => {
  assert.equal(quotePowerShell("C:\\Viktor's App"), "'C:\\Viktor''s App'");
});

test('Windows installer waits for exit, verifies the version, logs failures, and launches Electron directly', () => {
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
  const launchIndex = script.indexOf("electron.exe");

  assert.ok(waitIndex >= 0 && waitIndex < copyIndex);
  assert.ok(copyIndex < verifyIndex && verifyIndex < launchIndex);
  assert.match(script, /Update failed:/);
  assert.match(script, /Start-Process -FilePath \$electron/);
  assert.doesNotMatch(script, /wscript\.exe|launch-batch-sender\.vbs/);
  assert.doesNotMatch(script, /npm\.cmd.*start/);
});

test('update preparation explicitly installs and verifies the Electron binary', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  assert.match(mainSource, /runCommand\('node', \[path\.join\(sourcePath, 'node_modules', 'electron', 'install\.js'\)\]/);
  assert.match(mainSource, /'electron', 'dist', 'electron\.exe'/);
  assert.match(mainSource, /Electron binary installation did not produce electron\.exe/);
});

test('desktop shortcut targets Electron directly', () => {
  const shortcutSource = fs.readFileSync(path.join(__dirname, '..', 'create-desktop-shortcut.vbs'), 'utf8');
  assert.match(shortcutSource, /node_modules\\electron\\dist\\electron\.exe/);
  assert.doesNotMatch(shortcutSource, /wscript\.exe|launch-batch-sender\.vbs/);
});
