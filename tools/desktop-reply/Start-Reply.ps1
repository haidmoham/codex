param([int]$Port = 19223)
$ErrorActionPreference = 'Stop'
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Invalid local port.' }
$replyPackage = Get-AppxPackage '*Codex*' | Where-Object Name -eq 'OpenAI.Codex'
if (@($replyPackage).Count -ne 1) { throw 'Expected one installed Codex package.' }
$replyExecutable = Join-Path $replyPackage.InstallLocation 'app/ChatGPT.exe'
$replyRunning = Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -eq $replyExecutable -and $_.CommandLine -notmatch '--type='
}
if ($replyRunning) { throw 'Close Codex after its tasks finish, then run this launcher again. No process was stopped.' }
$replyNode = (Get-Command node -ErrorAction Stop).Source
$replyAttach = Join-Path $PSScriptRoot 'attach.mjs'
# Bind debugging to loopback. This launcher does not alter the Store package.
Start-Process -FilePath $replyExecutable -ArgumentList @(
    '--remote-debugging-address=127.0.0.1', "--remote-debugging-port=$Port"
) -WindowStyle Normal | Out-Null
$replyReady = $false
for ($replyAttempt = 0; $replyAttempt -lt 30; $replyAttempt++) {
    try {
        $replyTargets = Invoke-RestMethod "http://127.0.0.1:$Port/json/list" -TimeoutSec 1
        $replyReady = @($replyTargets | Where-Object { $_.type -eq 'page' -and $_.url -like 'app://-/*' -and $_.url -notlike '*avatar-overlay*' }).Count -eq 1
    } catch { $replyReady = $false }
    if ($replyReady) { break }
    Start-Sleep -Milliseconds 500
}
if (-not $replyReady) { throw 'Codex did not expose a single main window. The package is unchanged.' }
Start-Process -FilePath $replyNode -ArgumentList @(('"' + $replyAttach + '"'), "$Port", '--watch') -WindowStyle Hidden | Out-Null
Write-Output 'Codex started with the local reply loader. Use Stop-Reply.ps1 to remove it.'
