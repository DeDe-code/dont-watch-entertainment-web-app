# Token-Efficient Coding Agent Workflow

## Purpose

This workflow keeps coding-agent sessions fast, focused, and inexpensive without reducing implementation quality.

It complements:

- `.github/copilot-instructions.md`
- `.github/agents/frontend-coding.agent.md`

Those files remain authoritative for architecture, safety, Git boundaries, Figma authority, and code quality.

## Core working model

Use **one GitHub task, one branch, and one PR**, but split implementation into **small coding-agent sessions**.

A task may require several implementation slices. Each slice should solve one coherent behavior and stop as soon as that slice is implemented and its focused tests pass.

Do not ask one coding-agent session to investigate, design, implement, test, review, and report an entire medium or large task when the work can be split safely.

## Session scope

For every coding-agent session:

1. Give the exact task ID and issue number.
2. Give only the current implementation slice.
3. Name the files or areas that are expected to matter.
4. Allow direct imports/dependencies to be inspected only when necessary.
5. State explicit non-goals.
6. State the exact focused tests to run.
7. Stop after the slice is complete.

Do not re-implement or redesign work completed by an earlier slice.

## Repository inspection rules

- Do not investigate the repository broadly.
- Read only explicitly named files plus direct imports/dependencies needed to implement the slice.
- Do not read full planning documents unless the issue/code is genuinely ambiguous.
- Do not repeatedly re-read unchanged files or task context.
- Do not dump large files or tool results into chat.
- Use targeted search for a known symbol/file before any broad search.
- If the expected code cannot be found, expand scope only enough to locate the missing dependency.

## External tool and MCP budget

External/MCP calls are expensive and must be deliberate.

### Default budget

Aim for **no more than 8 external/MCP calls per implementation slice**.

If more calls appear necessary, stop and report the exact missing information or blocker instead of continuing exploratory calls.

Local file reads, edits, and focused test commands should also remain narrow, but they do not count toward this external-call budget.

### GitHub MCP

Do not use GitHub MCP when the full task contract is already present in the prompt.

Use GitHub MCP only when required issue/repository metadata is genuinely missing.

Never mutate GitHub state from the coding agent.

### Figma MCP

Use Figma only when visual evidence is required.

- Restrict access to the exact approved node IDs.
- Prefer one high-quality inspection per required node.
- Reuse already retrieved evidence.
- Do not explore the whole Figma file.
- Do not repeatedly fetch the same node unless a specific required detail is missing.

## Implementation behavior

- Work directly; do not narrate routine investigation or tool calls.
- Do not restate the task before working.
- Prefer the smallest coherent change that satisfies the current slice.
- Reuse existing project patterns.
- Avoid unrelated cleanup and refactoring.
- Avoid speculative abstractions.
- Do not implement future slices early.
- Keep SSR, accessibility, API contracts, security, and Figma requirements intact.

## Slice sizing

A good slice usually has:

- one main responsibility;
- a small number of closely related files;
- a focused test target;
- a clear completion condition.

Examples:

- one component plus its focused tests;
- one composable behavior plus its focused tests;
- one API interaction path plus rollback/error tests;
- one page state or integration behavior.

The task remains one branch and one PR even when several slices are used.

## Testing

During an implementation slice:

- run only the focused tests named in the prompt;
- run a relevant regression test only when shared behavior changed;
- run `git diff --check`;
- inspect the slice diff before finishing.

Do not run the full test suite, full lint, typecheck, format check, or production build unless the prompt explicitly requests them.

The human/ChatGPT validation phase performs broader validation before commit.

## Handoff format

The final coding-agent response must be **10 lines or fewer whenever practical**.

No tables. No repeated acceptance-criteria explanations. No narrative history.

Use this format:

```text
Task: <task / slice>
Files: <changed files>
Implemented:
- <up to 4 concise bullets>
Tests: <focused command/result>
Diff check: <pass/fail>
Blocker: <none or exact blocker>
READY FOR REVIEW
```

Do not paste large code blocks, logs, or tool output unless a failure requires a short excerpt.

## Stop conditions

Stop instead of expanding the session when:

- the requested slice requires a public API/architecture change not already approved;
- task dependencies are not satisfied;
- required Figma evidence is outside the approved node list;
- unrelated user work would be overwritten;
- the task contract is ambiguous in a way that materially affects implementation;
- the external/MCP-call budget would need to be exceeded for exploratory work;
- implementation reveals a separate task that should not be folded into the current slice.

Report the blocker concisely and wait for direction.

## Git workflow

The coding agent must not stage, commit, push, create branches, create PRs, merge PRs, or mutate issues/projects.

The human user performs Git/GitHub write operations after review and validation.

## Task completion workflow

For a medium or large frontend task:

1. ChatGPT explains the task and proposes implementation slices.
2. User creates the dedicated task branch.
3. Coding agent implements slice A and runs focused tests.
4. ChatGPT reviews the handoff/diff.
5. Coding agent or user applies only necessary corrections.
6. Repeat for slices B/C as needed.
7. ChatGPT reviews the combined final diff.
8. User runs broad validation:
   - lint;
   - typecheck;
   - full tests;
   - format check;
   - production build;
   - `git diff --check`.
9. User commits, pushes, creates/merges the PR.
10. Only then start the next task.

## Prompt template

```text
Implement <TASK / issue>, slice <name>, on the current prepared branch.

Follow:
- .github/copilot-instructions.md
- .github/agents/frontend-coding.agent.md
- docs/workflows/token-efficient-coding-agent-workflow.md

SCOPE
<exact behavior for this slice>

EXPECTED FILES
<small file list>
You may inspect direct imports/dependencies only if required.

DO NOT
- use GitHub MCP;
- inspect unrelated repository areas;
- read full planning documents;
- implement later slices;
- narrate routine investigation;
- dump large tool/file output.

FIGMA
<approved nodes or N/A>
Use only these nodes and reuse retrieved evidence.

TOOL BUDGET
Aim for <= 8 external/MCP calls.
If more are needed for exploration, stop and report the blocker.

FOCUSED TESTS
<exact tests>

FINISH
- run focused tests;
- run git diff --check;
- inspect the slice diff;
- do not stage/commit/push.

HANDOFF
Maximum 10 lines using the project compact handoff format.
```
