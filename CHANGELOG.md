# Changelog

## 1.3.1 — 2026-10-03

- Remove the repeated Traffic Management heading and introductory copy.
- Feature wider traffic graphs in compact summary cards.
- Rename the transport panel to Live Data Transport and place filters and search beside their labels in a compact toolbar.
- Reduce application and service row padding so seven application rows fit at 1440×900, up from two.

## 1.3.0 — 2026-10-03

- Keep the completed Easy Button and its seven checks in Preferences, with a red exclamation beside Preferences when collection needs repair.
- Default traffic speeds to decimal Mbit/s; click any speed to cycle bit/byte units and save the choice across launches.
- Replace the sidebar tagline with “kneurons made this for you” and a copyright year fixed to the release metadata.
- Update native setup acceptance checks for the Preferences flow and verify speed switching and persistence.

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
