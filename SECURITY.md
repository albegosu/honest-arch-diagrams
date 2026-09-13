# Security policy

## Supported versions

Security fixes land on the latest release on `main`. Older tags are not patched unless a
fix-visible honesty or secret-leak regression is involved.

| Version | Supported |
|---|---|
| 0.9.x | Yes |
| < 0.9 | Best effort |

## What counts as a security issue here

Please report privately if you find:

- An adapter that emits Secret, ConfigMap, Terraform, or URL **credential values** into a
  model, SVG, D2, or logs.
- A change that lets a model claim a hop with no evidence while still passing the linter.
- Supply-chain or CI issues that would publish compromised skill packages.

Ordinary honesty-rule debates (should this companion be `linked` vs `around`?) belong in
GitHub issues, not security reports.

## How to report

Email **albegosu@gmail.com** with:

- Affected commit / tag
- Minimal fixture or dump that reproduces the leak or honesty bypass (sanitize unrelated
  secrets first)
- Expected vs actual behavior

You should get an acknowledgment within a few days. Please do not open a public issue for
credential leaks until a fix is released (or we agree it is safe to discuss openly).

## Hardening already in place

- Adapters never read Secret/ConfigMap values for evidence; only names.
- Host/URL extraction strips `user:pass` credentials.
- Golden tests assert fixture secret material never appears in adapter output.
- Zero runtime npm dependencies for scripts and adapters (smaller supply-chain surface).
