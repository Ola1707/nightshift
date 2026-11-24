// The owner's OK on a `worse` impact item, ticked on the board's pick page (docs/plan-tasks-json.md, point 1).
//   setImpactOk(roadmapDir, config, { file, id, key, ok })  sets or removes `approved` and returns the task's impact
// Only the configured JSON task files (night-run/<base>.json) can be written.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const fail = (message) => Object.assign(new Error(message), { status: 400 });

export function setImpactOk(roadmapDir, config, { file, id, key, ok }, today = new Date()) {
  const allowed = config.taskFiles.map(({ file: name }) => `night-run/${name.replace(/\.(md|json)$/, "")}.json`);
  if (typeof file !== "string" || !allowed.includes(file)) throw fail("not a task file");
  const path = join(roadmapDir, file);
  if (!existsSync(path)) throw fail("task file not found");
  const data = JSON.parse(readFileSync(path, "utf8"));
  const task = (data.tasks ?? []).find((t) => t.id === id);
  if (!task) throw fail("task not found");
  const answer = typeof key === "string" && Object.hasOwn(task.impact ?? {}, key) ? task.impact[key] : null;
  if (!answer) throw fail("impact item not found");
  if (answer.effect !== "worse") throw fail("only a worse item needs an OK");
  if (ok) answer.approved = today.toISOString().slice(0, 10);
  else delete answer.approved;
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  return task.impact;
}
