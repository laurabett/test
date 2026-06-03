# Monday.com setup SOP

How to wire up Monday.com as the data source for the weekly ops report. Estimated time: 20 minutes (longer because Monday's data model needs more decisions upfront).

## Prerequisites

- A Claude.ai account on Pro, Max, Team, or Enterprise
- A Monday.com account with at least Member access to the boards you want included
- Slack workspace with the Claude Slack connector

## Step 1 - Connect the Monday.com connector

1. claude.ai > Settings > Connectors > Browse
2. Search for **Monday.com** (or **monday.com** - lowercase)
3. Click **Connect**
4. Sign in with your Monday account and authorize
5. Pick the account/workspace if prompted

## Step 2 - Pick your boards

Monday is board-scoped. There's no native "all my work" view, so you must specify which boards.

**Recommendation: 1 to 5 boards.** More than that and the report blows past the one-page cap. If you have many boards, pick the most active ones, or set up multiple Routines (one per board family).

To find a board ID:
1. Open the board in Monday
2. The URL is `https://{your-account}.monday.com/boards/{board_id}`
3. The number after `/boards/` is the board ID. Copy it.
4. Repeat for each board

You'll use these in `WORKSPACE_SCOPE: 1234567,1234568,1234569` in the Routine prompt.

## Step 3 - Audit your board columns

This step is critical for Monday because boards are user-defined. The adapter needs each board to have:

- A **status** column (type `status` - the colored label kind)
- A **person** column (type `person`)
- A **date** column (type `date` or `timeline`)

Open each board in scope. Check the columns.

**If a board is missing one of these:**
- Add the column to the board, OR
- Remove the board from scope

The adapter logs a warning and skips boards missing required columns. The skip is intentional - we'd rather miss a board than silently produce wrong data.

## Step 4 - Confirm status label conventions

Monday's default "Status" column has these labels: Working on it, Stuck, Done. The adapter regex catches:
- `/working|in progress|active|doing/i` -> in_progress
- `/done|complete|shipped|closed/i` -> completed
- `/stuck|block|hold|wait/i` -> blocked

If your team customized status labels (e.g., "Frozen" instead of "Stuck"), edit `adapters/monday.md` to add your terms.

If you have multiple status columns on a board, the adapter uses the first one named "Status" or, failing that, the first status-typed column. To force a specific one, you can extend the adapter to look up by column ID.

## Step 5 - Connect Slack

Same as other setups - claude.ai > Settings > Connectors > Slack.

## Step 6 - Find your Slack destination ID

Same process - DM channel ID (D-prefix) or channel ID (C-prefix).

## Step 7 - Push the skill to GitHub

```bash
cp -r weekly-ops-report ~/your-repo/skills/
cd ~/your-repo
git add skills/weekly-ops-report
git commit -m "Add weekly-ops-report skill"
git push origin main
```

## Step 8 - Create the Routine

1. claude.ai/code/scheduled > **New scheduled task**
2. Fill in:
   - **Name**: `Weekly Ops Report - Monday`
   - **Prompt**: from `ROUTINE_PROMPT_TEMPLATE.txt`, with PLATFORM=monday, your board IDs as scope, and your Slack channel ID
   - **Repositories**: your skill repo
   - **Environment**: Default
   - **Schedule**: Weekly, Monday, 7:00 AM, your timezone
   - **Connectors**: **Monday.com** + **Slack** only
3. Click **Create**

## Step 9 - Test before Monday

Click **Run now**. The Monday pull is slower than ClickUp/Asana - expect 30-60 seconds for a 3-5 board scope.

Confirm:
- Each board returns items
- Status bucketing matches what you see visually in Monday
- Slack message arrives

## Common issues

**"Board not found" or "permission denied"**
The authenticated user doesn't have access to the board. Either grant access in Monday or remove the board from scope.

**Items in "Stuck" status not appearing in blocked bucket**
Monday's "Stuck" status maps to the `/stuck/i` regex - if the report is missing them, check the actual column type. If it's a `text` or `dropdown` column instead of `status`, the adapter won't pick it up. Use a real status column.

**"Completed" bucket too noisy or too sparse**
Monday doesn't store a clean "completed_at" timestamp - the adapter uses `updated_at` as a proxy. If a Done item was edited last week for an unrelated reason, it appears in completed. Accept this as a known limitation. If it's bad enough, you can extend the adapter to query Monday's activity log via GraphQL for status change events specifically.

**Rate limit errors from Monday API**
Monday's API has tighter limits than the others. If you have 5+ boards or many items per board, the pull may hit rate limits. Reduce board count or increase the delay between calls in the adapter.

**Subitems showing up unexpectedly**
Monday subitems live on a separate, auto-generated board. Depending on the MCP version, subitems may be pulled with their parents or as separate items. Test and adjust - if subitems are noise, exclude them by filtering items where the board name starts with "Subitems of".

**Multi-person assignments**
The adapter uses the first assignee's first name. Monday person columns can have multiple people - if your team relies on shared ownership, this loses information. Extend the adapter to list all assignees if needed.

## Maintenance

- **Adding new boards**: just update `WORKSPACE_SCOPE` in the Routine prompt at claude.ai/code/scheduled. No code change needed.
- **Changing status labels in Monday**: update the regex in `adapters/monday.md` and push.
- **Workspace migrations**: if you move boards to a new Monday account, you need to reconnect the connector with the new account credentials.
