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

Small typo and documentation fixes may be submitted directly.

## Development setup

1. Clone or fork the repository.
2. Install dependencies:

   ```text
   npm install
   ```

3. Run the tests:

   ```text
   npm test
   ```

4. Start the local frontend:

   ```text
   npm start
   ```

Additional platform-specific build instructions will be documented separately.

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
git diff --check
```

Existing tests should continue to pass.

## Pull requests

- Keep Pull Requests focused.
- Describe what changed and why.
- Reference the related Issue when applicable.
- Explain user-visible changes.
- Include tests for bug fixes and features where practical.
- Avoid unrelated formatting or refactoring.
- Do not commit generated build artifacts unless specifically required.

## Licensing of contributions

Kalah is distributed under GPL-3.0-only. Contributors retain copyright in their contributions; copyright is not transferred to Researcher Universe Labs.

Accepted contributions may be distributed as part of the GPL-licensed version of Kalah. To have a contribution merged, contributors may be required to enter into a Contributor License Agreement (CLA) granting Researcher Universe Labs additional rights to use that contribution in differently licensed, commercial, or proprietary versions of the project.

The separate CLA will define the exact license grant and other applicable terms. Until that agreement is available, no additional rights beyond the contribution's existing license are assumed.

## Copyright

Contributors retain copyright in the code they write unless separately agreed otherwise. A contributor's copyright notice is not automatically added to the project's general copyright notice.

## Technical discussions

Please keep technical discussions respectful and focused on the project.

## Security issues

For potentially sensitive security issues, do not publish vulnerability or exploit details in a public Issue. Please use GitHub Private Vulnerability Reporting as described in [SECURITY.md](SECURITY.md).

Kalah is developed by Researcher Universe Labs and distributed under GPL-3.0-only.
