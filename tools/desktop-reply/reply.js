/* Local, reversible enhancement for the Codex desktop renderer. */
(function installCodexReply() {
  "use strict";
  if (location.protocol !== "app:") return;
  if (sessionStorage.getItem("codex-reply-disabled") === "true") return;
  if (!document.body) {
    document.addEventListener("DOMContentLoaded", installCodexReply, {
      once: true,
    });
    return;
  }
  window.codexReply?.uninstall();
  document
    .querySelectorAll(
      ".codex-reply-style,.codex-reply-bar,.codex-reply-selection,.codex-reply-action",
    )
    .forEach((node) => node.remove());
  const assistant = '[data-markdown-text-style="assistant-message"]';
  const editorSelector = '[data-codex-composer="true"][contenteditable="true"]';
  const controller = new AbortController();
  const owned = new Set();
  let pending = null;
  let prepared = null;
  let forwarding = false;
  let scheduled = false;
  let active = true;
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const own = (node) => {
    owned.add(node);
    return node;
  };
  const editor = () =>
    [...document.querySelectorAll(editorSelector)].find(
      (node) => node.getClientRects().length,
    );
  const current = () =>
    pending &&
    editor() === pending.input &&
    [
      ...document.querySelectorAll("[data-response-annotation-conversation]"),
    ].some(
      (node) =>
        node.dataset.responseAnnotationConversation === pending.conversation,
    );
  const style = own(element("style", "codex-reply-style"));
  style.textContent = `
    .codex-reply-action,.codex-reply-selection,.codex-reply-cancel { font-family:inherit; cursor:pointer; border:0; border-radius:var(--radius-md,8px); padding:4px 8px; color:var(--color-text-secondary,inherit); background:transparent; }
    .codex-reply-host { position:relative; }
    .codex-reply-action { position:absolute; right:0; top:-24px; font-size:12px; opacity:0; }
    .codex-reply-action:hover,.codex-reply-cancel:hover { background:var(--color-background-button-secondary-hover,#8882); color:var(--color-text-primary,inherit); }
    [data-response-annotation-target]:hover > .codex-reply-action,.codex-reply-action:focus-visible { opacity:1; }
    .codex-reply-selection { position:fixed; z-index:2147483000; font-size:12px; padding:6px 10px; border:1px solid var(--color-token-border-default,#8883); background:var(--color-background-elevated-primary-opaque,#303030); box-shadow:0 2px 8px #0003; }
    .codex-reply-bar { display:flex; align-items:center; gap:8px; margin:4px 0 10px; padding:2px 0 2px 10px; border-left:2px solid var(--color-text-tertiary,#888); font-size:12px; line-height:18px; color:var(--color-text-secondary,inherit); }
    .codex-reply-preview { flex:1; min-width:0; text-align:left; font:inherit; color:inherit; border:0; background:transparent; padding:0; cursor:pointer; }
    .codex-reply-label { display:block; color:var(--color-text-tertiary,#888); font-size:11px; }
    .codex-reply-quote { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; overflow-wrap:anywhere; }
    .codex-reply-preview[aria-expanded=true] .codex-reply-quote { display:block; white-space:pre-wrap; }
    .codex-reply-source { outline:1px solid var(--color-token-input-border,#888); outline-offset:5px; border-radius:var(--radius-md,8px); }
  `;
  document.head.append(style);
  const bar = own(element("div", "codex-reply-bar"));
  bar.setAttribute("role", "status");
  const preview = element("button", "codex-reply-preview");
  preview.type = "button";
  preview.setAttribute("aria-expanded", "false");
  const label = element("span", "codex-reply-label", "Replying to Codex");
  const quote = element("span", "codex-reply-quote");
  preview.append(label, quote);
  const cancel = element("button", "codex-reply-cancel", "×");
  cancel.type = "button";
  cancel.setAttribute("aria-label", "Cancel reply");
  bar.append(preview, cancel);
  const selectionButton = own(
    element("button", "codex-reply-selection", "↩ Reply to selection"),
  );
  selectionButton.type = "button";
  let selected = null;
  const on = (target, type, handler, capture = false) =>
    target.addEventListener(type, handler, {
      capture,
      signal: controller.signal,
    });
  const removeSelection = () => {
    selectionButton.remove();
    selected = null;
  };
  const markdown = (text) => text.replace(/[\\`*_{}\[\]<>()#+.!|~-]/g, "\\$&");
  const prefix = (value) =>
    `> [Reply to Codex](#codex-reply-${encodeURIComponent(value.id)})\n${value.text
      .split("\n")
      .map((line) => "> " + markdown(line))
      .join("\n")}\n\n`;
  function refreshBar() {
    const input = editor();
    if (!pending || !input) {
      bar.remove();
      return;
    }
    if (quote.textContent !== pending.text) quote.textContent = pending.text;
    quote.title = pending.text;
    const root = input.closest("[data-composer-input-variant]");
    if (root && !root.contains(bar)) root.prepend(bar);
  }
  function choose(root, text) {
    const source = root.closest("[data-response-annotation-target]");
    if (!source || !editor() || prepared) return;
    text = text.trim();
    if (!text) return;
    if (new TextEncoder().encode(text).length > 700) {
      window.alert(
        "Select just the question you want to answer (up to 700 UTF-8 bytes).",
      );
      return;
    }
    pending = {
      id: source.dataset.responseAnnotationTarget,
      text,
      input: editor(),
      conversation: source.dataset.responseAnnotationConversation,
    };
    preview.setAttribute("aria-expanded", "false");
    removeSelection();
    refreshBar();
    editor().focus();
  }
  function cancelReply() {
    // Before submission the editor is untouched, so cancellation preserves the draft.
    if (prepared) return;
    pending = null;
    bar.remove();
    editor()?.focus();
  }
  on(cancel, "click", cancelReply);
  on(preview, "click", () =>
    preview.setAttribute(
      "aria-expanded",
      String(preview.getAttribute("aria-expanded") !== "true"),
    ),
  );
  on(selectionButton, "mousedown", (e) => e.preventDefault());
  on(selectionButton, "click", () => {
    if (selected) choose(selected.root, selected.text);
  });
  on(document, "mouseup", () => {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const anchor = selection?.anchorNode?.parentElement?.closest(assistant);
    const focus = selection?.focusNode?.parentElement?.closest(assistant);
    if (!range || selection.isCollapsed || !anchor || anchor !== focus) {
      removeSelection();
      return;
    }
    selected = { root: anchor, text: selection.toString() };
    const rect = range.getBoundingClientRect();
    selectionButton.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 180))}px`;
    selectionButton.style.top = `${Math.max(8, rect.top - 35)}px`;
    document.body.append(selectionButton);
  });
  on(
    document,
    "click",
    (e) => {
      const link = e.target.closest?.('a[href*="#codex-reply-"]');
      if (!link) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const id = decodeURIComponent(
        link.getAttribute("href").split("#codex-reply-")[1],
      );
      const source = [
        ...document.querySelectorAll("[data-response-annotation-target]"),
      ].find((node) => node.dataset.responseAnnotationTarget === id);
      if (!source) {
        window.alert(
          "The original message is not loaded. Scroll to earlier messages, then try again.",
        );
        return;
      }
      source.scrollIntoView({ behavior: "smooth", block: "center" });
      source.classList.add("codex-reply-source");
      setTimeout(() => source.classList.remove("codex-reply-source"), 1600);
    },
    true,
  );
  function send(e, forward) {
    if (forwarding || !pending) return;
    const input = editor();
    if (!input || !current()) return;
    const original = input.innerText;
    if (!original?.trim()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!prepared) {
      const value = prefix(pending);
      const selection = window.getSelection();
      input.focus();
      const range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      if (!document.execCommand("insertText", false, value)) {
        quote.textContent =
          "Could not attach the question. Your answer was not sent.";
        return;
      }
      prepared = { input, original, prefix: value };
    }
    // Let ProseMirror and React observe the edit before the native send handler runs.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!active || !prepared || !input.isConnected || !current()) return;
        const actual = input.innerText;
        if (
          !actual?.includes("#codex-reply-") ||
          !actual.includes(original.trim())
        ) {
          quote.textContent =
            "The editor did not accept the quote. Review the draft before sending.";
          return;
        }
        forwarding = true;
        try {
          forward(input);
        } finally {
          forwarding = false;
        }
        // A failed native send keeps its quoted draft intact for the user's review.
        pending = null;
        prepared = null;
        bar.remove();
      }),
    );
  }
  on(
    window,
    "keydown",
    (e) => {
      if (e.key === "Escape" && pending && !prepared) {
        e.preventDefault();
        cancelReply();
        return;
      }
      if (
        e.key !== "Enter" ||
        e.shiftKey ||
        e.isComposing ||
        !e.target.closest?.(editorSelector)
      )
        return;
      send(e, (input) =>
        input.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            bubbles: true,
            cancelable: true,
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
          }),
        ),
      );
    },
    true,
  );
  on(
    window,
    "click",
    (e) => {
      const button = e.target.closest?.("button");
      if (
        !button ||
        button.disabled ||
        !button.closest("[data-codex-composer-root]")
      )
        return;
      if (
        !/^(send|send message|queue|queue message|steer|steer conversation)$/i.test(
          button.getAttribute("aria-label") || "",
        )
      )
        return;
      send(e, () => button.click());
    },
    true,
  );
  function scan() {
    if (!active) return;
    scheduled = false;
    if (pending && !current()) {
      pending = null;
      prepared = null;
      removeSelection();
    }
    for (const root of document.querySelectorAll(assistant)) {
      const source = root.closest("[data-response-annotation-target]");
      if (!source || source.querySelector(":scope > .codex-reply-action"))
        continue;
      source.classList.add("codex-reply-host");
      const button = own(element("button", "codex-reply-action", "↩ Reply"));
      button.type = "button";
      button.setAttribute("aria-label", "Reply to this message");
      on(button, "click", () => choose(root, root.innerText));
      source.append(button);
    }
    refreshBar();
  }
  const observer = new MutationObserver(() => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(scan);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.codexReply = {
    version: "0.1.0",
    status: () => ({
      pending: !!pending,
      prepared: !!prepared,
      editor: !!editor(),
    }),
    uninstall() {
      active = false;
      controller.abort();
      observer.disconnect();
      for (const node of owned) node.remove();
      document
        .querySelectorAll(".codex-reply-source")
        .forEach((node) => node.classList.remove("codex-reply-source"));
      document
        .querySelectorAll(".codex-reply-host")
        .forEach((node) => node.classList.remove("codex-reply-host"));
      delete window.codexReply;
    },
  };
  scan();
})();
