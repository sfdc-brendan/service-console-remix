# Install the Service Console Remix in your SDO

The Service Console Remix is a React service console (omni-channel routing, supervisor command center, and AI-assisted case, voice, and messaging workspaces) that runs inside Salesforce as a UI bundle, backed by Apex and six custom objects. It is built for the Salesforce SDO.

Installing takes about 10 minutes, most of it the Apex test run.

## What you need

- **The Salesforce CLI** (`sf`). Install it from [developer.salesforce.com/tools/salesforcecli](https://developer.salesforce.com/tools/salesforcecli). Run `sf --version` to check.
- **An SDO on the Summer '26 release or later**, and a System Administrator login for it.
- **macOS or Linux**, or Git Bash on Windows.
- **Node.js 20+**, only if you install from a git clone instead of a release zip, since the zip ships with the UI already built.

## Install

1. Unzip the release and open a terminal in the unzipped folder.
2. Log in to your SDO, giving it any alias you like:

   ```bash
   sf org login web -a my-sdo
   ```

3. Optionally, check the org without changing anything. This runs the preflight, then a full validation deploy with the Apex tests, and saves nothing:

   ```bash
   scripts/install/install.sh -o my-sdo --validate-only
   ```

4. Install:

   ```bash
   scripts/install/install.sh -o my-sdo --route-all-cases-to-me
   ```

   `--route-all-cases-to-me` sends every new case to you while you're Online in the console, regardless of skills. Leave it off to let skills-based routing spread work across the virtual agents.

5. Open the app with `sf org open -o my-sdo -p lightning/app/c__serviceConsole`, or from **App Launcher > Service Console Remix**.

### What the installer does

1. **Preflight:** a read-only check that the org has every feature the app needs. It stops before deploying anything if something is missing (see below).
2. **Deploy:** deploys all metadata in a single transaction, running only the app's own Apex tests. If any step fails, Salesforce rolls the whole deployment back, so the org is never left half-installed.
3. **Permissions:** assigns the **SLK Service Console** and **SLK Service Console Admin** permission sets to you. The admin set lets you customize page layouts.
4. **Demo data:** seeds up to 6 virtual agents (taken from the org's existing active users), today's handled work for the dashboards, and 8 inbound Voice, Messaging, and Case items. Skip this with `--no-seed`.

You can run the installer again at any time. It redeploys the same metadata and skips permission sets you already have.

## Org prerequisites

A standard SDO already has all of these. The preflight reports anything missing as `FAIL`:

| Requirement | Why | Where to turn it on |
|---|---|---|
| Lightning Knowledge with the SDO FAQ and KCS fields | The Knowledge Command Center reads and drafts articles | Setup > Knowledge Settings |
| Service Cloud Voice (`VoiceCall`) | Voice work items | Setup > Contact Center |
| Messaging for In-App and Web (`MessagingSession`) | Messaging work items | Setup > Messaging Settings |
| Omni-Channel (`AgentWork`) | Routing history | Setup > Omni-Channel Settings |
| Einstein generative AI | Summaries, drafting, routing triage via the Models API | Setup > Einstein Setup |
| **Knowledge User** checked on your user | The Apex tests create Knowledge articles | Setup > Users > your user |

`WARN` items don't block the install. For example, without the SDO voice sentiment fields the app skips writing sentiment back to the call record.

## Giving access to other users

Assign **SLK Service Console** to anyone who should use the console. Assign **SLK Service Console Admin** as well to anyone who should customize page layouts.

```bash
sf org assign permset -o my-sdo -n SLK_Service_Console -b other.user@example.com
```

## Reset the demo

Rerun the seed to get a fresh set of inbound work. To clear open work first, change `run(false)` to `run(true)` in `scripts/install/seed-demo-data.apex`.

```bash
sf apex run -o my-sdo -f scripts/install/seed-demo-data.apex
```

## Troubleshooting

- **"Not logged in"**: run `sf org login web -a my-sdo` again. SDO sessions expire.
- **A test failure during deploy**: usually the org's own Case automation (a validation rule, flow, or trigger) rejecting the test data. The error names the rule. Deactivate it, or ask the person who gave you the kit.
- **The app opens to a blank page**: make sure you have the **SLK Service Console** permission set, then hard-refresh the browser.
- **No work shows up**: in the console, set yourself Online in the Omni dock. Routing only offers work to agents who are Online.

## For maintainers: building a release

```bash
scripts/install/package-release.sh            # version defaults to <date>-<git sha>
scripts/install/package-release.sh 1.2.0      # or name it
```

This builds the UI and writes `releases/service-console-remix-<version>.zip`, containing the metadata with the built UI, the install scripts, and this guide.
