# Service Console Remix

A reimagined Salesforce service console built as a React UI bundle that runs inside Salesforce. It has omni-channel style routing, a supervisor command center, AI-assisted case, voice, and messaging workspaces, and admin-customizable page layouts. It's built for the Salesforce SDO.

## Deploy from Cursor or Claude Code

1. Clone the repo and open it in your IDE:

   ```bash
   git clone https://github.com/sfdc-brendan/service-console-remix.git
   ```

2. Ask the agent to deploy it:
   - **Cursor:** run `/deploy-to-sdo` in the chat, or just say "deploy this to my SDO".
   - **Claude Code:** run `/deploy-to-sdo` (optionally with an org alias, like `/deploy-to-sdo my-sdo`), or say "deploy this to my SDO".

The agent checks your tools, has you log in to your SDO in the browser, runs a preflight check on the org, deploys, assigns permissions, and seeds demo data. Then open your org and pick **Service Console Remix** from the App Launcher. Its instructions are in [AGENTS.md](AGENTS.md).

You need the [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli), Node.js 20+ (the agent builds the UI from source), and a System Administrator login to an SDO.

## Deploy from a terminal

```bash
sf org login web -a my-sdo
scripts/install/install.sh -o my-sdo --route-all-cases-to-me
```

To skip Node entirely, download the zip from [Releases](https://github.com/sfdc-brendan/service-console-remix/releases), which includes the built UI, and run the same script from the unzipped folder. [INSTALL.md](INSTALL.md) covers org prerequisites, the installer's options, adding users, resetting the demo, and troubleshooting.

## What gets installed

- The **Service Console Remix** Lightning app (the React UI bundle `serviceConsole`)
- Apex services behind the `/services/apexrest/slkconsole` endpoint, plus a Case trigger
- Six custom objects: agent presence, work items, conversation messages, console layouts, knowledge gaps, and article reviews
- Permission sets **SLK Service Console** (agents) and **SLK Service Console Admin** (layout editing)

## Developing

See [AGENT.md](AGENT.md) for the UI bundle development guide. The app lives in `force-app/main/default/uiBundles/serviceConsole`:

```bash
cd force-app/main/default/uiBundles/serviceConsole
npm ci
npm run dev          # local dev server
npx vitest run       # unit tests
npm run build        # production build into dist/
```

To publish a release zip: `scripts/install/package-release.sh 1.0.0`, then `gh release create v1.0.0 releases/*.zip`.
