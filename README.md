# ioBroker FileSync

FileSync is an ioBroker adapter for streaming files between **local directories, SMB2/SMB3 shares and SFTP servers**. It never mounts shares, edits `fstab`, invokes a shell, or requires `rsync`, `sshfs`, `smbclient` or `cifs-utils`.

> **Development release:** version 0.1.0 is deliberately not advertised as a stable 1.0 release. Test destructive jobs with dry-run and backups first.

## Features

- Any provider pairing (Local/SMB/SFTP → Local/SMB/SFTP) through one `StorageProvider` interface.
- Incremental, full-copy, explicit mirror/delete and move/archive modes.
- Recursive scans, include/exclude globs, size limits, file-stability window and conflict policies.
- Streamed temporary-file transfer, size verification, optional SHA-256 verification, and final rename.
- Interval/change reconciliation (minimum 30 seconds), manual message/state trigger, per-job coalescing lock and bounded retry/backoff.
- Atomic, versioned per-job indexes with backup and automatic quarantine of corrupt indexes.
- Server-side validation, role/resource authorization, confined paths, local symlink escape protection, limited folder results and secret redaction.
- Responsive bilingual (English/German) Admin page and operational ioBroker states.

## Installation

Requires Node.js 20 or newer, js-controller 6.0.11 or newer and Admin 7 or newer. Install from the ioBroker repository when published, or in Admin choose **Install from custom URL**, enter this GitHub repository URL and select `main`. The repository contains the runtime Admin assets; ioBroker runs `prepack`/the TypeScript build during source installation.

```sh
npm ci
npm run check
```

## First configuration

Create an instance, open its configuration and define data locations before jobs. IDs are UUIDs and remain stable when a display name changes. The backend rejects deletion of a referenced location. New jobs should use incremental mode, recursion, a 10-second stability window, two retries, no hashing and no deletes.

### Local

Set an absolute base directory and optionally mark it read-only. Browse paths are always relative to that root. File access uses only Node.js filesystem APIs; resolved parents and symlinks are checked to prevent leaving the configured root.

### SMB

Set host, share, port (default 445), domain, user and optional base folder. FileSync uses `@marsaud/smb2` directly; there is no SMB1 option and no OS mount. Test read access and, only when required, a temporary write. Large files use streams.

### SFTP

Set host, port (22), user, base path and either password or private-key authentication. Host fingerprint verification (OpenSSH `SHA256:` format) is required by default. **Allow insecure host key** should only be used briefly in a trusted test environment.

## Credentials

The adapter stores the complete credential vault only in the ioBroker instance object's `credentialVault`, declared as both `encryptedNative` and `protectedNative`. Passwords, keys and passphrases are never states or API response fields. Responses expose only `hasPassword`, `hasPrivateKey` and `hasPassphrase`. An empty submitted field preserves its value; explicit deletion removes the credential. Back up the ioBroker object database through normal controller tooling—do not copy decrypted secrets into support bundles.

## Jobs, triggers and detection

Incremental jobs compare relative path, size and modification time against the last successful snapshot. Full jobs resend all matches. Change jobs use reconciliation polling so restarts and dropped network events cannot permanently lose a change. Manual jobs use the Admin action or `filesync.<instance>.jobs.<uuid>.trigger`.

Example filters: include `**/*.pdf`, `**/*.xml`; exclude `**/*.tmp`, `**/~*`, `**/.DS_Store`. Internal `.filesync-*.tmp` files are always ignored. A file newer than the configured stability interval is deferred. The source is stat'ed again after streaming; a changed source or mismatched target size fails and retries.

### Mirror warning

Mirror deletion runs **only** if mode is `mirror` and `mirrorDeleteConfirmed` is true. Use dry-run first. Dry-run performs no mkdir, writes, renames, moves or deletes and caps UI-oriented result lists in API consumers.

## Users and groups

Groups reference existing `system.user.*` identities—FileSync has no second password database. Permissions cover administration, locations, credentials, jobs, starts/pauses, logs and notifications, with job/location allowlists. Checks occur in the backend; UI visibility is not a security boundary. Instance Admin configuration itself remains protected by ioBroker Admin authentication and ACLs.

## E-mail notifications

Notification records select an existing ioBroker e-mail adapter instance, recipient, job set, failure/recovery choices and cooldown. FileSync does not implement SMTP. Failure payloads must contain only job/location display names and redacted errors. Cooldown tracking sends the first failure, optional later reminder, and one recovery transition.

## States

- `info.connection`, `info.activeJobs`, `info.failedJobs`, `info.queuedTransfers`
- `jobs.<uuid>.enabled`, `.status`, `.running`, `.lastRun`, `.lastSuccess`, `.lastError`
- `.filesScanned`, `.filesCopied`, `.filesSkipped`, `.filesFailed`, `.bytesCopied`, `.duration`, `.currentFile`, `.queueSize`, `.trigger`

No credential is written to a state. Paths are reported only where operationally necessary.

## Storage and backup

Configuration and encrypted credentials live in the instance native object. Runtime states hold counters/status. Version-1 snapshots live beneath the controller-managed instance data directory in `indexes/`; saves use a same-directory temporary file and rename, retain `.bak`, and quarantine malformed JSON as `.corrupt-<timestamp>`. Back up both the ioBroker object database and instance data directory.

## Security and logging

Never paste debug output containing third-party library configuration without review. FileSync centrally redacts secret-shaped keys and known values, does not log normal polls at info, rejects traversal/NUL paths, skips symlinks in scans, limits browse pages to 500, validates ports/UUIDs/intervals and bounds retry and concurrency settings. File names are rendered with text escaping in Admin. No user value reaches a shell.

## Troubleshooting

- **SMB authentication:** verify share (not a UNC path in the share field), domain and SMB2/3 support.
- **SFTP host rejected:** compare the server public-key SHA-256 fingerprint out of band; do not permanently disable verification.
- **File repeatedly deferred:** increase polling frequency or reduce the stability window after confirming the producing application closes files safely.
- **Permission denied:** test the location read-only first and verify the remote base-folder ACL.
- **Offline:** health failures are debug-level; jobs retry and a later trigger reconciles automatically.
- Use adapter debug logging for diagnosis; messages remain redacted.

## Updates and migrations

`configVersion` and snapshot `version` are independent. Startup supplies safe defaults for missing version-1 fields. Corrupt snapshots rebuild without taking down the adapter. Always back up before upgrading, especially before enabling mirror or move.

## Known limitations

- Polling is used for all remote change detection because SMB/SFTP notification delivery cannot be assumed.
- Atomic rename is best-effort and guaranteed only within one target filesystem/share.
- Free-space reporting is available for local locations; protocols may not expose it consistently.
- Docker-based Samba/SFTP integration tests require external services and are not run by the default unit suite.

## License

MIT. See [LICENSE](LICENSE).

### Administrative API authentication boundary

Admin/socket `sendTo` authorizes the connected socket but does not propagate that socket user's ID to the destination adapter. FileSync therefore does **not** accept a user name in an RPC payload and does not pretend that per-user FileSync roles can be enforced for RPC calls. Administrative RPC is accepted only when js-controller reports an Admin adapter instance as the sender; Admin's authenticated socket ACL is the authorization boundary. Fine-grained FileSync groups remain configuration data but are not advertised as an effective security boundary until ioBroker provides a trusted principal to the target adapter. See the ioBroker socket-classes `sendTo` handler and js-controller `ioBroker.Message` definition for the relevant transport behavior.

### SMB implementation decision

`@marsaud/smb2` 0.18 is retained for this development branch because its callback-based stream API can be adapted without buffering whole files and it requires no system mounts. The provider now wraps both stream callbacks in Promises instead of declaring nonexistent synchronous signatures. `smb3-client` was not selected without a successful Samba interoperability run because it is still alpha. This decision must be revisited after the real Samba CI suite is available; SMB is not release-qualified yet.
