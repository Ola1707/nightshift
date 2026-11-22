// Shared bits for the pages.
export const $ = (selector, root = document) => root.querySelector(selector);

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "class") node.className = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

export const post = (path, data) =>
  api(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });

export function nav(active) {
  const links = [
    ["/", "1 · Pick tasks"],
    ["/list", "2 · Tonight's list"],
    ["/review", "3 · Review a run"],
    ["/flow", "Flow"],
    ["/checklist", "Checklist"],
  ];
  return el(
    "nav",
    { class: "top" },
    el("span", { class: "brand" }, "🌙 AI board"),
    links.map(([href, label]) => el("a", { href, class: href === active ? "on" : null }, label)),
    el("span", { id: "review-waiting" }),
  );
}

// Every page says when a run still waits for its review: until "Review done", it comes back each day
// and deploys to the held environments are refused (server/review-gate.mjs).
export async function reviewWaiting() {
  const open = (await api("/api/runs")).filter((r) => !r.reviewed);
  const slot = document.getElementById("review-waiting");
  if (!slot || open.length === 0) return open;
  slot.replaceWith(
    el(
      "a",
      { href: `/review?run=${open[0].name}`, class: "waiting" },
      `⏳ ${open.length === 1 ? `${open[0].title} waits for its review` : `${open.length} runs wait for their review`} · held deploys wait until done`,
    ),
  );
  return open;
}

export function toast(text) {
  const node = el("div", { class: "toast show" }, text);
  document.body.append(node);
  setTimeout(() => node.classList.remove("show"), 1600);
  setTimeout(() => node.remove(), 2000);
}

export function promptChip(task) {
  return task.hasPrompt
    ? el("span", { class: "chip good" }, "prompt ✓")
    : el("span", { class: "chip warn" }, "needs prompt");
}

// Tags in the roadmap: [Native build] and [Policy] mark work that needs more than a plain code update (e.g. a new
// app store build, a policy change); [Manual] (or a "(manual…)" note) means a person does it, not Claude.
export const isManual = (task) => /\[Manual\]|\(manual\b/i.test(`${task.title} ${task.details}`);

export function flagChips(task) {
  const text = `${task.title} ${task.details}`;
  const chips = [...new Set([...text.matchAll(/\[(Native build|Policy)\]/g)].map((m) => m[1]))].map(
    (tag) => el("span", { class: "chip bad" }, tag),
  );
  if (isManual(task)) chips.push(el("span", { class: "chip manual" }, "Manual"));
  return chips;
}

// A decision Claude made alone (run.json `decisions[]`): an "OK" checkbox and a text box under it, saved like the QA
// boxes into the run's qa.json under `decision:<id>`. Used on the review page and the pick page; only the owner ticks it.
export function decisionRow(runName, decision, state, onSaved, context = null) {
  const check = el("input", { type: "checkbox", checked: Boolean(state?.checked) });
  const ok = el("label", { class: `decision-ok ${state?.checked ? "done" : ""}` }, check, "OK");
  const note = el(
    "textarea",
    { placeholder: "A note or a question about this decision", rows: 1 },
    state?.note ?? "",
  );
  const row = el(
    "div",
    { class: "decision", "data-decision": decision.id },
    el("div", { class: "decision-head" }, ok, el("div", {}, context, decision.text)),
    note,
  );
  const save = async () => {
    const qa = await post(`/api/runs/${runName}/qa`, {
      taskId: `decision:${decision.id}`,
      checked: check.checked,
      note: note.value,
    });
    ok.classList.toggle("done", check.checked);
    onSaved?.(qa, check.checked, row);
  };
  check.addEventListener("change", save);
  note.addEventListener("change", save);
  return row;
}

// Proposed items in run.json: strings (older runs, id = their number) or { id, text }. Kept in step with
// proposedItems in server/release-log.mjs.
export const proposedKey = (id) => `proposed:${id}`;
export const proposedItems = (run) =>
  (run?.proposed ?? []).map((p, i) =>
    typeof p === "string" ? { id: String(i + 1), text: p } : { id: String(p.id), text: p.text },
  );

// Links in run.json are repo paths (docs/…) or full URLs.
export const href = (path) => (/^https?:\/\//.test(path) ? path : `/repo/${path}`);

// Every picture link on every page opens in a modal on the same page; a click outside, Esc or ✕ closes it.
const PICTURE = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i;

function openPicture(src, label) {
  const dialog = el(
    "dialog",
    { class: "picture-modal", "aria-label": label || "Picture" },
    el(
      "div",
      { class: "picture-bar" },
      el("span", { class: "picture-label" }, label),
      el("button", { class: "picture-close", type: "button", "aria-label": "Close" }, "✕"),
    ),
    el("img", { src, alt: label || "" }),
  );
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog || e.target.closest(".picture-close")) dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

document.addEventListener("click", (e) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const link = e.target.closest("a[href]");
  if (!link || !PICTURE.test(link.pathname)) return;
  e.preventDefault();
  openPicture(link.href, link.querySelector("img")?.alt || link.textContent.trim());
});
