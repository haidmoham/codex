import { readFile } from "node:fs/promises";

const port = Number(process.argv[2] || 19223);
const remove = process.argv.includes("--remove");
const watch = process.argv.includes("--watch");
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("Invalid local port");
const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
  signal: AbortSignal.timeout(6000),
});
const targets = await response.json();
const pages = targets.filter(
  (target) =>
    target.type === "page" &&
    target.url.startsWith("app://-/") &&
    !target.url.includes("avatar-overlay"),
);
if (pages.length !== 1)
  throw Error(`Expected one main Codex window; found ${pages.length}`);
const address = new URL(pages[0].webSocketDebuggerUrl);
if (!["127.0.0.1", "localhost", "[::1]"].includes(address.hostname))
  throw Error("Non-local debugger refused");
const socket = new WebSocket(address);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    socket.close();
    reject(Error("Debugger connection timed out"));
  }, 6000);
  socket.addEventListener(
    "open",
    () => {
      clearTimeout(timer);
      resolve();
    },
    { once: true },
  );
  socket.addEventListener(
    "error",
    () => {
      clearTimeout(timer);
      reject(Error("Debugger connection failed"));
    },
    { once: true },
  );
});
let id = 0;
const rpc = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => {
      socket.removeEventListener("message", listener);
      reject(Error(`${method} timed out`));
    }, 6000);
    const listener = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== requestId) return;
      clearTimeout(timer);
      socket.removeEventListener("message", listener);
      if (message.error || message.result?.exceptionDetails)
        reject(Error(`${method} failed`));
      else resolve(message.result);
    };
    socket.addEventListener("message", listener);
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
try {
  if (remove) {
    await rpc("Runtime.evaluate", {
      expression:
        'sessionStorage.setItem("codex-reply-disabled","true"); window.codexReply?.uninstall()',
    });
    console.log("Reply extension removed.");
  } else {
    const source = await readFile(
      new URL("./reply.js", import.meta.url),
      "utf8",
    );
    await rpc("Runtime.evaluate", {
      expression: 'sessionStorage.removeItem("codex-reply-disabled")',
    });
    if (watch) {
      await rpc("Page.enable");
      await rpc("Page.addScriptToEvaluateOnNewDocument", { source });
    }
    await rpc("Runtime.evaluate", { expression: source });
    console.log("Reply extension attached to the main Codex window.");
    if (watch) {
      console.log(
        "Keeping replies active across reloads. Close Codex to stop this loader.",
      );
      await new Promise((resolve) =>
        socket.addEventListener("close", resolve, { once: true }),
      );
    }
  }
} finally {
  socket.close();
}
