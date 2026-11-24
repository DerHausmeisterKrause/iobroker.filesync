# Manual release acceptance

Use disposable test directories and non-production SMB/SFTP shares. Never test Mirror or Move against the only copy of important files.

1. Install from GitHub main using ioBroker Admin (custom URL) or `iobroker url https://github.com/DerHausmeisterKrause/iobroker.filesync --debug` for an existing installation. Back up the instance and its data directory first.
2. Restart the existing instance and verify the web server state and login. Existing locations, jobs and credentials must survive.
3. Create two local test directories writable by the ioBroker service account. Create a source file and configure an incremental job with SHA-256 verification.
4. Preview: the destination must remain empty. Disable the job's persistent dry-run flag before starting a real run.
5. Run: compare source and target contents. A second run should skip unchanged files. Modify a source file and verify the target changes. Remove a target file and verify repair.
6. Repeat with separate test shares for SMB and SFTP. Verify invalid credentials fail without exposing secrets and an incorrect SFTP host fingerprint fails closed.
7. Verify a normal user cannot view or start another group's jobs; verify logout and restart invalidate the session.
8. On disposable directories only, test Mirror preview, then explicit deletion confirmation; verify unrelated files are protected by filters. Test Move with a deliberately unavailable destination: the source must remain intact.

Record the installed commit, Node.js version, controller version, job mode and sanitized logs for any failure.

## Follow-up engineering priorities

- Investigate CI failures before publishing a stable release.
- Test overlap/alias detection for source and target, including different locations pointing at the same directory.
- Verify Move against source modifications between transfer verification and deletion; verify Mirror against concurrent source changes.
- Add real SMB/SFTP integration coverage, including interrupted transfers and replacement failures.
- Evaluate cancellation, progress reporting and safe restart/resume semantics before adding new providers.
