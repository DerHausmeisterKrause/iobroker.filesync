# Changelog

## 0.2.9 (2026-11-25)

- Replace the legacy NTLMv1 dependency with native smb3-client 0.2.0 (SMB 2.1–3.1.1, NTLMv2, mandatory signing).
- Preserve SMB worker isolation, timeouts, existing location credentials and streaming operations.
- Add Samba integration CI and explicit path/reparse-point checks.

## 0.2.8 (2026-11-25)

- Isolate the legacy SMB client in a worker with bounded operation timeouts and crash-to-error conversion.
- Fail closed when legacy NTLM crypto is not available; no global OpenSSL legacy mode.
- Keep management sessions and CRUD available after storage failures, show redacted backend errors and clear stale dialogs on re-login.
- Avoid overlapping health checks and clean up connections after failed setup.

## 0.2.7 (2026-11-24)

- Put quick installation and update instructions at the top of the README.
- Use the approved FileSync icon in ioBroker Admin, README, web login, navigation, job/run lists and browser favicon.
- Serve PNG assets with the correct content type and return 404 for missing PNG files.

## 0.2.6 (2026-11-24)

- Add personal test mail, persistent history for the last 100 attempts per user and restart-safe hourly/test-mail limits.
- Add warning subscriptions for truncated file action details and daily or weekly summaries of authorized productive runs.
- Summaries use server-local calendar periods, starting at 08:00, and the last 500 retained runs; persist a period marker before attempting delivery to avoid duplicates.


## 0.2.5 (2026-11-24)

- Add central email adapter selection and enable switch in ioBroker Admin.
- Add personal email addresses, event and job subscriptions, and cooldowns in the FileSync web UI.
- Persist private preferences separately from static adapter configuration; enforce group visibility on delivery and exclude Dry Runs.
- Limit mail attempts per user; never include raw paths, contents, or credentials.

## 0.2.4 (2026-11-24)

- Add opt-in list/write/read/rename/delete access checks for the local, SMB and SFTP location base directory.
- Keep background health checks unchanged and skip writes for read-only locations.
- Show actionable access error hints, probe cleanup warnings and recorded progress for failed runs.

## 0.2.3 (2026-11-24)

- Remove pre-transfer stability waiting for every trigger, including existing jobs with legacy stability settings.
- Remove stability time from the job editor; retain historical run details and backward-compatible config fields.
- Keep source metadata checks, temporary files and Move SHA-256 verification.

## 0.2.2 (2026-11-24)

- Fix TS18048 in the streaming progress callback by deriving a numeric byte count before updating optional progress fields.
- Regenerate the committed runtime and source map.

## 0.2.1 (2026-11-24)

- Show separate frontend and backend version labels and warn about mismatches.
- Guard release version consistency and packaged run status colors.
- Mark interrupted queued/running history records cancelled on startup, without automatic replay.
- Offer explicit preview/restart for failed and cancelled runs using current job settings.

## 0.2.0 (2026-11-24)

- Report live per-run source file counts, stream bytes, current file and average current-file rate.
- Display current-file progress and estimated remaining file time; distinguish scan and mirror phases.
- Keep preview byte estimates separate from actual transfer bytes.
- Add progress regression and browser smoke tests.

## 0.1.2 (2026-11-24)

- Color-code run history by status and filter by status, job, dry run and search.
- Refresh run history automatically and expand run details with timing, error messages and action filtering.
- Show an indeterminate running indicator until real progress telemetry is available.
- Fix help dialog initialization.

## 0.1.1 (2026-11-24)

- Require SHA-256 verification for Move, including the committed destination before deleting the source.
- Recheck source existence and target file type before Mirror deletions.
- Reject overlapping paths in the same location at runtime.
- Add destructive-operation regression tests.

## 0.1.0 (2026-09-10)

- Initial development release with local, direct SMB2/3 and SFTP providers.
- Atomic streaming synchronization, snapshots, retries, filters, mirror dry-runs, states and Admin UI.
- Encrypted credential vault, path confinement, role checks, monitoring and bilingual UI.
