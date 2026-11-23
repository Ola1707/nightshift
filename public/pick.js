import {
  $,
  api,
  decisionRow,
  el,
  flagChips,
  isManual,
  nav,
  post,
  reviewWaiting,
  promptChip,
  toast,
} from "/common.js";

const chosen = new Map();
const boxes = new Map();
let notes = {};

// A note or question on the task, for Claude to answer in the chat. Saved when the box loses focus.
function noteBox(task) {
  const saved = notes[task.id]?.note ?? "";
  const summary = el("summary", {}, saved ? "📝 note ✓" : "📝 note");
  const area = el("textarea", {
    rows: 3,
    placeholder: "Something important, or a question for Claude",
    onblur: async () => {
      const note = area.value.trim();
      if (note === (notes[task.id]?.note ?? "")) return;
      notes = await post("/api/notes", { task, note });
      summary.textContent = note ? "📝 note ✓" : "📝 note";
      toast(note ? "Note saved" : "Note removed");
    },
  });
  area.value = saved;
  return el("details", { class: "task-note", open: Boolean(saved) }, summary, area);
}

function refresh() {
  for (const [id, nodes] of boxes) nodes.forEach((n) => n.classList.toggle("on", chosen.has(id)));
  $("#count").textContent = `${chosen.size} chosen`;
  document.querySelectorAll("[data-phase-count]").forEach((node) => {
    const ids = node.dataset.phaseCount.split("\n");
    const n = ids.filter((id) => chosen.has(id)).length;
    node.textContent = n ? `${n} chosen` : "";
    node.className = n ? "chip code" : "";
  });
}

function taskBox(task, extraChips = []) {
  const box = el(
    "div",
    {
      class: isManual(task) ? "box task manual" : "box task",
      "data-search":
        `${task.code ?? ""} ${task.title} ${task.details ?? ""} ${task.phase ?? ""} ${task.file}`.toLowerCase(),
      onclick: (e) => {
        if (e.target.closest("details.more, details.task-note")) return;
        if (chosen.has(task.id)) chosen.delete(task.id);
        else chosen.set(task.id, task);
        refresh();
      },
    },
    el("span", { class: "tick" }, "✓"),
    el("div", { class: "title" }, task.title),
    el(
      "div",
      { class: "chips" },
      task.code && el("span", { class: "chip code" }, task.code),
      promptChip(task),
      extraChips,
      flagChips(task),
    ),
    task.details &&
      el("details", { class: "more" }, el("summary", {}, "more"), el("p", {}, task.details)),
    noteBox(task),
  );
  boxes.set(task.id, [...(boxes.get(task.id) ?? []), box]);
  return box;
}

function renderNight(night) {
  const root = $("#night");
  for (const group of night) {
    root.append(
      el(
        "div",
        { class: "group" },
        el(
          "div",
          { class: "section-head" },
          el("h2", {}, group.title),
          el("span", { class: "muted small" }, `${group.tasks.length} open · ${group.file}`),
        ),
        group.tasks.length
          ? el(
              "div",
              { class: "grid" },
              group.tasks.map((t) =>
                taskBox(t, group.planOnly ? [el("span", { class: "chip" }, "plan only")] : []),
              ),
            )
          : el("div", { class: "empty" }, "Nothing open"),
      ),
    );
  }
}

// Search: shows only the boxes whose code, title, text or note has every word typed,
// opens the roadmaps and phases that have one, and hides the rest.
function search(query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  for (const box of document.querySelectorAll(".task")) {
    const text = `${box.dataset.search} ${box.querySelector("textarea")?.value.toLowerCase() ?? ""}`;
    box.hidden = !words.every((w) => text.includes(w));
  }
  const hasMatch = (node) => node.querySelector(".task:not([hidden])");
  for (const node of document.querySelectorAll("#night .group, details.roadmap, details.phase")) {
    node.hidden = words.length > 0 && !hasMatch(node);
    if (node.tagName === "DETAILS") node.open = words.length > 0 && !node.hidden;
  }
  for (const node of document.querySelectorAll(".sub")) {
    node.hidden = words.length > 0 && !hasMatch(node.nextElementSibling);
  }
  const shown = document.querySelectorAll(".task:not([hidden])").length;
  $("#search-count").textContent = words.length ? `${shown} found` : "";
}

// Drag a roadmap or a phase by its title bar to move it among its neighbours; "Send order to Claude" saves the order.
let dragged = null;

function dragHandle(selector) {
  return el(
    "span",
    {
      class: "drag",
      title: "Drag to move",
      draggable: "true",
      onclick: (e) => e.preventDefault(),
      ondragstart: (e) => {
        e.stopPropagation();
        dragged = e.currentTarget.closest(selector);
        dragged.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setDragImage(dragged.querySelector("summary"), 20, 20);
      },
      ondragend: () => {
        dragged?.classList.remove("dragging");
        dragged = null;
        numberRoadmaps();
      },
    },
    "⠿",
  );
}

function dragOver(e) {
  if (!dragged) return;
  const selector = dragged.matches("details.phase") ? "details.phase" : "details.roadmap";
  const over = e.target.closest(selector);
  // A phase moves only within its own roadmap.
  if (!over || over.parentElement !== dragged.parentElement) return;
  e.preventDefault();
  if (over === dragged) return;
  const box = over.getBoundingClientRect();
  const after = e.clientY > box.top + Math.min(box.height / 2, 30);
  if (after ? over.nextElementSibling === dragged : over.previousElementSibling === dragged) return;
  if (after) over.after(dragged);
  else over.before(dragged);
  numberRoadmaps();
  $("#send-order").disabled = false;
  $("#send-order").textContent = "Send order to Claude";
}

function numberRoadmaps() {
  document.querySelectorAll("details.roadmap .roadmap-number").forEach((node, i) => {
    node.textContent = `${i + 1}.`;
  });
}

function currentOrder() {
  const roadmaps = [...document.querySelectorAll("details.roadmap")];
  return {
    roadmaps: roadmaps.map((r) => r.dataset.file),
    phases: Object.fromEntries(
      roadmaps.map((r) => [
        r.dataset.file,
        [...r.querySelectorAll("details.phase")].map((p) => p.dataset.phase),
      ]),
    ),
  };
}

function renderOther(other) {
  const root = $("#other");
  for (const roadmap of other) {
    const total = roadmap.phases.reduce((n, p) => n + p.tasks.length, 0);
    root.append(
      el(
        "details",
        { class: "roadmap", "data-file": roadmap.file },
        el(
          "summary",
          {},
          dragHandle("details.roadmap"),
          el("span", { class: "roadmap-number" }),
          roadmap.title,
          el(
            "span",
            { class: "muted small" },
            `${roadmap.phases.length} phases · ${total} open · ${roadmap.file}`,
          ),
        ),
        el(
          "div",
          { class: "inner" },
          roadmap.phases.map((phase) => {
            let lastSection = null;
            const items = [];
            let grid = null;
            for (const task of phase.tasks) {
              if (task.section !== lastSection || !grid) {
                lastSection = task.section;
                if (task.section) items.push(el("div", { class: "sub" }, task.section));
                grid = el("div", { class: "grid" });
                items.push(grid);
              }
              grid.append(taskBox(task));
            }
            const withPrompt = phase.tasks.filter((t) => t.hasPrompt).length;
            return el(
              "details",
              { class: "phase", "data-phase": phase.name },
              el(
                "summary",
                {},
                dragHandle("details.phase"),
                phase.name,
                el(
                  "span",
                  { class: "muted small" },
                  `${phase.tasks.length} open · ${withPrompt} with prompt`,
                ),
                el("span", { "data-phase-count": phase.tasks.map((t) => t.id).join("\n") }),
              ),
              el("div", { class: "inner" }, items),
            );
          }),
        ),
      ),
    );
  }
  numberRoadmaps();
}

// "Decisions from last night": every decision Claude made alone that the owner hasn't ticked yet, from every run. Ticked
// here, it saves into that run's qa.json and leaves the list; no section when none is open.
function renderDecisions(open) {
  const root = $("#decisions");
  if (!open.length) return root.replaceChildren();
  const box = el("div", { class: "box decisions" });
  const count = el("span", { class: "muted small" });
  const recount = () => {
    const left = box.querySelectorAll(".decision").length;
    if (!left) return root.replaceChildren();
    count.textContent = `${left} open · OK when it's fine, or revert it now or as a task`;
  };
  box.append(
    ...open.map((d) =>
      decisionRow(
        d.run,
        d,
        { checked: false, note: d.note },
        (_qa, answer, row) => {
          if (!answer) return;
          // It leaves the open list as one short line without a box, so a second click never ticks the next one.
          const revert = answer !== "ok";
          row.replaceWith(
            el("div", { class: `decision-ticked ${revert ? "reverted" : ""}` }, `${revert ? "↩ To revert:" : "✓"} ${d.text}`),
          );
          toast(answer === "now" ? 'Tell Claude "do it now"' : answer === "later" ? "Claude adds a task to revert it" : "Decision ticked");
          recount();
          if (revert) api("/api/waiting").then(renderWaiting);
        },
        el(
          "span",
          { class: "decision-context" },
          `${d.run} · ${d.taskId ? `${d.taskId} ${d.taskTitle ?? ""}` : "the run"}`,
        ),
      ),
    ),
  );
  recount();
  root.replaceChildren(
    el("div", { class: "section-head" }, el("h2", {}, "Decisions from last night"), count),
    box,
  );
}

// "Waiting for Claude": decisions to revert and ways forward picked on the review page that Claude hasn't handled yet
// (<board>/handled.json). "now" ones: tell Claude "do it now"; "later" ones become tasks.
function renderWaiting(list) {
  const root = $("#waiting");
  if (!list.length) return root.replaceChildren();
  const label = (x) =>
    x.kind === "revert" ? (x.how === "now" ? "Revert now" : "Revert later") : x.how === "now" ? "Do it now" : "Do it later";
  root.replaceChildren(
    el(
      "div",
      { class: "section-head" },
      el("h2", {}, "Waiting for Claude"),
      el("span", { class: "muted small" }, `${list.length} · tell Claude "do it now"; the later ones become tasks`),
    ),
    el(
      "div",
      { class: "box decisions" },
      list.map((x) =>
        el(
          "div",
          { class: "decision" },
          el("span", { class: "decision-context" }, `${x.run} · ${x.taskId ? `${x.taskId} ${x.taskTitle ?? ""}` : "the run"}`),
          el("span", { class: `chip ${x.how === "now" ? "bad" : ""}` }, label(x)),
          ` ${x.kind === "revert" ? "↩ " : ""}${x.text}`,
          x.note ? el("div", { class: "muted small" }, x.note) : null,
        ),
      ),
    ),
  );
}

$("#nav").replaceWith(nav("/"));
reviewWaiting();
api("/api/open-decisions").then(renderDecisions);
api("/api/waiting").then(renderWaiting);
const [roadmaps, picks, savedNotes] = await Promise.all([
  api("/api/roadmaps"),
  api("/api/picks"),
  api("/api/notes"),
]);
notes = savedNotes;
renderNight(roadmaps.night);
renderOther(roadmaps.other);
const all = [
  ...roadmaps.night.flatMap((g) => g.tasks),
  ...roadmaps.other.flatMap((r) => r.phases.flatMap((p) => p.tasks)),
];
const byId = new Map(all.map((t) => [t.id, t]));
for (const saved of picks.tasks) if (byId.has(saved.id)) chosen.set(saved.id, byId.get(saved.id));
refresh();

$("#other").addEventListener("dragover", dragOver);
$("#other").addEventListener("drop", (e) => e.preventDefault());
$("#send-order").onclick = async () => {
  await post("/api/order", currentOrder());
  $("#send-order").disabled = true;
  $("#send-order").textContent = "Order sent ✓";
  toast('Order saved. Tell Claude: "order sent"');
};

$("#search").oninput = (e) => search(e.target.value);

// Every open task in the task files (paths.tasks), not the other roadmaps; Manual ones are a person's work, so they stay out.
$("#check-night").onclick = () => {
  for (const task of roadmaps.night.flatMap((g) => g.tasks))
    if (!isManual(task)) chosen.set(task.id, task);
  refresh();
};
$("#clear").onclick = () => {
  chosen.clear();
  refresh();
};
$("#save").onclick = async () => {
  await post("/api/picks", { tasks: [...chosen.values()] });
  location.href = "/list";
};
