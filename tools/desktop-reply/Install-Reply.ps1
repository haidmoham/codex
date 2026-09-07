$ErrorActionPreference = 'Stop'
$replyInstall = Join-Path $env:LOCALAPPDATA 'CodexReply'
New-Item -ItemType Directory -Path $replyInstall -Force | Out-Null
foreach ($replyName in @('reply.js', 'attach.mjs', 'Start-Reply.ps1', 'Stop-Reply.ps1', 'Restart-Reply.ps1')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $replyName) -Destination (Join-Path $replyInstall $replyName) -Force
}
$replyShortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Codex with Replies.lnk'
$replyShell = New-Object -ComObject WScript.Shell
$replyShortcut = $replyShell.CreateShortcut($replyShortcutPath)
$replyShortcut.TargetPath = (Get-Command powershell.exe).Source
$replyShortcut.Arguments = '-NoProfile -File "' + (Join-Path $replyInstall 'Start-Reply.ps1') + '"'
$replyShortcut.WorkingDirectory = $replyInstall
$replyShortcut.WindowStyle = 7
$replyShortcut.Description = 'Start the installed Codex app with quoted replies.'
$replyPackage = Get-AppxPackage '*Codex*' | Where-Object Name -eq 'OpenAI.Codex'
if ($replyPackage) { $replyShortcut.IconLocation = (Join-Path $replyPackage.InstallLocation 'app/ChatGPT.exe') + ',0' }
$replyShortcut.Save()
Write-Output "Installed reply loader in $replyInstall"
Write-Output "Created $replyShortcutPath"
