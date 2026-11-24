# Changelog

## 0.1.1 (2026-11-24)

- Require SHA-256 verification for Move, including the committed destination before deleting the source.
- Recheck source existence and target file type before Mirror deletions.
- Reject overlapping paths in the same location at runtime.
- Add destructive-operation regression tests.

## 0.1.0 (2026-09-10)

- Initial development release with local, direct SMB2/3 and SFTP providers.
- Atomic streaming synchronization, snapshots, retries, filters, mirror dry-runs, states and Admin UI.
- Encrypted credential vault, path confinement, role checks, monitoring and bilingual UI.
