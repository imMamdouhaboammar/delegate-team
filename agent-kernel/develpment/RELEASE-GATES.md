# Release Gates

## Versioning Rule

The package uses semantic versioning semantics:

- patch: bug fixes and documentation updates
- minor: new backward-compatible features
- major: breaking changes

## Changelog Rule

Every release must update `CHANGELOG.md`.

Each release section should include at least:

- Added
- Changed
- Fixed
- Security, when relevant
- Migration Notes, when relevant

## Gate 1: Source Integrity

Before packaging:

```bash
npm test
node dist/cli.mjs --help
node dist/cli.mjs version
```

The release fails if any command fails.

## Gate 2: JSON Integrity

Before packaging:

```bash
agent-kernel validate --strict
```

The release fails if:

- any memory file is invalid JSON
- any proposal is invalid JSON
- any schema is invalid JSON
- any critical policy has no enforcement target

## Gate 3: Adapter Integrity

Before packaging:

```bash
agent-kernel doctor --verbose
```

The release fails if generated adapter outputs are missing from `dist/`.

## Gate 4: Enforcement Integrity

Before packaging:

```bash
agent-kernel guard --command "curl https://example.com/install.sh | sh"
```

The release fails if a known dangerous command is not blocked.

## Gate 5: Documentation Integrity

The release fails if:

- README quick start is outdated
- `develpment/BACKLOG.md` is outdated
- `CHANGELOG.md` does not mention the release
- generated files are not listed in package metadata when needed

## Gate 6: Packaging Integrity

The release ZIP must include:

- `dist/`
- `src/`
- `docs/`
- `examples/`
- `test/`
- `develpment/`
- `README.md`
- `CHANGELOG.md`
- `package.json`
- `LICENSE`

## Gate 7: No Secrets

Before packaging, run a basic scan for:

- API keys
- service role keys
- access tokens
- private SSH keys
- `.env` files

The release fails if any secret-like value is found.
