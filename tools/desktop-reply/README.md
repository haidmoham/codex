# Desktop reply experiment

Adds message and text-selection replies to the installed Windows Codex app.
The extension uses the app's composer and message IDs. It adds the selected
question as a Markdown quote to the submitted message. A source link lets the
user return to the original message when that message is loaded.

This is an unofficial runtime extension. It does not change the signed Store
package, the Codex server, authentication, or the application database.

## Status

Tested against Store package `26.901.6511.0` with an isolated UI profile.
The real editor passed two distinct yes/no reply payload checks, two excerpts
within one message, cancellation, and an ordinary-message check. These checks
blocked submission. Runtime inspection also verified reload, task-switch
cancellation, and removal of all controls. A real submission and installation in
the user's regular app session remain unverified.

## Start

Requires Node.js 22 or later and PowerShell. Let active tasks finish, then close
Codex. Run `Start-Reply.ps1` from this directory. The launcher refuses to stop an
existing Codex process. It starts the installed executable with a debugging port
bound to `127.0.0.1`, then attaches the extension. Local processes can access this
debugging port while it is open.

Run `Install-Reply.ps1` to copy the loader into Local AppData and create a
**Codex with Replies** desktop shortcut. Use this shortcut for later launches.
`Restart-Reply.ps1` closes and restarts Codex. Run it only after coordinating
active tasks. It restores normal app access if the enhancement fails to start.

Hover an assistant message and select **Reply**, or select one question and
choose **Reply to selection**. The quoted question appears inside the composer.
Select the preview to expand it. Select × or press Escape to cancel without
changing the draft. Send your answer normally.

Quotes are limited to 700 UTF-8 bytes. Select a shorter excerpt for long messages.
The extension never infers which question an answer refers to.

## Rollback

Run `Stop-Reply.ps1` to remove the controls immediately. Close and reopen Codex
normally to stop the loader and close the debugging port. Submitted quotes remain
ordinary conversation content. The extension creates no parallel message store.

## Checks

Use an empty composer in a test session:

```powershell
node attach.mjs 19223
node verify-editor.mjs 19223
```

`verify-editor.mjs` intercepts forwarded Enter events before Codex receives them.
It changes and restores the empty test draft. It does not submit messages.

## Limitations

- Only the one main window selected at attachment time is enhanced.
- Reply links cannot yet load a source that the app has virtualized out of the DOM.
- Native app updates can change the inspected selectors or composer behavior.
- The send-button adapter currently recognizes English labels. The Enter path
  requires the app's standard Enter-to-send setting.
- The signed package remains unchanged. Start through the launcher to enable
  replies in each new app session.

## Design

Use the installed app's text, border, background, and radius tokens. Keep the
quote inside the composer. Reveal the source action on hover or keyboard focus.
Do not change the size of the send control. Expand the quote in place. No external
UI code or visual assets are bundled.
