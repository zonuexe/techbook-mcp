---
name: techbook-mcp-release-prep
description: Prepare and ship a techbook-mcp release: bump the version, update the changelog, verify, commit, tag and push, publish to npm, and create the GitHub release. Use when the user asks to prepare the next version, cut or publish a release, or make sure versioned files are consistent before tagging.
metadata:
  internal: true
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
- `src/version.ts` — `VERSION` constant (single source of truth for the MCP server version and HTTP User-Agent; must match `package.json`)
- `plugin.json` — `"version"` field (Agent Plugins manifest; must match `package.json`)

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

- version bump in `package.json`, `package-lock.json`, `src/version.ts`, and `plugin.json`
- `CHANGELOG.md` update

Use this commit message format:

```text
Bump up version to x.y.z
```

Do not include other unrelated changes in the release commit.

## Tag and Push

After the release commit passes verification, tag it and push both the branch and the tag.
The tag must exist on the remote before the GitHub release can reference it.

```bash
git tag vX.Y.Z
git push origin HEAD
git push origin vX.Y.Z
```

Use a `v`-prefixed tag (`vX.Y.Z`) to match the existing tags and the `CHANGELOG.md` compare links.

## Publish to npm

```bash
npm publish --dry-run   # review the packed file list first
npm publish
```

`prepublishOnly` runs `npm run build`, so `dist/` is rebuilt and published automatically.
This is an outward-facing, irreversible step — confirm the version and dry-run output before publishing.

## Create the GitHub Release

Create a release at <https://github.com/zonuexe/techbook-mcp/releases> for the new tag, using the
matching `CHANGELOG.md` section as the notes. Requires the `vX.Y.Z` tag to be pushed and the
`gh` CLI authenticated.

Extract the version's changelog section (heading excluded) and create the release:

```bash
VERSION=X.Y.Z
awk -v h="## [$VERSION]" '
  index($0, h) == 1 { flag = 1; next }   # start after this version heading
  /^## \[/          { flag = 0 }         # stop at the next version heading
  flag
' CHANGELOG.md > /tmp/techbook-mcp-release-notes.md

gh release create "v$VERSION" \
  --title "v$VERSION" \
  --notes-file /tmp/techbook-mcp-release-notes.md
```

- Title matches the git tag (`vX.Y.Z`).
- Body is the user-facing `Added` / `Changed` / `Fixed` / `Security` entries from `CHANGELOG.md`.
- Omit `--prerelease` for normal releases.
- After creating, open the releases page and confirm the notes render correctly.

## Quick Checklist

- Working tree starts clean or you understand every pending change.
- `CHANGELOG.md` has a new `## [x.y.z] - YYYY-MM-DD` section with user-facing entries.
- `package.json`, `package-lock.json`, `src/version.ts`, and `plugin.json` all show the new version.
- Bottom-of-file links in `CHANGELOG.md` are consistent.
- `npm test` passed.
- `npm run lint` passed.
- `npm run build` passed.
- Commit message is `Bump up version to x.y.z` (this project does not use Conventional Commits).
- Tag `vx.y.z` created and pushed to the remote.
- `npm publish` done (after reviewing `npm publish --dry-run`).
- GitHub release created at <https://github.com/zonuexe/techbook-mcp/releases> with the `CHANGELOG.md` section as notes.
