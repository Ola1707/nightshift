// The Flow page: how work goes for each type of change, from GET /api/flow, with an Approve button per type.
import { $, api, el, nav, post, reviewWaiting, toast } from "/common.js";

$("#nav").replaceWith(nav("/flow"));
reviewWaiting();

// What each role does, shown in the legend after its name.
const ROLE_HINTS = { planner: "plans, writes prompts", coder: "codes", runner: "fixed commands" };

// Text in the flow may hold **bold** and `code`.
function rich(text) {
  return String(text)
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith("**")
        ? el("b", {}, part.slice(2, -2))
        : part.startsWith("`")
          ? el("code", {}, part.slice(1, -1))
          : part,
    );
}

const list = (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

// A step box: role name (or its own label), then the text with its small notes. When the text is a list,
// each line is followed by the note with the same index; otherwise all notes come after the text.
function stepBox(step, roles) {
  const role = roles[step.who] ?? step.who;
  const label = step.label ?? (step.subagents ? `${role} subagents` : role);
  const texts = list(step.text);
  const notes = list(step.note);
  const groups =
    texts.length > 1
      ? texts.flatMap((t, i) => [rich(t), notes[i] === undefined ? null : el("small", {}, rich(notes[i]))])
      : [rich(texts[0] ?? ""), ...notes.map((n) => el("small", {}, rich(n)))];
  const body = groups.filter(Boolean).flatMap((group, i) => [i > 0 ? el("br") : null, group]);
  return el("div", { class: `s r-${step.who}` }, el("b", {}, label), body);
}

const boxes = (steps, roles) =>
  steps.flatMap((step, i) => [i > 0 ? el("span", { class: "arr" }, "→") : null, stepBox(step, roles)]);

const row = (steps, roles) => el("div", { class: "flow" }, boxes(steps, roles));

function approval(type) {
  const setApproved = async (approved) => {
    flow = await post("/api/flow/approve", { id: type.id, approved });
    render();
    toast(approved ? "Approved" : "Approval removed");
  };
  if (type.approved)
    return el(
      "div",
      { class: "approval" },
      el("span", { class: "chip good" }, `Approved ${new Date(type.approvedAt).toLocaleDateString()}`),
      el("button", { class: "link", type: "button", onclick: () => setApproved(false) }, "Undo"),
    );
  return el(
    "div",
    { class: "approval" },
    type.changed ? el("span", { class: "chip warn" }, "Changed since you approved it") : null,
    el("button", { type: "button", onclick: () => setApproved(true) }, "Approve"),
  );
}

function typeCard(type, n, roles) {
  return el(
    "div",
    { class: "type", "data-type": type.id },
    el("div", { class: "type-head" }, el("h3", {}, `${n} · ${type.title}`), approval(type)),
    type.example ? el("div", { class: "ex" }, rich(type.example)) : null,
    type.steps ? row(type.steps, roles) : null,
    (type.parts ?? []).map((part) => [
      el(
        "div",
        { class: "stage" },
        part.title,
        part.note ? [" ", el("small", {}, part.note)] : null,
      ),
      row(part.steps, roles),
    ]),
    type.rules?.length
      ? el(
          "ul",
          { class: "night" },
          type.rules.map((r) => el("li", {}, el("b", {}, `${r.title}:`), " ", rich(r.text))),
        )
      : null,
  );
}

let flow = await api("/api/flow");

function render() {
  const { roles } = flow;
  $("#intro").replaceChildren(...rich(flow.intro));
  $("#legend").replaceChildren(
    ...Object.entries(roles).map(([id, name]) =>
      el("span", { class: `r-${id}` }, ROLE_HINTS[id] ? `${name} (${ROLE_HINTS[id]})` : name),
    ),
  );
  $("#types").replaceChildren(...flow.types.map((type, i) => typeCard(type, i + 1, roles)));
  $("#always").replaceChildren(
    ...flow.always.map((r) => el("li", {}, el("b", {}, `${r.title}:`), " ", rich(r.text))),
  );
  $("#each-day").replaceChildren(...boxes(flow.eachDay, roles).filter(Boolean));
}

render();
