# Asana setup SOP

How to wire up Asana as the data source for the weekly ops report. Estimated time: 15 minutes.

## Prerequisites

- A Claude.ai account on Pro, Max, Team, or Enterprise
- An Asana workspace where you have at least Member access
- Slack workspace with the Claude Slack connector

## Step 1 - Connect the Asana connector (V2 - important)

Asana's V1 MCP server is deprecated and shuts down 2026-05-11. Make sure you connect to V2.

**Via the connector directory (easiest):**
1. claude.ai > Settings > Connectors > Browse
2. Search for **Asana**
3. Click **Connect**. Confirm the URL shown is `https://mcp.asana.com/mcp` (V2). If it shows `/sse`, that's V1 - contact Anthropic support or wait for the directory to update.
4. Authenticate with your Asana account
5. Pick the workspace to authorize

**If you connected V1 previously**, disconnect it and reconnect with V2 before May 2026 or your Routine will fail.

> **Permission scope**: V2 OAuth grants read access to all projects, tasks, and users in the authorized workspace. The weekly report only uses reads.

> **Enterprise+ note**: if your org is on Asana Enterprise+ or Legacy Enterprise, the workspace admin may need to allow the Asana MCP app in **App management** before you can connect it.

## Step 2 - Find your scope

**For all your work in a workspace** (recommended for individuals or small teams):
- Use `WORKSPACE_SCOPE: all`
- The adapter will discover projects automatically

**For specific projects** (recommended if you want to scope to a client engagement):

1. Open Asana in a browser
2. Click into the project
3. The URL is `https://app.asana.com/0/{project_gid}/list`
4. The number after `/0/` and before `/list` is the project GID. Copy it.
5. Repeat for each project you want included
6. Use `WORKSPACE_SCOPE: 1234567890,1234567891` in your Routine prompt

## Step 3 - Decide on status semantics

Asana has TWO common patterns for representing status, and your team uses one of them. Identify which:

**Pattern A: Sections as Kanban columns** (most common)
Tasks live in named sections like "To Do", "In Progress", "In Review", "Blocked", "Done". The adapter detects this automatically.

**Pattern B: Custom field for status**
A workspace-wide custom field called "Status", "Stage", or similar with values like Active, Blocked, Done. Less common but cleaner.

If you use Pattern B, edit `adapters/asana.md` step 2 to prefer the custom field. The default adapter assumes Pattern A.

## Step 4 - Connect Slack (if not already)

Same as ClickUp setup - claude.ai > Settings > Connectors > Slack > Connect.

## Step 5 - Find your Slack destination ID

Same process as ClickUp setup:
- Self-DM: `D0XXXXXXX` from your own DM URL
- Channel: `C0XXXXXXX` from a channel link

## Step 6 - Push the skill to GitHub

```bash
cp -r weekly-ops-report ~/your-repo/skills/
cd ~/your-repo
git add skills/weekly-ops-report
git commit -m "Add weekly-ops-report skill"
git push origin main
```

## Step 7 - Create the Routine

1. claude.ai/code/scheduled > **New scheduled task**
2. Fill in:
   - **Name**: `Weekly Ops Report - Asana`
   - **Prompt**: from `ROUTINE_PROMPT_TEMPLATE.txt`, with PLATFORM=asana, your scope, and your Slack channel ID
   - **Repositories**: your skill repo
   - **Environment**: Default
   - **Schedule**: Weekly, Monday, 7:00 AM, your timezone
   - **Connectors**: **Asana** + **Slack** only
3. Click **Create**

## Step 8 - Test before Monday

Click **Run now**. Watch the session output. Confirm:
- Asana queries return results
- Tasks bucket sensibly (open the JSON pull from the session if needed)
- Slack message arrives

## Common issues

**"Permission denied" or "workspace not found"**
The authenticated user doesn't have access to the workspace, or the workspace was authorized for a different account. Disconnect and reconnect, choosing the right workspace.

**Tasks not bucketing into "blocked"**
Asana doesn't have a default "Blocked" section name. The adapter looks for sections matching `/block|hold|stuck|wait/i`. If your team uses something else (e.g., "On Ice"), edit `adapters/asana.md` to add the term, or add a "Blocked" section to your projects.

**"Completed" bucket includes things from weeks ago**
The adapter filters by `completed_on` between week_start and week_end. If you see older completions, check that those tasks' actual `completed_at` timestamp is in the right range (sometimes Asana tasks are bulk-marked complete, which sets the timestamp to the bulk action moment).

**Multi-project tasks appearing in the wrong container**
Asana lets a task live in multiple projects. The adapter picks the first project. If the wrong one is showing, the user can edit `adapters/asana.md` step 3 to prefer specific projects, or restructure their Asana to keep tasks in one canonical project.

**Subtasks not appearing**
By default, the adapter pulls top-level tasks. To include subtasks, the adapter would need to recurse via `get_subtasks_for_task` - this is left out by default to keep the report concise. If subtasks matter, modify the adapter.

## Maintenance

- **V2 migration deadline**: Asana shuts down V1 MCP on 2026-05-11. If you set up before this date, double-check you're on V2.
- **Workspace changes**: if you add new projects you want included, update `WORKSPACE_SCOPE` in the Routine prompt at claude.ai/code/scheduled (no code change needed).
- **OAuth refresh**: same as ClickUp - 30-90 day token life, reconnect when auth fails.
