---
name: issue-release-flow
description: Close completed project issues only after the related work is committed, pushed to both staging and main, and both branches are aligned. Use when finishing implementation work in this repository and preparing release and issue hygiene.
---

# Issue Release Flow

Use this sequence when finishing work in this repository:

1. Confirm the intended issue is actually complete for the requested scope.
2. Check `git status --short --branch` and isolate the relevant changes.
3. Commit the completed work on the current branch.
4. Push to `origin/staging` and confirm staging is updated.
5. Merge the same commit into `main` and push `origin/main`.
6. Verify `main`, `staging`, `origin/main`, and `origin/staging` point to the same commit when the work is meant to be fully released.
7. Close the completed issue with a short note that references the finishing commit.

Do not close an issue before both branch updates are done.
Do not mark an issue complete if the work is only partially implemented or present in one environment.
