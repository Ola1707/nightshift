// The Checklist page: who handles each item of the feature plan, from GET /api/checklist. A tick saves at once.
import { $, api, el, nav, post, reviewWaiting } from "/common.js";

$("#nav").replaceWith(nav("/checklist"));
reviewWaiting();

const config = await api("/api/config");
const owner = config.owner;
// Same limits as server/checklist.mjs, shown in red under the box when broken.
const LIMITS = { name: [2, 80], description: [0, 300] };

let items = (await api("/api/checklist")).items;

const lines = (value) => [...value.trim()].length;

function tickBox(item, who) {
  return el(
    "td",
    { class: "cb" },
    el("input", {
      type: "checkbox",
      "data-id": item.id,
      "data-who": who,
      checked: item[who],
      "aria-label": `${who === "approve" ? `${owner} approves` : "Claude does"}: ${item.name}`,
      onchange: async (event) => {
        const next = { id: item.id, approve: item.approve, claude: item.claude };
        next[who] = event.target.checked;
        items = (await post("/api/checklist/tick", next)).items;
        render();
      },
    }),
  );
}

function itemRow(item) {
  return el(
    "tr",
    { "data-id": item.id, class: "item" },
    el(
      "td",
      {},
      el("b", {}, item.name),
      item.description ? el("div", { class: "q" }, item.description) : null,
      item.added
        ? el(
            "button",
            {
              class: "link",
              type: "button",
              onclick: async () => {
                items = (await post("/api/checklist/remove", { id: item.id })).items;
                render();
              },
            },
            "Remove",
          )
        : null,
    ),
    tickBox(item, "approve"),
    tickBox(item, "claude"),
  );
}

const head = () =>
  el(
    "thead",
    {},
    el(
      "tr",
      {},
      el("th", {}, "Item"),
      el("th", { class: "cb owner" }, `${owner} approves`),
      el("th", { class: "cb cl" }, "Claude does"),
    ),
  );

function render() {
  $("#lead").textContent =
    `Tick who handles each item. ${owner} approves = one line in the plan, you say yes or no. ` +
    "Claude does = always in the plan, no question. Both empty = not in the plan.";
  const important = items.filter((item) => item.important);
  const rest = items.filter((item) => !item.important);
  $("#important-title").textContent = `Important (${important.length})`;
  $("#rest-title").textContent = `All the rest (${rest.length})`;
  $("#important").replaceChildren(head(), el("tbody", {}, important.map(itemRow)));
  let group = null;
  const rows = [];
  for (const item of rest) {
    if (item.group !== group) {
      group = item.group;
      rows.push(el("tr", { class: "grp" }, el("td", { colspan: 3 }, group)));
    }
    rows.push(itemRow(item));
  }
  $("#rest").replaceChildren(head(), el("tbody", {}, rows));
}

function limitProblem() {
  for (const field of ["name", "description"]) {
    const [min, max] = LIMITS[field];
    const length = lines($(`#add-${field}`).value);
    const label = field === "name" ? "Name" : "Description";
    if (/[<>]/.test($(`#add-${field}`).value)) return `${label} must not contain < or >`;
    if (length < min) return `${label} must be at least ${min} characters`;
    if (length > max) return `${label} must be at most ${max} characters (now ${length})`;
  }
  return "";
}

for (const id of ["#add-name", "#add-description"])
  $(id).addEventListener("input", () => {
    const touched = $("#add-name").value || $("#add-description").value;
    $("#add-error").textContent = touched ? limitProblem() : "";
  });

$("#add-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const problem = limitProblem();
  if (problem) {
    $("#add-error").textContent = problem;
    return;
  }
  try {
    items = (await post("/api/checklist/add", { name: $("#add-name").value, description: $("#add-description").value })).items;
  } catch (error) {
    // The server's reason (for example "< or >" or hidden characters) arrives as "400 {"error":"…"}".
    const raw = String(error.message).replace(/^\d+\s*/, "");
    try {
      $("#add-error").textContent = JSON.parse(raw).error;
    } catch {
      $("#add-error").textContent = raw;
    }
    return;
  }
  $("#add-name").value = "";
  $("#add-description").value = "";
  $("#add-error").textContent = "";
  render();
});

render();
