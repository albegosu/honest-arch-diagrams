# Publishing

How this skill stays discoverable and up to date across installers and marketplaces.

## skills.sh (install)

Users install with:

```bash
npx skills add albegosu/honest-arch-diagrams
```

That clones/copies `skills/honest-arch-diagrams/` (SKILL.md, references, scripts, adapters,
schema). No extra publish step beyond pushing to GitHub `main` and cutting releases.

## npm (CLI)

The same tooling ships as the npm package
[`honest-arch-diagrams`](https://www.npmjs.com/package/honest-arch-diagrams):

```bash
npx honest-arch-diagrams <command>     # bin alias matching the package name
npm i -g honest-arch-diagrams          # honest-arch <command>, honest-arch-lint <model.json>
```

The `files` whitelist in `package.json` keeps the tarball to the skill package
(`skills/honest-arch-diagrams/`), the example models (`examples/*.model.json`, used by
`honest-arch test`) and `CHANGELOG.md`. Social media, renders, `.github/` and local agent
settings stay out. Before publishing:

```bash
npm test
npm pack --dry-run                     # expect ~50 kB, ~40 files, no examples/social
npm pack --pack-destination /tmp       # then run the golden tests from the packed tarball:
cd "$(mktemp -d)" && npx --yes --package /tmp/honest-arch-diagrams-X.Y.Z.tgz \
  honest-arch-diagrams test
```

`prepublishOnly` runs `npm test`, so a red suite blocks `npm publish`.

## agentskill.sh (discovery + sync)

1. Sign in at [agentskill.sh](https://agentskill.sh) and **connect GitHub** so
   `albegosu/honest-arch-diagrams` is claimed.
2. Skills under `skills/**/SKILL.md` sync **daily** by default.
3. **Instant sync on push** — add a GitHub webhook on this repo:

| Setting | Value |
|---|---|
| Payload URL | `https://agentskill.sh/api/webhooks/github` |
| Content type | `application/json` |
| Events | Just the **push** event |

Every push to the default branch re-indexes `SKILL.md` within seconds.

## Claude Code plugin

Marketplace manifest: [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json).

```text
/plugin marketplace add albegosu/honest-arch-diagrams
/plugin install honest-arch-diagrams@honest-arch-diagrams
```

Bump `metadata.version` / plugin `version` in that file together with `package.json` and
SKILL frontmatter when cutting a release.

## Social preview

Upload [`examples/social/og-card.png`](examples/social/og-card.png) under GitHub →
**Settings → General → Social preview**.
Launch assets and regenerate commands: [`examples/social/README.md`](examples/social/README.md).

## Cutting a release

```bash
npm test
npm pack --dry-run
# bump package.json, SKILL metadata.version, .claude-plugin/marketplace.json, CHANGELOG
git tag -a vX.Y.Z -m "vX.Y.Z: …"
git push origin vX.Y.Z
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file CHANGELOG.md
npm publish                            # first time: npm login
```

If the agentskill.sh webhook is configured, the push that lands the tag/commit on `main`
triggers an immediate skill sync.
