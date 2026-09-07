param([int]$DelaySeconds = 8)
$ErrorActionPreference = 'Stop'
$replyLog = Join-Path $PSScriptRoot 'restart.log'
Start-Sleep -Seconds $DelaySeconds
try {
    $replyPackage = Get-AppxPackage '*Codex*' | Where-Object Name -eq 'OpenAI.Codex'
    if (@($replyPackage).Count -ne 1) { throw 'Expected one installed Codex package.' }
    $replyExecutable = Join-Path $replyPackage.InstallLocation 'app/ChatGPT.exe'
    $replyParents = @(Get-CimInstance Win32_Process | Where-Object {
        $_.ExecutablePath -eq $replyExecutable -and $_.CommandLine -notmatch '--type='
    })
    foreach ($replyParent in $replyParents) {
        $replyProcess = Get-Process -Id $replyParent.ProcessId -ErrorAction SilentlyContinue
        if ($replyProcess) { $null = $replyProcess.CloseMainWindow() }
    }
    Start-Sleep -Seconds 3
    foreach ($replyParent in $replyParents) {
        $replyCurrent = Get-CimInstance Win32_Process -Filter "ProcessId=$($replyParent.ProcessId)"
        if ($replyCurrent -and $replyCurrent.ExecutablePath -eq $replyExecutable -and $replyCurrent.CreationDate -eq $replyParent.CreationDate) {
            Stop-Process -Id $replyCurrent.ProcessId -ErrorAction Stop
        }
    }
    Start-Sleep -Seconds 2
    & (Join-Path $PSScriptRoot 'Start-Reply.ps1') *>&1 | Out-File -LiteralPath $replyLog -Encoding utf8
    Add-Content -LiteralPath $replyLog -Value 'Restart launcher completed.'
} catch {
    $_.Exception.Message | Out-File -LiteralPath $replyLog -Encoding utf8
    # Restore normal app access if the enhancement cannot start.
    if ($replyExecutable -and (Test-Path -LiteralPath $replyExecutable)) {
        Start-Process -FilePath $replyExecutable -WindowStyle Normal | Out-Null
    }
    exit 1
}
