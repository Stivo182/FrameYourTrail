# Issue tracker: Local Markdown

Issues and specs for this repo live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are stored individually at
  `.scratch/<feature-slug>/issues/<NN>-<slug>.md`
- Triage state is recorded as a `Status:` line near the top of each issue
- Comments are appended under a `## Comments` heading

## Publishing

When a skill says to publish to the issue tracker, create a file under
`.scratch/<feature-slug>/`, creating the directory when needed.

## Fetching

Read the referenced file. The user will normally provide its path or issue
number.

## Wayfinding operations

- Map: `.scratch/<effort>/map.md`
- Child ticket: `.scratch/<effort>/issues/NN-<slug>.md`
- Ticket type is recorded in a `Type:` line
- Ticket status is recorded in a `Status:` line
- Dependencies are recorded as `Blocked by: NN, NN`
- Claim a ticket by setting `Status: claimed`
- Resolve it by adding an `## Answer`, setting `Status: resolved`, and recording
  the result in the map
