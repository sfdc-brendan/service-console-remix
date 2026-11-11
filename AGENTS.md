# AGENTS.md

This repo is the **Service Console Remix**: a React service console that runs inside Salesforce as a UI bundle, backed by Apex and six custom objects, built for the Salesforce SDO.

- If the user wants to **deploy or install** the app (for example "deploy this to my SDO", "install it", or `/deploy-to-sdo`), follow the playbook below.
- If the user wants to **change** the app, read [AGENT.md](AGENT.md) for the UI bundle development guide.

## Deploy to an SDO

Everything runs through `scripts/install/install.sh`, which is non-interactive and safe to rerun. Your job is to get the prerequisites in place, confirm the target org with the user, run it, and explain the result. Don't edit the app's source to get past a failure; report it and ask.

### 1. Check the tools

```bash
sf --version
node --version
```

- **`sf` missing:** if `npm` exists, run `npm install -g @salesforce/cli`. Otherwise send the user to https://developer.salesforce.com/tools/salesforcecli and stop.
- **Node missing or older than 20:** a git clone has no prebuilt UI, so the installer has to build it. Ask the user to install Node 20+ from https://nodejs.org, or to use the release zip from the repo's GitHub Releases page, which includes the built UI.
- **Windows without bash:** see "Windows" at the end of this file.

### 2. Pick the org

Never guess the target org. Run `sf org list` and ask the user which alias to deploy to, or offer to log in to a new one:

```bash
sf org login web -a <alias>
```

This opens a browser where the user signs in to their SDO as a System Administrator. Wait for them to finish. Then confirm the username with `sf org display -o <alias>` and tell the user which org you're about to change.

### 3. Ask one question

Ask whether every new case should route to them while they're Online (adds `--route-all-cases-to-me`). Say yes for a solo demo; say no to let skills-based routing spread work across the virtual agents.

### 4. Install

```bash
scripts/install/install.sh -o <alias> [--route-all-cases-to-me]
```

This takes about 3 to 8 minutes: an npm install and UI build (clone only), then the deploy and the Apex tests. Use a 10-minute command timeout, or run it in the background and poll. The script runs four steps:

1. **Preflight:** read-only checks that print `PASS`, `WARN`, or `FAIL` lines. On any `FAIL`, the script stops before changing the org.
2. **Deploy:** one transaction with the app's own Apex tests. On any failure, Salesforce rolls everything back.
3. **Permission sets:** assigns `SLK_Service_Console` and `SLK_Service_Console_Admin` to the logged-in user.
4. **Seed:** virtual agents, today's history, and 8 inbound work items.

Other flags: `--validate-only` does a full check-only deploy and saves nothing (use it when the user wants to test an org first); `--no-seed` skips demo data; `--skip-preflight` is for orgs where you've already confirmed the prerequisites.

### 5. Handle failures

| What you see | What to tell the user |
|---|---|
| `FAIL Knowledge__kav` | Lightning Knowledge or the SDO FAQ/KCS article fields are missing. This app needs an SDO; Setup > Knowledge Settings. |
| `FAIL VoiceCall`, `MessagingSession`, or `AgentWork` | Service Cloud Voice, Messaging, or Omni-Channel is off. Turn it on in Setup, then rerun. |
| `FAIL Einstein Models API` | Turn on Einstein generative AI in Setup > Einstein Setup. |
| `FAIL Knowledge user` | Check **Knowledge User** on their user record (Setup > Users), then rerun. You can't do this from the CLI. |
| `Not logged in` | Run `sf org login web -a <alias>` again. SDO sessions expire. |
| An Apex test failure during deploy | Usually the org's own Case automation (a validation rule, flow, or trigger) rejecting test data. Quote the error and the rule it names, and ask how they want to proceed. |

### 6. Finish

Open the app and tell the user what was installed and what to do first:

```bash
sf org open -o <alias> -p lightning/app/c__serviceConsole
```

In the console, they set themselves **Online** in the Omni dock so routing offers them work. Other users need the `SLK_Service_Console` permission set (`sf org assign permset -o <alias> -n SLK_Service_Console -b <username>`), plus `SLK_Service_Console_Admin` to customize page layouts.

### Windows

If bash isn't available (no Git Bash or WSL), run the same steps directly:

```bash
sf apex run -o <alias> -f scripts/install/preflight.apex
cd force-app/main/default/uiBundles/serviceConsole && npm ci && npm run build && cd ../../../../..
sf project deploy start -o <alias> -d force-app --test-level RunSpecifiedTests --tests SLK_CommandCenterTest SLK_ConsoleTest SLK_InsightsTest SLK_RoutingTest --wait 60
sf org assign permset -o <alias> -n SLK_Service_Console -n SLK_Service_Console_Admin
sf apex run -o <alias> -f scripts/install/seed-demo-data.apex
sf apex run -o <alias> -f scripts/install/route-all-cases-to-me.apex
```

Read the preflight results from the `SLK_PREFLIGHT::` lines in the debug output and stop on any `FAIL`. Skip the build when `force-app/main/default/uiBundles/serviceConsole/dist/index.html` already exists, and skip the last command if the user doesn't want every case routed to them.
