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

/** "Sun 23 Nov, 14:10" for a run's start time (ISO), in the viewer's time zone; "" when unknown. */
export function startTime(iso) {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}

export const post = (path, data) =>
  api(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });

export function nav(active) {
  // The work, in order; then the setup pages, done once when starting with Nightshift (and when how we work changes).
  const work = [
    ["/", "1 · Pick tasks"],
    ["/list", "2 · Tonight's list"],
    ["/review", "3 · Review a run"],
  ];
  const setup = [
    ["/flow", "Flow"],
    ["/checklist", "Checklist"],
  ];
  const link = ([href, label]) => el("a", { href, class: href === active ? "on" : null }, label);
  return el(
    "nav",
    { class: "top" },
    el("span", { class: "brand" }, "🌙 AI board"),
    work.map(link),
    el("span", { id: "review-waiting" }),
    el("span", { class: "setup" }, el("small", {}, "Setup"), setup.map(link)),
    themeSwitch(),
  );
}

// System / Light / Dark: sets data-theme on <html> (none for System) and remembers it (public/theme.js applies it on load).
function themeSwitch() {
  const read = () => {
    try {
      const v = localStorage.getItem("board-theme");
      return v === "light" || v === "dark" ? v : "system";
    } catch {
      return "system";
    }
  };
  const buttons = [["system", "System"], ["light", "Light"], ["dark", "Dark"]].map(([value, label]) =>
    el("button", {
      type: "button",
      onclick: () => {
        if (value === "system") delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = value;
        try {
          if (value === "system") localStorage.removeItem("board-theme");
          else localStorage.setItem("board-theme", value);
        } catch {}
        mark(value);
      },
    }, label),
  );
  const mark = (current) => buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(["system", "light", "dark"][i] === current)));
  mark(read());
  return el("span", { class: "theme-switch", role: "group", "aria-label": "Theme" }, buttons);
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

// Page icons for the pick page's "Prompt" row: a written prompt, and one not written yet (dashed).
export const ICON_DOC =
  '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 1.8h5.2L12.5 5v9.2H4z" fill="currentColor" fill-opacity=".12"/><path d="M9 1.8V5h3.5M6 8h4.5M6 10.6h4.5"/></svg>';
export const ICON_DOC_EMPTY =
  '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 2" aria-hidden="true"><path d="M4 1.8h5.2L12.5 5v9.2H4z"/></svg>';

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

// A decision is answered by OK or a revert ("now" or "later"); same rule as server/decisions.mjs.
export const answered = (state) => state?.checked === true || state?.revert === "now" || state?.revert === "later";

// A decision Claude made alone (run.json `decisions[]`): "OK", "Revert now" or "Revert later" (one or none) and a
// text box under it, saved like the QA boxes into the run's qa.json under `decision:<id>`. Used on the review page and
// the pick page; only the owner answers it. onSaved(qa, answer, row): answer is "ok", "now", "later" or null.
export function decisionRow(runName, decision, state, onSaved, context = null) {
  const check = el("input", { type: "checkbox", checked: Boolean(state?.checked) });
  const ok = el("label", { class: `decision-ok ${state?.checked ? "done" : ""}` }, check, "OK");
  const was = state?.checked ? null : state?.revert;
  const revertBox = (how, label) => {
    const box = el("input", { type: "checkbox", checked: was === how });
    return { how, box, label: el("label", { class: `decision-ok decision-revert ${was === how ? "done" : ""}` }, box, label) };
  };
  const reverts = [revertBox("now", "Revert now"), revertBox("later", "Revert later")];
  const note = el(
    "textarea",
    { placeholder: "A note or a question about this decision", rows: 1 },
    state?.note ?? "",
  );
  const row = el(
    "div",
    { class: "decision", "data-decision": decision.id },
    el("div", { class: "decision-head" }, el("div", { class: "decision-answers" }, ok, reverts.map((r) => r.label)), el("div", {}, context, decision.text)),
    note,
  );
  const save = async () => {
    const revert = reverts.find((r) => r.box.checked)?.how ?? null;
    const qa = await post(`/api/runs/${runName}/qa`, {
      taskId: `decision:${decision.id}`,
      checked: check.checked,
      revert,
      note: note.value,
    });
    ok.classList.toggle("done", check.checked);
    for (const r of reverts) r.label.classList.toggle("done", r.box.checked);
    onSaved?.(qa, check.checked ? "ok" : revert, row);
  };
  // One answer at most: ticking one unticks the others.
  const boxes = [check, ...reverts.map((r) => r.box)];
  for (const box of boxes)
    box.addEventListener("change", () => {
      if (box.checked) for (const other of boxes) if (other !== box) other.checked = false;
      save();
    });
  note.addEventListener("change", save);
  return row;
}

// A solution: one way forward on a task that isn't done (run.json `solutions: [{ id, text }]`). Two toggles,
// "Do it now" and "Do it later" (Claude adds a task); neither means don't. Saved in qa.json under `solution:<id>` as
// `do: "now" | "later"`.
export function solutionRow(runName, solution, state, onSaved) {
  let pick = state?.do === "now" || state?.do === "later" ? state.do : null;
  const toggle = (how, label) =>
    el("button", { type: "button", class: "seg", "data-how": how, "aria-pressed": String(pick === how) }, label);
  const now = toggle("now", "Do it now");
  const later = toggle("later", "Do it later");
  const row = el(
    "div",
    { class: `solution ${pick ? "picked" : ""}`, "data-solution": solution.id },
    el("div", { class: "segs", role: "group" }, now, later),
    el("div", { class: "solution-text" }, solution.text),
  );
  const show = () => {
    for (const b of [now, later]) b.setAttribute("aria-pressed", String(b.dataset.how === pick));
    row.classList.toggle("picked", Boolean(pick));
  };
  for (const b of [now, later])
    b.addEventListener("click", async () => {
      pick = pick === b.dataset.how ? null : b.dataset.how;
      show();
      const qa = await post(`/api/runs/${runName}/qa`, {
        taskId: `solution:${solution.id}`,
        checked: false,
        do: pick,
        note: state?.note ?? "",
      });
      onSaved?.(qa, pick);
    });
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

// The impact items from /api/flow: [{ key, label }]. An older server only sends flow.impact ("CPU · memory · ...").
let impactItemsCache;
export async function loadImpactItems() {
  if (!impactItemsCache) {
    const flow = await api("/api/flow");
    impactItemsCache =
      flow.impactItems ??
      String(flow.impact ?? "")
        .split(" · ")
        .map((label) => label.trim())
        .filter(Boolean)
        .map((label) => ({
          key: label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
          label,
        }));
  }
  return impactItemsCache;
}

// The impact row: a chip with the NAME for each item that changes (green ▲ better, red ▼ worse with a checkbox =
// the owner's OK), one grey chip "7 OK" for all `none` answers ("✓ No impact" when every item is none), an amber
// "N not checked" chip for missing answers. The note is on hover. `onOk(key, checked)` saves a tick (pick page, must
// return the task's new impact); without it the checkbox is read-only (review page). Markdown tasks (no `source`)
// show nothing, run.json tasks are told apart by having `impact`, `textOnly` or being passed `forced`.
export function impactRow(task, impactItems, forced = false, onOk = null) {
  if (task.textOnly) return null;
  if (!forced && task.source !== "json" && !task.impact) return null;
  const items = impactItems ?? [];
  const row = el("div", { class: "impact-row" });
  const draw = (answers) => {
    const missing = items.filter((item) => !answers[item.key]).length;
    const none = items.filter((item) => answers[item.key]?.effect === "none").length;
    const changing = items.filter((item) => ["better", "worse"].includes(answers[item.key]?.effect));
    const chips = changing.map((item) => {
      const answer = answers[item.key];
      const tip = `${item.label}${answer.note ? `: ${answer.note}` : ""}${answer.approved ? ` (OK'd ${answer.approved})` : ""}`;
      if (answer.effect === "better") return el("span", { class: "chip good", title: tip }, `▲ ${item.label}`);
      const box = el("input", {
        type: "checkbox",
        "aria-label": `OK ${item.label} getting worse`,
        disabled: !onOk,
        onclick: (e) => e.stopPropagation(),
        onchange: async () => {
          const checked = box.checked;
          box.disabled = true;
          try {
            draw((await onOk(item.key, checked)) ?? answers);
          } catch (error) {
            box.checked = !checked;
            box.disabled = false;
            toast(`Not saved: ${error.message}`);
          }
        },
      });
      box.checked = Boolean(answer.approved);
      return el(
        "label",
        { class: `chip bad impact-worse${answer.approved ? " ok" : ""}`, title: tip, onclick: (e) => e.stopPropagation() },
        `▼ ${item.label}`,
        box,
      );
    });
    row.replaceChildren(
      ...chips,
      ...[none > 0 && el("span", { class: "chip none", title: "no impact" }, changing.length === 0 && missing === 0 ? "✓ No impact" : `${none} OK`),
      missing > 0 && el("span", { class: "chip warn" }, `${missing} not checked`)].filter(Boolean),
    );
  };
  draw(task.impact ?? {});
  return row;
}
