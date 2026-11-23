// What a review task card should shout about, or null when the task is plainly done. A plain module with no
// imports, so the unit tests (task-attention.test.mjs) import it in Node.

/**
 * @param {{ status?: string, missing?: string | null }} task
 * @returns {{ tone: "warn" | "bad", label: string, text: string | null } | null}
 */
export function taskAttention(task) {
  const text = task.missing ? task.missing : null;
  if (task.status === "not-done") {
    if (text && /^\s*wait(s|ing)\b/i.test(text)) return { tone: "warn", label: "Waiting", text };
    return { tone: "bad", label: "Not done", text };
  }
  if (task.status === "partial") return { tone: "warn", label: "Partly done", text };
  if (task.status === "done" && text) return { tone: "warn", label: "Done, something left", text };
  return null;
}
