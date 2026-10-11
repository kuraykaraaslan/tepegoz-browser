# Release notes template

Business-readable notes for every tagged release (QA-DELIVERY-13). Copy this template into the
release description (and the `CHANGELOG.md` section being released); write for a user/stakeholder,
not a developer.

---

## Tepegöz <version> — <date>

**Summary:** <one or two sentences: what this release is about.>

### New

- <feature, in user terms — what can they do now?>

### Fixed

- <fix, in user terms — what stopped being broken?>

### Verified

- [ ] `pnpm exec turbo run typecheck lint test build` green on the release commit
- [ ] `pnpm e2e` smoke green (app launches, chrome renders, tab loads)
- [ ] Manual smoke: launch → browse → close → relaunch restores the session
- [ ] Settings: set + remove an API key; switch theme and locale (en/tr)
- [ ] Agent: run a task, approve/reject the plan, cancel mid-run

### Known limitations

- <anything shipped intentionally incomplete, and where it's tracked (phase/issue).>

### Rollback

- <how to get back to the previous version, and any data-format caveats (DB migrations are
  forward-only; note when a downgrade needs a userData backup).>
