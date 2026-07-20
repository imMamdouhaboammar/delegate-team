# Local release process

`delegate-team` is published from a trusted maintainer workstation. GitHub Actions does not publish npm packages and does not create GitHub Releases.

## Why

- npm authentication already lives on the maintainer device.
- A local release keeps credentials and final authority under direct operator control.
- CI remains useful for build, tests, security, and package-integrity checks, but it is not a release control plane.
- A failing or obsolete workflow must not block an otherwise verified release.

## Preconditions

```bash
npm whoami
npm view delegate-team@<version> version

git status --short --branch
git fetch origin
```

The working tree must be clean, the intended version must not already exist on npm, and local `master` must include the changes being released.

## Verify

```bash
npm ci
npm run release:verify
```

`release:verify` runs version synchronization, type checking, linting, build, the full test suite, production dependency audit, packed-artifact inventory and clean-install smoke testing, and an npm publish dry run.

## Publish

```bash
npm run release:publish
npm view delegate-team@<version> version
npx -y delegate-team@<version> --version
```

Do not use `sudo`. Fix the local Node/npm ownership or use a user-owned Node installation such as nvm.

## Git tag and GitHub Release

After npm registry verification:

```bash
git push origin master
git tag v<version>
git push origin v<version>
gh release create v<version> --title "delegate-team v<version>" --generate-notes
```

A maintainer may provide a curated `--notes-file` instead of generated notes.

## Policy

- Never add a GitHub Actions workflow that publishes to npm automatically.
- Never make npm publishing depend on a GitHub Release workflow.
- Keep package-integrity CI read-only.
- If an automation repeatedly blocks release without protecting a real invariant, remove it or rebuild it before the next release.
