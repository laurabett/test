# ClickUp adapter

Phase 1 logic for ClickUp. Uses the official ClickUp MCP connector.

## Required config from Routine prompt

- `WORKSPACE_SCOPE`: either `all` (pulls across all spaces in the workspace) or a comma-separated list of space IDs

## Date math

At run time, in the user's configured timezone:

- `week_end` = this Monday, 00:00 local
- `week_start` = week_end minus 7 days
- `upcoming_end` = week_end plus 7 days

Convert to Unix milliseconds for ClickUp API filters.

## Step 1 - Get the workspace hierarchy

Call `clickup_get_workspace_hierarchy` to get the list of spaces.

If `WORKSPACE_SCOPE = all`, use every space ID returned.
If `WORKSPACE_SCOPE = comma-separated list`, use only those.

## Step 2 - Four task pulls

Use `clickup_filter_tasks` for each. Paginate if results exceed 100.

### 2a. Completed in the last 7 days

```
clickup_filter_tasks(
  date_done_gt = week_start_ms,
  date_done_lt = week_end_ms,
  include_closed = true,
  subtasks = true
)
```

After the call, filter results to tasks where `status.type == "closed"`. This catches whatever custom closed-state names the workspace uses (Done, Complete, Shipped, etc.).

### 2b. In progress

```
clickup_filter_tasks(
  date_updated_gt = (week_end_ms - 14 * 24 * 3600 * 1000),
  include_closed = false,
  subtasks = true
)
```

Filter to `status.type == "open"`. Exclude any task whose status name matches `/block|hold|stuck/i` - those go in the blocked bucket.

### 2c. Blocked or at-risk

Two pulls, then merge and dedupe by task ID.

**First**, all open tasks:
```
clickup_filter_tasks(
  include_closed = false,
  subtasks = true
)
```
Filter client-side to status names matching `/block|hold|stuck/i`.

**Second**, overdue with no recent activity:
```
clickup_filter_tasks(
  due_date_lt = week_end_ms,
  date_updated_lt = (week_end_ms - 7 * 24 * 3600 * 1000),
  include_closed = false,
  subtasks = true
)
```

Tag each with the bucket reason: `blocked_status` or `overdue_stale`.

### 2d. Upcoming next 7 days

```
clickup_filter_tasks(
  due_date_gt = week_end_ms,
  due_date_lt = upcoming_end_ms,
  include_closed = false,
  subtasks = true
)
```

## Step 3 - Normalize to common shape

Convert each ClickUp task to the standard shape Phase 2 expects:

```json
{
  "id": "task_id",
  "name": "task name",
  "container": "Space > List",
  "assignee": "first_name or 'unassigned'",
  "status": "status.status",
  "due_date": "ISO date or null",
  "url": "task.url for traceability"
}
```

Container format: combine the space name and list name with ` > `. If the task is only in a space (no list), just use the space name.

## Step 4 - Write the JSON

Save the four buckets to `/tmp/weekly-report-pull-YYYY-MM-DD.json` for the verifier in Phase 3.

## Edge cases

- **Empty completed list.** Legitimate slow week. Report 0 honestly.
- **MCP auth failure.** Surface immediately, do not retry. Phase 4 sends an error DM, not a fabricated report.
- **Tasks in multiple lists.** Dedupe by task ID. The first occurrence wins.
- **Custom statuses unfamiliar to the regex.** If a task has a status that doesn't match closed/open/blocked patterns, default to in_progress and note it in the audit log.
