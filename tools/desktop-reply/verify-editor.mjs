import assert from "node:assert/strict";

// This check stops forwarded Enter events before the app receives them. It sends
// no message. The full acceptance check still requires a real submitted reply.
const port = Number(process.argv[2] || 19223);
const targets = await (
  await fetch(`http://127.0.0.1:${port}/json/list`)
).json();
const target = targets.find(
  (t) =>
    t.type === "page" &&
    t.url.startsWith("app://-/") &&
    !t.url.includes("avatar"),
);
assert.ok(target, "Main Codex window exists");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) =>
  socket.addEventListener("open", resolve, { once: true }),
);
await new Promise((resolve, reject) => {
  const listener = (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== 0) return;
    socket.removeEventListener("message", listener);
    if (message.error) reject(Error("Could not enable test focus"));
    else resolve();
  };
  socket.addEventListener("message", listener);
  socket.send(
    JSON.stringify({
      id: 0,
      method: "Emulation.setFocusEmulationEnabled",
      params: { enabled: true },
    }),
  );
});
let id = 0;
const rpc = (expression) =>
  new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(
      () => reject(Error("Editor check timed out")),
      45000,
    );
    const listener = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== requestId) return;
      clearTimeout(timer);
      socket.removeEventListener("message", listener);
      if (message.result?.exceptionDetails || message.error)
        reject(
          Error(
            JSON.stringify(message.result?.exceptionDetails || message.error),
          ),
        );
      else resolve(message.result.result.value);
    };
    socket.addEventListener("message", listener);
    socket.send(
      JSON.stringify({
        id: requestId,
        method: "Runtime.evaluate",
        params: { expression, returnByValue: true, awaitPromise: true },
      }),
    );
  });
try {
  const result = await rpc(`(async () => {
    const input = document.querySelector('[data-codex-composer="true"][contenteditable="true"]');
    if (!input || input.textContent.trim()) throw Error('Use an empty composer for this check.');
    if (!window.codexReply) throw Error('Attach the extension first.');
    const roots = [...document.querySelectorAll('[data-markdown-text-style="assistant-message"]')].slice(-2);
    if (roots.length !== 2) throw Error('Two loaded assistant messages are required.');
    const wait = () => new Promise(resolve => setTimeout(resolve, 120));
    const replace = text => {
      input.focus(); const range=document.createRange(); range.selectNodeContents(input);
      const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range);
      if (text) document.execCommand('insertText', false, text);
      else document.execCommand('delete');
    };
    const choose = (root, excerpt) => {
      const node = [...root.querySelectorAll('p')].find(p => p.textContent.trim()) || root;
      const range=document.createRange(); range.selectNodeContents(node);
      if (excerpt) {
        const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
        const nodes=[]; let part;
        while ((part=walker.nextNode())) nodes.push(part);
        const locate = offset => {
          for (const part of nodes) { if (offset <= part.length) return [part,offset]; offset -= part.length; }
          throw Error('Excerpt is outside the source.');
        };
        range.setStart(...locate(excerpt[0])); range.setEnd(...locate(excerpt[1]));
      }
      const text=range.toString();
      const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range);
      node.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
      document.querySelector('.codex-reply-selection').click();
      return {id:root.closest('[data-response-annotation-target]').dataset.responseAnnotationTarget,text};
    };
    let forwarded = [];
    const stop = event => {
      if (event.key !== 'Enter' || !input.contains(event.target)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      forwarded.push(input.innerText);
    };
    window.addEventListener('keydown',stop,true);
    try {
      replace('draft to preserve'); await wait();
      choose(roots[0]); document.querySelector('.codex-reply-cancel').click();
      const cancellation = input.innerText === 'draft to preserve';
      const cases=[];
      for (const [index, answer] of ['no','yes'].entries()) {
        replace(answer); await wait();
        const source=choose(roots[index]);
        input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));
        await wait(); await wait();
        cases.push({id:source.id,answer,payload:forwarded.at(-1),forwardCount:forwarded.length});
      }
      const excerpts=[];
      for (const [index, answer] of ['yes','no'].entries()) {
        replace(answer); await wait();
        const source=choose(roots[0],[index*30,index*30+30]);
        input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));
        await wait(); await wait();
        excerpts.push({id:source.id,text:source.text,answer,payload:forwarded.at(-1)});
      }
      replace('ordinary message'); await wait();
      input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));
      await wait();
      return {cancellation,cases,excerpts,ordinary:forwarded.at(-1)};
    } finally {
      window.removeEventListener('keydown',stop,true);
      replace('');
    }
  })()`);
  assert.equal(result.cancellation, true, "Cancel preserves the draft");
  assert.notEqual(
    result.cases[0].id,
    result.cases[1].id,
    "Questions have distinct source IDs",
  );
  for (const [index, value] of result.cases.entries()) {
    assert.equal(
      value.forwardCount,
      index + 1,
      "Exactly one native event is forwarded",
    );
    assert.ok(
      value.payload.includes("#codex-reply-" + value.id),
      "Correct source ID is attached",
    );
    assert.ok(
      value.payload.trim().endsWith(value.answer),
      "Answer is preserved",
    );
  }
  assert.equal(
    result.excerpts[0].id,
    result.excerpts[1].id,
    "Both excerpts belong to one message",
  );
  assert.notEqual(
    result.excerpts[0].text,
    result.excerpts[1].text,
    "Excerpts differ",
  );
  for (const value of result.excerpts) {
    const escaped = value.text
      .trim()
      .replace(/[\\\x60*_{}\[\]<>()#+.!|~-]/g, "\\$&");
    assert.ok(
      value.payload.includes("> " + escaped),
      "The selected excerpt is attached exactly",
    );
    assert.ok(
      value.payload.trim().endsWith(value.answer),
      "The excerpt answer is preserved",
    );
  }
  assert.equal(
    result.ordinary,
    "ordinary message",
    "Ordinary messages are unchanged",
  );
  console.log(
    "PASS: two message sources, two distinct excerpts in one message, yes/no payloads, cancel preserves draft, ordinary message unchanged. No messages sent.",
  );
} finally {
  socket.close();
}
