# Contributing to Kalah

Thank you for your interest in contributing to Kalah.

Contributions are welcome in the form of bug reports, bug fixes, documentation improvements, accessibility improvements, UI improvements, translations, tests, and gameplay or AI improvements that preserve the project's rules and architecture.

## Before contributing

For substantial changes, please open an Issue first so the proposed approach can be discussed. This is especially important for:

- Changes to the game rules.
- Major UI redesigns.
- Support for new platforms.
- Architectural changes.
- New dependencies.
- Significant AI changes.

Small typo and documentation fixes do not require a prior Issue, but the changes must still be submitted through a Pull Request.

## Development setup

1. Clone or fork the [repository](https://github.com/vlwork/Kalah).
2. Install dependencies:

   ```text
   npm install
   ```

3. Run the tests:

   ```text
   npm test
   ```

4. Build the web version:

   ```text
   npm run build
   ```

5. Start the local frontend:

   ```text
   npm start
   ```

`npm install` is intended for normal local development. Continuous integration uses `npm ci` for a reproducible dependency installation.

Additional platform-specific build instructions will be documented separately.

## Branch and Pull Request workflow

The `main` branch is protected. Direct changes to `main` are not used; all changes, including small documentation fixes, must reach it through a Pull Request. Force-pushing or deleting `main` is prohibited. Before merge, the Pull Request branch must be up to date with `main`, and the required `Test and build` status check must pass. The current ruleset does not require an approving review.

For project maintainers:

1. Work on `develop`.
2. Keep `develop` synchronized with `main`.
3. Commit and push changes to `develop`.
4. Open a Pull Request from `develop` to `main`.
5. Wait for the required `Test and build` check.
6. Merge only after all required checks pass.
7. After merge, fast-forward or otherwise synchronize `develop` with the updated `main`.

For other contributors:

1. Fork the repository if necessary.
2. Create a focused feature, fix, or documentation branch.
3. Make and test the changes.
4. Push the branch to a repository where you have permission.
5. Open a Pull Request targeting `main`.

External contributors do not need push access to `develop` and are not required to base their workflow on that branch.

## Development principles

- Keep the Game Engine independent from the UI where practical.
- Do not allow platform-specific code to leak into gameplay rules.
- Preserve existing Save/Load compatibility where reasonable.
- Keep Russian and English localization synchronized.
- Do not intentionally degrade accessibility.
- Include tests for new behavior where practical.
- Avoid introducing dependencies without a clear reason.
- Do not include secrets, API keys, passwords, personal data, or credentials.

## Testing

Before submitting a Pull Request, run:

```text
npm test
npm run build
git diff --check
```

Existing tests should continue to pass.

New behavior and bug fixes should include tests where practical.

Passing the local checks does not replace the required GitHub CI check.

## Continuous integration

The workflow in `.github/workflows/ci.yml` runs for Pull Requests targeting `main`, pushes to `main`, and manual `workflow_dispatch` runs. Its `Test and build` job performs:

```text
npm ci
npm test
npm run build
```

`Test and build` is a required status check for merging into `main`.

## Pull requests

- Keep Pull Requests focused.
- Describe what changed and why.
- Reference the related Issue when applicable.
- Explain user-visible changes.
- Include tests for bug fixes and features where practical.
- Avoid unrelated formatting or refactoring.
- Do not commit generated build artifacts unless specifically required.
- Complete the Pull Request template sections: Summary, Changes, Testing, and Checklist.
- Mark only checks that were actually completed. All template checkboxes are manual; mark `CI passes` only after the workflow has passed.

## Licensing of contributions

Public versions of Kalah are distributed under GPL-3.0-only. Contributors retain copyright in their contributions; copyright is not transferred to Researcher Universe Labs or the Project Maintainer.

For a contribution to be merged, the contributor may be required to accept the [Contributor License Agreement](CLA.md). The CLA grants the Project Maintainer operating under the Researcher Universe Labs name additional rights, including rights to use the contribution in differently licensed, commercial, or proprietary versions of Kalah. See the CLA for the exact grant and other applicable terms.

The specific CLA acceptance mechanism will be documented separately; this guide does not prescribe one.

## Copyright

Contributors retain copyright in the code they write unless separately agreed otherwise. A contributor's copyright notice is not automatically added to the project's general copyright notice.

## Technical discussions

Please keep technical discussions respectful and focused on the project.

## Security issues

For potentially sensitive security issues, do not publish vulnerability or exploit details in a public Issue. Please use GitHub Private Vulnerability Reporting as described in [SECURITY.md](SECURITY.md).

Kalah is developed by Researcher Universe Labs and distributed under GPL-3.0-only.
