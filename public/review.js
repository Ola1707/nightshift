import { $, api, decisionRow, el, href, nav, ownProposed, post, proposedKey, reviewWaiting } from "/common.js";
import { failureParts, stepsLink } from "/failure-report.js";
import { reviewSaver } from "/review-save.js";

$("#nav").replaceWith(nav("/review"));
reviewWaiting();

const STATUS = {
  done: ["good", "done"],
  partial: ["warn", "partly done"],
  "not-done": ["bad", "not done"],
};

// Pictures the server found blank or missing (GET /api/runs/<run> "pictures": path → "blank" | "missing").
let pictureProblems = {};
// Test report pages the runs folder no longer has (GET /api/runs/<run> "reports": file → "missing").
let missingReports = {};
const PROBLEM_TEXT = { blank: "Blank picture", missing: "Missing picture" };

function shot(s) {
  const problem = pictureProblems[s.path];
  if (!problem)
    return el(
      "a",
      { class: "shot", href: href(s.path), target: "_blank", rel: "noopener" },
      el("img", { src: href(s.path), alt: s.label, loading: "lazy" }),
      s.label,
    );
  // A blank picture still opens (to see it really is empty); a missing one has nothing to open.
  return el(
    problem === "blank" ? "a" : "div",
    {
      class: "shot",
      href: problem === "blank" ? href(s.path) : null,
      target: "_blank",
      rel: "noopener",
      title: s.path,
    },
    el(
      "span",
      { class: "shot-problem" },
      el("span", { class: "chip bad" }, PROBLEM_TEXT[problem] ?? problem),
    ),
    s.label,
  );
}

const shots = (list = []) =>
  list.length
    ? el("div", { class: "shots" }, list.map(shot))
    : el("div", { class: "muted small" }, "—");

// A full-size video with sound controls, in the same modal as the pictures (common.js).
function openVideo(src, label) {
  const dialog = el(
    "dialog",
    { class: "picture-modal", "aria-label": label || "Video" },
    el(
      "div",
      { class: "picture-bar" },
      el("span", { class: "picture-label" }, label),
      el("button", { class: "picture-close", type: "button", "aria-label": "Close" }, "✕"),
    ),
    el("video", { src, controls: true, autoplay: true, playsinline: true }),
  );
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog || e.target.closest(".picture-close")) dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

// A video plays as a silent loop the size of a shot, labelled "Video · <seconds> s", so it never looks like a still.
function video(v) {
  const length = el("span", { class: "video-label" }, "Video");
  const player = el("video", {
    src: href(v.path),
    muted: true,
    autoplay: true,
    loop: true,
    playsinline: true,
    preload: "metadata",
    "aria-label": v.label,
  });
  // The attribute alone doesn't mute a video made in script; autoplay needs it muted.
  player.muted = true;
  player.addEventListener("loadedmetadata", () => {
    if (Number.isFinite(player.duration))
      length.textContent = `Video · ${Math.round(player.duration)} s`;
  });
  return el(
    "button",
    {
      type: "button",
      class: "shot video-shot",
      title: "Open full size with sound",
      onclick: () => openVideo(href(v.path), v.label),
    },
    el("span", { class: "video-frame" }, player, length),
    v.label,
  );
}

const videos = (list = []) =>
  list.length ? el("div", { class: "shots videos" }, list.map(video)) : null;

function section(title, ...children) {
  return [el("div", { class: "section-head" }, el("h2", {}, title)), ...children];
}

function qaBox(runName, task, qa, onChange) {
  const state = qa[task.id] ?? { checked: false, note: "" };
  const check = el("input", { type: "checkbox", checked: state.checked });
  const label = el(
    "label",
    { class: `qa ${state.checked ? "done" : ""}` },
    check,
    state.checked ? "QA checked" : "QA: check it",
  );
  const note = el(
    "textarea",
    { placeholder: "Problem found? Write it here (it becomes a bug for the Bug flow)", rows: 1 },
    state.note,
  );
  const save = async () => {
    const next = await post(`/api/runs/${runName}/qa`, {
      taskId: task.id,
      checked: check.checked,
      note: note.value,
    });
    onChange(next);
  };
  check.addEventListener("change", save);
  note.addEventListener("change", save);
  return { label, note };
}

// Tasks with nothing to see in an app get a text box too: an answer to their questions or a note for Claude.
function answerBox(runName, task, qa, onChange) {
  const note = el(
    "textarea",
    {
      placeholder: task.questions?.length
        ? "Your answer, or a note for Claude"
        : "A note or a question for Claude",
      rows: 1,
    },
    qa[task.id]?.note ?? "",
  );
  note.addEventListener("change", async () =>
    onChange(
      await post(`/api/runs/${runName}/qa`, { taskId: task.id, checked: false, note: note.value }),
    ),
  );
  return note;
}

function taskCard(runName, task, qa, onChange) {
  const [tone, statusText] = STATUS[task.status] ?? ["", task.status ?? ""];
  const qaParts = task.qa ? qaBox(runName, task, qa, onChange) : null;
  const before = task.videos?.filter((v) => v.when === "before") ?? [];
  const after = task.videos?.filter((v) => v.when !== "before") ?? [];
  return el(
    "div",
    {
      class: `box review-task ${qa[task.id]?.checked ? "qa-done" : ""}`,
      style: "margin-bottom: 12px",
    },
    el(
      "div",
      { class: "head" },
      el(
        "div",
        {},
        el("h3", {}, task.title),
        el(
          "div",
          { class: "chips" },
          task.id && el("span", { class: "chip code" }, task.id),
          task.type && el("span", { class: "chip" }, task.type),
          statusText && el("span", { class: `chip ${tone}` }, statusText),
        ),
      ),
      qaParts?.label,
    ),
    task.done && el("p", { class: "kv" }, el("b", {}, "Done"), task.done),
    task.missing && el("p", { class: "kv" }, el("b", {}, "Missing"), task.missing),
    task.qa && el("p", { class: "kv" }, el("b", {}, "Where to check"), task.qa),
    task.questions?.length > 0 &&
      el(
        "div",
        { class: "kv" },
        el("b", {}, "Questions for you"),
        el(
          "ul",
          { class: "tight" },
          task.questions.map((q) => el("li", {}, q)),
        ),
      ),
    (task.before?.length || task.after?.length || task.videos?.length) > 0 &&
      el(
        "div",
        { class: "cols" },
        el("div", {}, el("div", { class: "label" }, "Before"), shots(task.before), videos(before)),
        el("div", {}, el("div", { class: "label" }, "After"), shots(task.after), videos(after)),
      ),
    task.tests?.length > 0 &&
      el(
        "div",
        { style: "margin-top: 12px" },
        el("div", { class: "label" }, "Tests written"),
        el(
          "ul",
          { class: "tight" },
          task.tests.map((t) =>
            el(
              "li",
              {},
              el("code", {}, t.name),
              t.what ? ` — ${t.what}` : "",
              t.result
                ? el("span", { class: "chip good", style: "margin-left: 6px" }, t.result)
                : "",
            ),
          ),
        ),
      ),
    task.decisions?.length > 0 &&
      el(
        "div",
        { class: "decisions" },
        el("div", { class: "label" }, "Decisions made alone"),
        task.decisions.map((d) =>
          decisionRow(runName, d, qa[`decision:${d.id}`], (next) => onChange(next)),
        ),
      ),
    proposedBlock(runName, task.proposed, qa, onChange),
    qaParts ? qaParts.note : answerBox(runName, task, qa, onChange),
  );
}

// The proposed items of one task or one failed test, on its own card.
function proposedBlock(runName, list, qa, onChange) {
  const items = ownProposed(list);
  return (
    items.length > 0 &&
    el(
      "div",
      { class: "decisions" },
      el("div", { class: "label" }, "Proposed items (you decide)"),
      items.map((p) => proposedRow(runName, p, qa[proposedKey(p.id)], onChange)),
    )
  );
}

// A proposed item: an "Add as an action item" tick (Claude writes it into a roadmap or bugs file) and a text box,
// saved in qa.json under `proposed:<id>`.
function proposedRow(runName, item, state, onChange) {
  const check = el("input", { type: "checkbox", checked: Boolean(state?.checked) });
  const add = el(
    "label",
    { class: `decision-ok ${state?.checked ? "done" : ""}` },
    check,
    "Add as an action item",
  );
  const note = el(
    "textarea",
    { placeholder: "Your comment on this item", rows: 1 },
    state?.note ?? "",
  );
  const save = async () => {
    const qa = await post(`/api/runs/${runName}/qa`, {
      taskId: proposedKey(item.id),
      checked: check.checked,
      note: note.value,
    });
    add.classList.toggle("done", check.checked);
    onChange(qa);
  };
  check.addEventListener("change", save);
  note.addEventListener("change", save);
  return el(
    "div",
    { class: "decision", "data-proposed": item.id },
    el("div", { class: "decision-head" }, add, el("div", {}, item.text)),
    note,
  );
}

// A failed test that was fixed gets a text box under its card, saved in qa.json under `failure:<test>`.
function failureNote(runName, f, qa, onChange) {
  const key = `failure:${f.test}`;
  const note = el(
    "textarea",
    { class: "failure-note", placeholder: "A note or a question about this fix", rows: 1 },
    qa[key]?.note ?? "",
  );
  note.addEventListener("change", async () =>
    onChange(
      await post(`/api/runs/${runName}/qa`, { taskId: key, checked: false, note: note.value }),
    ),
  );
  return note;
}

// The failed test's page from the run (failures.html#<test>): the screenshot, the failed step and all the steps.
function stepsLinkRow(f) {
  const link = stepsLink(f, missingReports);
  if (!link) return "";
  return el(
    "p",
    { class: "kv" },
    el("b", {}, "Steps"),
    link.gone
      ? el("span", { class: "muted" }, link.text)
      : el("a", { href: href(link.href), target: "_blank", rel: "noopener" }, link.text),
  );
}

// "not fixed" is its own state, not a place: never "fixed in the not fixed".
function fixedInChip(fixedIn) {
  if (fixedIn === "not fixed") return el("span", { class: "chip bad" }, "not fixed");
  return el("span", { class: `chip ${fixedIn === "app" ? "warn" : "good"}` }, `fixed in the ${fixedIn}`);
}

function failureCard(f, runName, qa, onChange) {
  const p = failureParts(f);
  return el(
    "div",
    { class: "box", style: "margin-bottom: 12px" },
    el(
      "div",
      {
        class: "head",
        style: "display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap",
      },
      el("div", {}, el("h3", {}, p.title), p.id && el("code", { class: "muted small" }, p.id)),
      el(
        "div",
        { class: "chips", style: "margin: 0" },
        f.app && el("span", { class: "chip" }, f.app),
        f.platform && el("span", { class: "chip" }, f.platform),
        fixedInChip(f.fixedIn),
      ),
    ),
    p.steps.length > 0 &&
      el(
        "div",
        { class: "kv" },
        el("b", {}, "Steps before"),
        el("ol", { style: "margin: 4px 0 0" }, ...p.steps.map((s) => el("li", {}, s))),
      ),
    stepsLinkRow(f),
    p.expected && el("p", { class: "kv" }, el("b", {}, "Expected"), p.expected),
    p.actual && el("p", { class: "kv" }, el("b", {}, "Actual"), p.actual),
    el(
      "p",
      { class: "kv" },
      el("b", {}, "The fix"),
      p.fix ?? "",
      p.fixFile ? el("code", { style: "margin-left: 6px" }, p.fixFile) : "",
    ),
    f.screenshot
      ? shots([{ label: "actual flow", path: f.screenshot }])
      : el("div", { class: "muted small" }, "No screenshot of the actual flow"),
    proposedBlock(runName, f.proposed, qa, onChange),
    f.fixedIn !== "not fixed" && failureNote(runName, f, qa, onChange),
  );
}

async function show(runName) {
  const { run, qa: initialQa, review, pictures, reports } = await api(`/api/runs/${runName}`);
  pictureProblems = pictures ?? {};
  missingReports = reports ?? {};
  let qa = initialQa;
  $("#title").textContent = run.title;
  const qaTasks = run.tasks.filter((t) => t.qa);
  const decisions = [...run.tasks.flatMap((t) => t.decisions ?? []), ...(run.decisions ?? [])];
  const stats = el("div", { class: "stats" });
  const renderStats = () =>
    stats.replaceChildren(
      el("div", { class: "stat" }, el("b", {}, run.tasks.length), "tasks"),
      el(
        "div",
        { class: "stat" },
        el("b", {}, `${qaTasks.filter((t) => qa[t.id]?.checked).length} / ${qaTasks.length}`),
        "QA checked",
      ),
      el(
        "div",
        { class: "stat" },
        el(
          "b",
          {},
          `${(run.failures ?? []).filter((f) => f.fixedIn !== "not fixed").length} / ${run.failures?.length ?? 0}`,
        ),
        "failed tests fixed",
      ),
      el(
        "div",
        { class: "stat" },
        el("b", {}, run.tasks.flatMap((t) => t.tests ?? []).length),
        "new tests",
      ),
      // Only when the run has decisions (replaceChildren would print a `false`).
      ...(decisions.length
        ? [
            el(
              "div",
              { class: "stat" },
              el(
                "b",
                {},
                `${decisions.filter((d) => qa[`decision:${d.id}`]?.checked).length} / ${decisions.length}`,
              ),
              "decisions ticked",
            ),
          ]
        : []),
    );
  renderStats();
  const onChange = (next) => {
    qa = next;
    renderStats();
    show.cards?.forEach(([task, node]) =>
      node.classList.toggle("qa-done", Boolean(qa[task.id]?.checked)),
    );
    show.cards?.forEach(([task, node]) => {
      const label = node.querySelector(".qa");
      if (!label) return;
      label.classList.toggle("done", Boolean(qa[task.id]?.checked));
      label.lastChild.textContent = qa[task.id]?.checked ? "QA checked" : "QA: check it";
    });
  };
  const cards = run.tasks.map((t) => [t, taskCard(runName, t, qa, onChange)]);
  show.cards = cards;

  const list = (items) =>
    el(
      "div",
      { class: "box" },
      el(
        "ul",
        { class: "tight" },
        items.map((i) => el("li", {}, i)),
      ),
    );

  $("#content").replaceChildren(
    stats,
    ...(run.you?.length ? section("You (before anything else)", list(run.you)) : []),
    run.links?.length || run.deploys?.length || run.notDeployed
      ? el(
          "div",
          { class: "box" },
          run.links?.length > 0 &&
            el(
              "p",
              { class: "kv" },
              el("b", {}, "Links"),
              run.links.map((l, i) => [
                i ? " · " : "",
                el("a", { href: href(l.url), target: "_blank", rel: "noopener" }, l.label),
              ]),
            ),
          (run.deploys ?? []).map((d) =>
            el(
              "p",
              { class: "kv" },
              el("b", {}, d.env),
              d.what,
              d.log
                ? [
                    " · ",
                    el(
                      "a",
                      { href: href(d.log), target: "_blank", rel: "noopener" },
                      "release log",
                    ),
                  ]
                : "",
            ),
          ),
          run.notDeployed && el("p", { class: "kv" }, el("b", {}, "Not deployed"), run.notDeployed),
        )
      : null,
    ...(run.built?.length
      ? section(
          "Built",
          el(
            "div",
            { class: "box" },
            el(
              "ul",
              { class: "tight" },
              run.built.map((b) => el("li", {}, b)),
            ),
          ),
        )
      : []),
    ...(run.decisions?.length
      ? section(
          "Decisions",
          el(
            "div",
            { class: "box decisions" },
            run.decisions.map((d) => decisionRow(runName, d, qa[`decision:${d.id}`], onChange)),
          ),
        )
      : []),
    ...section("Tasks", ...cards.map(([, node]) => node)),
    ...(run.testRuns?.length
      ? section(
          "Test runs",
          el(
            "div",
            { class: "table-wrap" },
            el(
              "table",
              { class: "runs" },
              el(
                "tr",
                {},
                ["Suite", "Result", "Time", "Report"].map((h) => el("th", {}, h)),
              ),
              run.testRuns.map((r) =>
                el(
                  "tr",
                  {},
                  el("td", {}, r.suite),
                  el("td", {}, r.result),
                  el("td", {}, r.time ?? "—"),
                  el(
                    "td",
                    {},
                    r.report && missingReports[r.report]
                      ? el("span", { class: "muted" }, "page no longer on this computer")
                      : r.report
                        ? el(
                            "a",
                            { href: href(r.report), target: "_blank", rel: "noopener" },
                            r.reportLabel ?? "open",
                          )
                        : "—",
                  ),
                ),
              ),
            ),
          ),
        )
      : []),
    ...(run.failures?.length
      ? section(
          "Failed tests and how they were fixed",
          ...run.failures.map((f) => failureCard(f, runName, qa, onChange)),
        )
      : []),
    ...(run.sections ?? []).flatMap((s) =>
      s.items?.length ? section(s.title, list(s.items)) : [],
    ),
    ...(run.stillOpen?.length
      ? section(
          "Still open",
          el(
            "div",
            { class: "box" },
            run.stillOpen.map((s) =>
              el(
                "div",
                { class: "kv" },
                el("b", {}, s.topic),
                el(
                  "ul",
                  { class: "tight" },
                  s.items.map((i) => el("li", {}, i)),
                ),
              ),
            ),
          ),
        )
      : []),
    ...(run.proposed?.length
      ? section(
          "Proposed items (you decide)",
          el(
            "div",
            { class: "box decisions" },
            ownProposed(run.proposed).map((p) => proposedRow(runName, p, qa[proposedKey(p.id)], onChange)),
          ),
        )
      : []),
    doneBar(runName, review, () => qaTasks.filter((t) => !qa[t.id]?.checked).length),
  );
}

// Until this is pressed the run is offered for review every day, and deploys to the held environments are refused.
// One save at a time (a double-click never lands on "Reopen the review"), and reopening asks first.
function doneBar(runName, review, uncheckedCount) {
  let reloading = false;
  const saver = reviewSaver({
    save: (done) => post(`/api/runs/${runName}/review`, { done }),
    reload: () => {
      reloading = true;
      location.reload();
    },
    confirm: (text) => confirm(text),
  });
  // The clicked button looks pressed while its save runs; it works again after a "no" or a failed save.
  const press = (action) => (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    return action().finally(() => {
      if (!reloading) button.disabled = false;
    });
  };
  if (review.done) {
    return el(
      "div",
      { class: "done-bar done" },
      el(
        "b",
        {},
        `✓ Review done ${new Date(review.at).toLocaleString()}. Held deploys are allowed.`,
      ),
      el("button", { class: "link", onclick: press(() => saver.reopen()) }, "Reopen the review"),
    );
  }
  return el(
    "div",
    { class: "done-bar" },
    el(
      "span",
      {},
      el("b", {}, "Finished reviewing? "),
      "Until you press the button, this run comes back for review every day and held deploys wait.",
    ),
    el(
      "button",
      {
        class: "big",
        onclick: press(() => {
          const left = uncheckedCount();
          return saver.markDone(
            left
              ? `${left} QA item${left > 1 ? "s are" : " is"} not checked. Mark the review done anyway?`
              : "",
          );
        }),
      },
      "Review done ✓",
    ),
  );
}

const runs = await api("/api/runs");
if (!runs.length) {
  $("#content").replaceChildren(
    el("p", { class: "empty" }, "No run with a run.json yet in the runs folder."),
  );
} else {
  // The oldest run still waiting for its review comes first.
  const waiting = runs.filter((r) => !r.reviewed).at(-1);
  const wanted = new URLSearchParams(location.search).get("run") ?? (waiting ?? runs[0]).name;
  $("#runs").replaceChildren(
    ...runs.map((r) =>
      el(
        "option",
        { value: r.name, selected: r.name === wanted },
        `${r.reviewed ? "✓" : "⏳"} ${r.title}`,
      ),
    ),
  );
  $("#runs").onchange = (e) => {
    history.replaceState(null, "", `?run=${e.target.value}`);
    show(e.target.value);
  };
  show(wanted);
}
