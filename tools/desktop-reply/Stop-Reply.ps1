param([int]$Port = 19223)
$ErrorActionPreference = 'Stop'
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Invalid local port.' }
& node (Join-Path $PSScriptRoot 'attach.mjs') $Port --remove
if ($LASTEXITCODE -ne 0) { throw 'Could not confirm removal. Close and reopen Codex normally to remove the extension.' }
Write-Output 'Reply controls removed. Close and reopen Codex normally to also close its local debugging port.'
