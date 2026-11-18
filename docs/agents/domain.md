# Domain Docs

This repository uses a single-context domain documentation layout.

## Before exploring

- Read `GLOSSARY.md` when it exists.
- Read relevant decisions under `docs/adr/` when they exist.
- If these files do not exist, proceed silently. Domain-modeling skills create
  them when terminology or decisions need to be documented.

## Vocabulary

Use terms defined in `GLOSSARY.md` consistently in issues, specifications,
tests, and implementation proposals. If a required concept is missing, either
reuse existing project terminology or record the gap for domain modeling.

## Architecture decisions

Surface conflicts with existing ADRs explicitly instead of silently overriding
them.
