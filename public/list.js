import { $, api, el, flagChips, nav, post, reviewWaiting, promptChip, toast } from "/common.js";

$("#nav").replaceWith(nav("/list"));
reviewWaiting();
let picks = await api("/api/picks");

function render() {
  const tasks = picks.tasks;
  const missing = tasks.filter((t) => !t.hasPrompt).length;
  $("#saved").textContent = picks.savedAt
    ? `Saved ${new Date(picks.savedAt).toLocaleString()} · also written to docs/roadmap/night-run/next-night-run.md`
    : "Nothing saved yet.";
  $("#stats").replaceChildren(
    el("div", { class: "stat" }, el("b", {}, tasks.length), "tasks"),
    el("div", { class: "stat" }, el("b", {}, tasks.length - missing), "have a prompt"),
    el("div", { class: "stat" }, el("b", {}, missing), "need a prompt"),
  );
  $("#next").replaceChildren(
    el(
      "span",
      {},
      el("b", {}, "Next: "),
      tasks.length
        ? [
            "tell Claude ",
            el("code", {}, "night board ready"),
            missing
              ? `. Claude writes the ${missing} missing prompt${missing > 1 ? "s" : ""} and asks you the open questions, then the night run starts.`
              : ". Every task has a prompt; Claude asks the run's few questions and starts.",
          ]
        : el("a", { href: "/" }, "pick tasks first"),
    ),
  );

  const groups = new Map();
  for (const t of tasks) groups.set(t.file, [...(groups.get(t.file) ?? []), t]);
  $("#groups").replaceChildren(
    ...[...groups].map(([file, list]) =>
      el(
        "div",
        {},
        el("div", { class: "section-head" }, el("h2", {}, file)),
        el(
          "div",
          { class: "grid" },
          list.map((t) =>
            el(
              "div",
              { class: "box" },
              el("div", { class: "title" }, el("b", {}, t.title)),
              !t.file.startsWith("night-run/") &&
                el("div", { class: "muted small" }, t.phase, t.section ? ` · ${t.section}` : ""),
              el(
                "div",
                { class: "chips" },
                t.code && el("span", { class: "chip code" }, t.code),
                promptChip(t),
                flagChips(t),
                el("button", { class: "link", onclick: () => remove(t.id) }, "remove"),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

async function remove(id) {
  picks = await post("/api/picks", { tasks: picks.tasks.filter((t) => t.id !== id) });
  toast("Removed");
  render();
}

render();
