'use strict';

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildWindowsInstallerScript({ sourcePath, destinationPath, stagingPath, logPath, parentPid, expectedVersion }) {
  const quote = quotePowerShell;
  return [
    "$ErrorActionPreference = 'Stop'",
    `$source = ${quote(sourcePath)}`,
    `$destination = ${quote(destinationPath)}`,
    `$staging = ${quote(stagingPath)}`,
    `$logPath = ${quote(logPath)}`,
    `$parentPid = ${Number(parentPid)}`,
    `$expectedVersion = ${quote(expectedVersion)}`,
    'New-Item -ItemType Directory -Path (Split-Path -Parent $logPath) -Force | Out-Null',
    'function Write-UpdaterLog([string]$message) {',
    "  Add-Content -LiteralPath $logPath -Value (\"$(Get-Date -Format o) $message\") -Encoding UTF8",
    '}',
    'try {',
    "  Write-UpdaterLog \"Starting update to $expectedVersion from parent PID $parentPid.\"",
    '  $deadline = (Get-Date).AddMinutes(2)',
    '  while (Get-Process -Id $parentPid -ErrorAction SilentlyContinue) {',
    "    if ((Get-Date) -ge $deadline) { throw 'Batch Sender did not exit within 2 minutes.' }",
    '    Start-Sleep -Milliseconds 500',
    '  }',
    "  Write-UpdaterLog 'Previous app process exited; copying staged update.'",
    '  Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $destination -Recurse -Force',
    "  $installedVersion = (Get-Content -LiteralPath (Join-Path $destination 'package.json') -Raw | ConvertFrom-Json).version",
    "  if ($installedVersion -ne $expectedVersion) { throw \"Installed version is $installedVersion; expected $expectedVersion.\" }",
    "  $launcher = Join-Path $destination 'launch-batch-sender.vbs'",
    "  if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { throw 'Batch Sender launcher is missing after update.' }",
    "  Write-UpdaterLog \"Installed version $installedVersion; restarting through the normal launcher.\"",
    "  Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\\wscript.exe') -ArgumentList @(\"`\"$launcher`\"\") -WorkingDirectory $destination",
    "  Write-UpdaterLog 'Restart command launched successfully.'",
    '  Start-Sleep -Seconds 2',
    '  Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue',
    '} catch {',
    "  Write-UpdaterLog (\"Update failed: \" + $_.Exception.Message)",
    '  exit 1',
    '}',
  ].join('\r\n');
}

module.exports = { buildWindowsInstallerScript, quotePowerShell };
