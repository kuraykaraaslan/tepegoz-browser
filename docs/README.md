# Documentation map

This repository follows the shared documentation layout. Create a folder only when it has a file; names are lower-case kebab-case.

| Folder | What is here |
|---|---|
| [phases/](phases/) | Repository-wide plans, ordered by `NN-subject` (status table and legend in the index). |
| [adr/](adr/) | Architecture and design decisions, one file each (`NNNN-slug.md`). |
| [concepts/](concepts/) | Long-lived descriptions of an area (what and why), each with its own `phases/`. |
| [audits/](audits/) | Dated snapshots of the state of the code or the system; never edited afterwards. |
| [guides/](guides/) | How to do a task: build, deploy, operate, troubleshoot. |
| [reference/](reference/) | Specs and catalogs that are looked up: protocols, APIs, tables, matrices. |
| [research/](research/) | Competitor, market and source-tour material. |
| [archive/](archive/) | Finished or superseded documents, moved here rather than deleted. |

## Where does a new document go?

| It is … | It goes to |
|---|---|
| work to be done, ordered, with status | `phases/` |
| one decision with its reasoning | `adr/` |
| what an area is and why (scope, boundaries, vocabulary) | `concepts/<name>/` |
| a dated snapshot of the state of the code or system | `audits/` |
| steps to do a task | `guides/` |
| something looked up (protocol, API, token table, matrix) | `reference/` |
| competitor, market or source-tour material | `research/` |
| finished, dropped or superseded | `archive/` |

Rules: `internal-ai-rules/Documentation_and_Handover_Rules/repository-documentation-layout.md`.
