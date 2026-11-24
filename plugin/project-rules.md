# The project's own rules

Rule 1 comes before all of these: `rule-1.md` (new information only).

Every Nightshift skill has two files:

- **The plugin's** `skills/<skill>/SKILL.md`: the tool, the same for every project. A project never edits it. A fix
  or a better way of working that would help any project goes into Nightshift itself (its own repo), not into the
  project's files.
- **The project's** `<paths.board>/skills/<skill>.md`: only what this project adds: its commands, paths, names,
  wording, extra steps and checks. `<paths.board>/skills/all.md` adds to every skill. A skill with nothing to add has
  no file.

Below, `<plugin>` is this file's folder: two levels up from the skill's base directory.

## Reading them

Run `pnpm exec nightshift rules <skill> --plugin <plugin>` (or `npx nightshift rules ...`). One line per file:

- `OK <name>: read <file>`: read it. It adds to the skill; where the two differ, the project's file wins.
- `NONE <name>`: nothing to read.
- `CHANGED <name>`: the plugin skill changed since the project's file was last checked. Go through it first (below),
  then read it.

## Adding a rule

Only after the owner's yes. Ask with AskUserQuestion, one short line: the rule and the file it goes into. Then:

- a rule only this project needs (a command, a path, a name, its own wording or check) → the project's file;
- a rule about how the skill itself works, useful to any project → say so, and offer to change Nightshift instead.
  Never put a fix to the tool into the project's file.

## After the plugin changed (`CHANGED`)

Before doing the skill's work (for a night run: before the run starts), read the new `SKILL.md` and the project's
file side by side and go through each rule:

- the skill now says the same → remove the rule from the project's file;
- the rule contradicts the skill → ask the owner which one stays (AskUserQuestion, one question per conflict; in a
  night run, in its one round of questions). The project's rule stays → keep it; the skill's way → remove the rule;
- the rule refers to a step, name or section the skill no longer has → move it to where it now fits, or ask;
- otherwise → leave it.

Then run `nightshift rules <skill> --plugin <plugin> --mark` (it records the files as checked) and tell the owner in
one line what was removed, moved or kept. These are docs only: no checks, no commit.
