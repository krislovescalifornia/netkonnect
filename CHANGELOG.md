# Changelog

## 1.2.0 — 2026-10-03

- Move the Easy Button into the left navigation after the first successful setup, keeping its progress and seven readiness checks available to expand.
- Verify collection readiness on later launches and periodic checks; show a red repair button when a check fails, including while display updates are paused.
- Move global search, live network status, Pause/Resume and Restart Service into the left navigation.
- Remove the Observatory sidebar text and postcard, Workspace breadcrumbs and live/sample network toggle.
- Display the full release version and update the footer to “MADE FOR THE KURIOUS.”
- Generate the dashboard version from package metadata and check that the package, lockfile and dashboard versions agree.

## 1.1.3

- Verify the companion's enabled sign-in startup entry through Electron's native launch-item API.
- Validate the executable, positional collector argument and Windows startup approval state.
- Verify setup completion through the installed app's actual bridge and seven readiness checks.
