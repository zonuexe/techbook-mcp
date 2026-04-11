---
name: techbook-mcp-release-prep
description: Prepare a techbook-mcp release by bumping the version, updating the changelog, and running verification. Use when the user asks to prepare the next version, cut a release, or make sure versioned files are consistent before tagging.
---

# techbook-mcp Release Prep

Follow this workflow when preparing a new `techbook-mcp` release.

## Decide the Next Version

Choose the next semantic version before touching any files.

- `patch` (0.x.Y) — bug fixes, no new functionality
- `minor` (0.X.0) — new adapters, new features, backward-compatible changes
- `major` (X.0.0) — breaking changes to the MCP tool interface or `BookRecord` schema

If the user specifies a version, use it. Otherwise infer from the unreleased commits since the last tag.

## Update Versioned Files

Update these files together in one pass:

- `CHANGELOG.md`
- `package.json` — `"version"` field
- `package-lock.json` — `"version"` field in the root object (same value as `package.json`)

### CHANGELOG.md Rules

- If `CHANGELOG.md` does not exist yet, create it with the standard Keep a Changelog header.
- Add a new `## [x.y.z] - YYYY-MM-DD` section directly below `## [Unreleased]`.
- Use Keep a Changelog section headings as needed: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
- Group the same kinds of changes under the same heading.
- Write entries user-facing: what changed, not how. Skip internal refactors unless they affect users.
- List new publisher adapters under `Added`.
- Preserve the release date in every version heading.
- Keep the `[Unreleased]` section empty after moving its contents to the new release section.
- Update the `[Unreleased]` compare link and add the new release compare link at the bottom of the file.
- Keep version headings and bottom-of-file links consistent so releases and compare ranges remain linkable.

### CHANGELOG.md Template (first release)

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [x.y.z] - YYYY-MM-DD

### Added

- ...

[Unreleased]: https://github.com/zonuexe/techbook-mcp/compare/vx.y.z...HEAD
[x.y.z]: https://github.com/zonuexe/techbook-mcp/releases/tag/vx.y.z
```

## Verify Before Committing

Run all checks in order:

```bash
npm test
```

```bash
npm run lint
```

```bash
npm run build
```

All three must pass. Do not commit if any check fails.

## Commit the Release

Prefer a single release-prep commit containing:

- version bump in `package.json` and `package-lock.json`
- `CHANGELOG.md` update

Use this commit message format:

```text
chore: release x.y.z
```

Do not include other unrelated changes in the release commit.

## Quick Checklist

- Working tree starts clean or you understand every pending change.
- `CHANGELOG.md` has a new `## [x.y.z] - YYYY-MM-DD` section with user-facing entries.
- `package.json` and `package-lock.json` both show the new version.
- Bottom-of-file links in `CHANGELOG.md` are consistent.
- `npm test` passed.
- `npm run lint` passed.
- `npm run build` passed.
- Commit message follows `chore: release x.y.z`.
