# Architecture decision records

A decision that shapes the service — its layers, a dependency every module sees, a policy other decisions build
on, a contract another package relies on — is written down as an ADR in `docs/adrs/`. A decision confined to one
module (a field name, the shape of one route) is not: it lives in `DESIGN.md`, in the issue, or in the code.

## Why they exist

An agent or a person picking up a task must be able to find the decisions that constrain it without reading
everything. So every ADR starts with front matter that answers one question: *do I need to read this for what I am
doing now?* The body is read only when the answer is yes.

## One file per decision

`docs/adrs/<short-kebab-case-name>.md`. The name says what the decision is about (`database-access-with-kysely.md`),
not when it was made. There are no numbers: numbering forces agents working in parallel to coordinate on the next
free one, and git already orders the history.

## Front matter

```yaml
---
title: Database access with Kysely
description: Kysely over pg is the only way to the database; row types come from kysely-codegen; migrations are TS files run by Kysely's Migrator.
read_when:
  - writing or changing a query, a table or a migration
  - adding a runtime that needs a database connection
  - choosing how a test gets a database
---
```

- `title`: the decision, as a noun phrase.
- `description`: one or two sentences stating what was decided. Not the context, not the reasoning — the outcome.
  Written so that a reader who stops here knows the rule.
- `read_when`: the situations in which this ADR constrains the work. Concrete and task-shaped ("writing a
  migration"), not thematic ("database"). Three to five items.

## Body

Three sections, in this order, written in English, with the reasoning kept short:

- **Context**: what was true and what forced a decision. Facts, with pointers to code or documents, not narrative.
- **Decision**: what we do, stated as rules. Where an alternative was seriously considered, one line on why it lost;
  no survey of everything that exists.
- **Consequences**: what becomes easier, what becomes harder, what other decisions now depend on this one.

Link to other ADRs by file name. Link to issues by URL.

## Changing a decision

ADRs are not immutable. When a decision is refined, add a line at the very end of the file:

```
upd (2026-11-03): the per-request connection on Workers is now opened lazily, on the first query, not at the
start of the request — a `/health` without a database query opens none.
```

Then change the body so that it states the current rule; the `upd` line is the pointer, the body is the truth.
When a decision is abandoned altogether, delete the file and update whatever referenced it. Git keeps the history;
the live set of ADRs describes the live system and nothing else.

## Checklist before merging an ADR

- The `description` alone tells the rule.
- Every `read_when` item names a task someone will actually have.
- The body does not repeat `DESIGN.md`; it links to it.
- Nothing in it is a plan or a to-do: those are issues.
