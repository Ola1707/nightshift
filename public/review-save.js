// "Review done ✓" and "Reopen the review": one save at a time, and reopening asks first. A plain module with no
// imports, so the unit tests (review-save.test.mjs) import it in Node.

export const REOPEN_QUESTION = "Reopen the review? Deploys held for the review will wait again.";

/**
 * @param {{ save: (done: boolean) => Promise<unknown>, reload: () => void, confirm: (text: string) => boolean }} deps
 *   `save` posts the review, `reload` reloads the page, `confirm` asks the owner.
 */
export function reviewSaver({ save, reload, confirm }) {
  // Set while a save runs and kept after it finished: the page is reloading, so a stray click does nothing.
  let busy = false;

  async function run(done) {
    busy = true;
    try {
      await save(done);
    } catch (error) {
      busy = false;
      throw error;
    }
    reload();
  }

  return {
    /** Marks the review done; `question` (when not empty) is asked first. Ignored while a save runs. */
    async markDone(question) {
      if (busy) return;
      if (typeof question === "string" && question && !confirm(question)) return;
      await run(true);
    },
    /** Reopens the review after asking. Ignored while a save runs. */
    async reopen() {
      if (busy) return;
      if (!confirm(REOPEN_QUESTION)) return;
      await run(false);
    },
  };
}
