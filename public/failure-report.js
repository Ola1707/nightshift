// The "Steps" link of a failure card: run.json's failures[].report is a test report page such as
// `tests/e2e/runs/<run>/failures.html#<test>`. The test runs folder is gitignored and may be cleaned, so the server lists the
// report files it cannot find (GET /api/runs/<run> "reports": file → "missing") and the card says so instead of
// linking a page that is gone. Plain functions, no DOM, so node --test can run them.

/** The file part of a report path (without the #anchor). */
export function reportFile(report) {
  return report.split("#")[0];
}

/**
 * What a failure card shows for the test's steps page.
 * @param {{ report?: string }} failure a run.json failures[] entry
 * @param {Record<string, string>} missing report file → "missing", from the server
 * @returns {{ href: string, text: string } | { gone: true, text: string } | null} null when the failure has no page (old run.json)
 */
export function stepsLink(failure, missing = {}) {
  if (!failure.report) return null;
  if (missing[reportFile(failure.report)])
    return { gone: true, text: "page no longer on this computer" };
  return { href: failure.report, text: "Steps" };
}

/**
 * The failed runs of one test, in order: `attempts` (one per failed run), or the single `screenshot` of an old run.json
 * counted as one attempt. Attempts without a screenshot are kept (their label and failed step still show).
 * @param {{ attempts?: object[], screenshot?: string, failedStep?: string, report?: string }} failure a run.json failures[] entry
 * @returns {{ label?: string, screenshot?: string, failedStep?: string, report?: string }[]}
 */
export function failureAttempts(failure) {
  if (Array.isArray(failure?.attempts) && failure.attempts.length) return failure.attempts;
  return failure?.screenshot ? [{ screenshot: failure.screenshot }] : [];
}
