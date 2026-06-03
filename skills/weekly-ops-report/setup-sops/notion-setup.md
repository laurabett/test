# Notion setup SOP

How to wire up Notion as the data source for the weekly ops report. Estimated time: 20-30 minutes (Notion needs the most upfront decisions).

## Prerequisites

- A Claude.ai account on Pro, Max, Team, or Enterprise
- A Notion workspace where you have access to a tasks database
- Slack workspace with the Claude Slack connector

> **Important**: Notion is the most loosely structured of the four platforms. There's no native "tasks" concept - your team built a database with custom properties to track work. This skill needs that database to have a few specific properties (status, assignee, due date) under any names.

## Step 1 - Identify your tasks database

Notion users typically have one of these setups:

**Single tasks database** - one Notion database where all tasks live, regardless of project. Easiest case.

**Multiple project databases** - each project has its own database of tasks. You'll need to either pick the most important one, or set up multiple Routines (one per database).

**Pages-as-tasks** - tasks aren't in a database, they're free-floating pages. This skill won't work as-is. Convert to a database first.

## Step 2 - Confirm your database has the required properties

Open the database. Check that it has properties (under any names) that map to:

- **Status** - a `status`, `select`, or `multi_select` property
- **Assignee** - a `people` property
- **Due date** - a `date` property

If any are missing, add them.

The adapter tries common names by default: `Status`, `Assignee`, `Owner`, `Due`, `Due Date`, `Deadline`. If your properties have other names, you'll provide a mapping in the Routine prompt.

## Step 3 - Get your database ID

1. Open the database in Notion (web)
2. Click **...** in the top right > **Copy link**
3. The URL looks like: `https://www.notion.so/{workspace}/{database_id}?v={view_id}`
4. The 32-character hex string before the `?` is the database ID. Copy it.
5. Format it with dashes (Notion accepts both formats, but the canonical one is `8-4-4-4-12`): `12345678-1234-1234-1234-123456789012`

## Step 4 - Connect the Notion connector

1. claude.ai > Settings > Connectors > Browse
2. Search for **Notion**
3. Click **Connect**
4. Sign in to Notion when redirected
5. **CRITICAL STEP**: Notion will ask which pages and databases to grant access to. You must explicitly select the database from Step 3 (or a parent page that contains it). Otherwise the API will return "object not found" even though the database exists.
6. Click **Allow access**

To verify access:
- In Notion, open your database
- Click **...** > **Connections** (or **Add connections**)
- Confirm "Claude" appears in the list

If it doesn't, go back to claude.ai > Settings > Connectors > Notion > **Manage access** and add the database.

## Step 5 - Identify status semantics

Open the database. Click on the status property to see its options.

**If it's a `status` property** (Notion's newer type, 2023+), it has three groups:
- **To-do** -> upcoming bucket
- **In progress** -> in_progress bucket (or blocked, if option name matches)
- **Complete** -> completed bucket

The adapter uses these groups automatically. No config needed.

**If it's a `select` or `multi_select` property**, the adapter falls back to regex on option names:
- `/done|complete|shipped|closed/i` -> completed
- `/block|hold|stuck|wait/i` -> blocked
- everything else open -> in_progress

If your status options don't match these patterns (e.g., you use "Live" for completed, "Pending" for blocked), edit `adapters/notion.md` step 2 to add your terms.

## Step 6 - Connect Slack

Same as other setups.

## Step 7 - Find your Slack destination ID

Same process - DM channel ID (D-prefix) or channel ID (C-prefix).

## Step 8 - Push the skill to GitHub

```bash
cp -r weekly-ops-report ~/your-repo/skills/
cd ~/your-repo
git add skills/weekly-ops-report
git commit -m "Add weekly-ops-report skill"
git push origin main
```

## Step 9 - Create the Routine

1. claude.ai/code/scheduled > **New scheduled task**
2. Fill in:
   - **Name**: `Weekly Ops Report - Notion`
   - **Prompt**: from `ROUTINE_PROMPT_TEMPLATE.txt`, with PLATFORM=notion, your database ID as the scope
   - If your property names don't match the defaults, add this line to the prompt:
     ```
     NOTION_PROPERTY_MAP: status=Stage, assignee=Owner, due=Deadline
     ```
     (with your actual property names)
   - **Repositories**: your skill repo
   - **Environment**: Default
   - **Schedule**: Weekly, Monday, 7:00 AM, your timezone
   - **Connectors**: **Notion** + **Slack** only
3. Click **Create**

## Step 10 - Test before Monday

Click **Run now**. Watch the session output.

Notion has the most fragile data model of the four. Common first-run problems:

**"Object not found"** - the integration doesn't have access to the database. Go back to Step 4, grant access in Notion.

**"Property not found"** - the adapter tried default names that don't exist. Add the NOTION_PROPERTY_MAP line to the Routine prompt.

**"Completed" bucket includes pages from weeks ago** - Notion doesn't track a "completed_at" - we use `last_edited_time` as a proxy. Anything edited last week with a Complete status will show up. Accept the noise; if it's bad, extend the adapter to use a custom "Completed Date" property if your team maintains one.

## Common issues

**Empty buckets even though tasks exist**
Most likely a permissions issue. Double-check the integration has access to the database in Notion (not just the parent page - the database itself).

**Status property type confusion**
If the database has both a `status` property and a `select` property both named something like "Stage", the adapter picks the first one returned by the API. To force a specific one, edit `adapters/notion.md` to look up by property ID.

**Multiple databases, want to combine them**
Out of scope for the default adapter. You'd need to extend it to query multiple databases and merge results, OR set up separate Routines per database (each producing its own weekly Slack message).

**Subpages and nested content**
The adapter only queries database rows, not subpages. If your tasks have subpages with content, that content won't appear in the report. The report is a status summary, not a content extraction.

**Custom properties beyond the basics**
The adapter only reads status, assignee, and due. If you have a Priority property, Project property, etc. that should influence stack ranking, extend the adapter to pull those and use them in normalization.

## Maintenance

- **Notion property changes**: if you rename or change types of the status/assignee/due properties, update the NOTION_PROPERTY_MAP in the Routine prompt.
- **Sharing changes**: if someone removes the Claude integration's access to the database, the next run fails. Re-grant access in Notion.
- **Database moves or duplicates**: Notion database IDs change when databases are duplicated. If you fork your tasks DB, update WORKSPACE_SCOPE with the new ID.
