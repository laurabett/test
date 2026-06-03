# ClickUp setup SOP

How to wire up ClickUp as the data source for the weekly ops report. Estimated time: 10 minutes.

## Prerequisites

- A Claude.ai account on Pro, Max, Team, or Enterprise (Routines require a paid plan)
- A ClickUp workspace where you have at least Member-level access
- Slack workspace where you can install or already have the Claude Slack connector

## Step 1 - Connect the ClickUp connector

1. Go to **claude.ai > Settings > Connectors**
2. Click **Browse connectors** (or **Connectors directory**)
3. Search for **ClickUp**
4. Click **Connect**
5. You'll be redirected to ClickUp's OAuth page. Sign in if needed.
6. Choose the workspace to authorize, then click **Connect Workspace**
7. Back in Claude.ai, the ClickUp connector should now show as **Connected**

> **Permission scope**: the ClickUp OAuth grants Claude read access to all spaces, lists, and tasks the connecting user can see, plus comment/update permissions. The weekly report only uses read operations - no writes.

## Step 2 - Find your scope

Decide whether to scope the report to all spaces or specific ones.

**To pull from all spaces** (recommended for individuals or small teams):
- Use `WORKSPACE_SCOPE: all` in your Routine prompt
- Skip to Step 3

**To pull from specific spaces** (recommended if you have shared client spaces, archived spaces, or want to focus the report):

1. Open ClickUp in a browser
2. Right-click a space in the sidebar > **Copy link**
3. The URL looks like: `https://app.clickup.com/{team_id}/v/o/s/{space_id}`
4. The string after `/s/` is the space ID. Copy it.
5. Repeat for each space you want included.
6. Use `WORKSPACE_SCOPE: 901234,901235,901236` in your Routine prompt (comma-separated, no spaces)

## Step 3 - Verify status conventions

The adapter uses pattern matching to bucket tasks. Confirm your workspace's status names play nice:

- **Closed states**: ClickUp's `status.type == "closed"` catches Done, Complete, Shipped, Closed, etc. automatically. No action needed.
- **Blocked states**: the adapter matches `/block|hold|stuck/i`. If your team uses something different (e.g., "Frozen", "Pending Client"), edit `adapters/clickup.md` step 2c to add your terms.
- **In-progress states**: anything open and not blocked. No special config needed.

## Step 4 - Connect the Slack connector

If Slack isn't already connected:

1. claude.ai > Settings > Connectors > **Slack** > **Connect**
2. Authorize the workspace where you want the report delivered
3. Choose whether to grant access to public channels, private channels, or DMs (DMs only is fine if you only want self-DMs)

## Step 5 - Find your Slack destination ID

For a self-DM (the cleanest pattern):

1. Open Slack > click your own name in the sidebar
2. The URL contains your DM channel ID: `https://app.slack.com/client/T0XXXXXXX/D0YYYYYYY`
3. The `D0YYYYYYY` part is the channel ID. Copy it.

For a public/private channel:

1. Right-click the channel name in Slack > **Copy link**
2. The link includes the channel ID after `/archives/`: `.../archives/C0ZZZZZZZ`
3. The `C0ZZZZZZZ` part is the channel ID

## Step 6 - Push the skill to GitHub

The skill needs to live in a GitHub repo so the Routine can clone it.

1. Create a new repo, or use an existing one (private is fine)
2. Add the `weekly-ops-report/` folder to a `skills/` directory at the repo root
3. Commit and push to the default branch

```bash
mkdir -p ~/your-repo/skills
cp -r weekly-ops-report ~/your-repo/skills/
cd ~/your-repo
git add skills/weekly-ops-report
git commit -m "Add weekly-ops-report skill"
git push origin main
```

## Step 7 - Create the Routine

1. Go to **claude.ai/code/scheduled**
2. Click **New scheduled task**
3. Fill in:
   - **Name**: `Weekly Ops Report - ClickUp`
   - **Prompt**: open `ROUTINE_PROMPT_TEMPLATE.txt` from the skill folder, fill in the placeholders for ClickUp, your scope, and your Slack channel ID, then paste the full text into this field
   - **Repositories**: add the GitHub repo where you pushed the skill
   - **Environment**: Default is fine
   - **Schedule**: Weekly, Monday, 7:00 AM (or whatever cadence works for you), in your local timezone
   - **Connectors**: enable **ClickUp** and **Slack**, disable everything else for this task
4. Click **Create**

## Step 8 - Test before Monday

On the task's detail page, click **Run now**. This fires the Routine immediately with the same config it'll use weekly.

Watch the session in `claude.ai/code/scheduled > Weekly Ops Report - ClickUp > [latest run]`. You should see Claude:

1. Read the SKILL.md and the ClickUp adapter
2. Make ClickUp MCP calls
3. Synthesize the report
4. Run the verification checks
5. Send the Slack message

Then check Slack. The DM should arrive within 1-2 minutes of the **Run now** click.

## Common issues

**"ClickUp connector not authorized"**
The connector needs a re-auth. Settings > Connectors > ClickUp > Disconnect and reconnect.

**"No tasks found in completed bucket"**
If you genuinely had a slow week, this is correct. If you had completed tasks but they don't show up, check that those tasks' status type is actually `closed` in ClickUp (sometimes statuses are configured as "Active" colored grey - they look done but aren't classified as closed).

**Slack DM never arrives**
Check that the Slack channel ID in the Routine prompt matches the format (D-prefix for DMs, C-prefix for channels). Open the session output and look for the `slack_send_message` call - the error message there is usually clear.

**Report violates a configured STYLE rule**
Phase 3 should have caught these. Open the session and look at the verification step output. If the verifier missed them, file an issue and tighten the rules in `report-template.md`.

## Maintenance

- **OAuth tokens** for the ClickUp and Slack connectors typically last 30-90 days. If a Monday run fails with auth errors, reconnect both connectors in Settings.
- **Status name drift**: if your team adds new statuses over time (e.g., "Awaiting QA"), the adapter regex may not catch them. Edit `adapters/clickup.md` and push - the next run picks it up.
- **Pause for vacation**: toggle **Repeats** off on the task detail page. Toggle it back on when you return.
