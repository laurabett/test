# Asana adapter

Phase 1 logic for Asana. Uses the official Asana MCP connector (V2, `https://mcp.asana.com/mcp`).

## Required config from Routine prompt

- `WORKSPACE_SCOPE`: either `all` (pulls across all projects in the user's default workspace) or a comma-separated list of project GIDs

Asana's hierarchy: Workspace > Team > Project > Task > Subtask. Tasks live in projects (and can belong to multiple). For a "weekly report across all my work", scoping to the workspace is usually right; for client-specific reporting, scope to specific project GIDs.

## Date math

Same as ClickUp adapter. `week_start`, `week_end`, `upcoming_end` based on this Monday at 00:00 local.

Asana date filters use ISO 8601 strings, not Unix ms.

## Step 1 - Resolve scope

If `WORKSPACE_SCOPE = all`:
- Call `asana_typeahead_search` or `asana_list_workspaces` to get the user's workspace GID
- Then `asana_search_projects` to enumerate projects, or pull tasks at the workspace level

If `WORKSPACE_SCOPE = comma-separated project GIDs`, use them directly.

## Step 2 - Four task pulls

Asana's primary read tool is `asana_search_tasks_for_workspace` (workspace-wide) or `asana_get_tasks_for_project` (per project). Use whichever matches the scope.

### 2a. Completed in the last 7 days

```
asana_search_tasks_for_workspace(
  workspace_gid,
  completed = true,
  completed_on.after = week_start_iso,
  completed_on.before = week_end_iso
)
```

Asana has a first-class `completed` boolean and `completed_at` timestamp - simpler than ClickUp's status-name matching.

### 2b. In progress

```
asana_search_tasks_for_workspace(
  workspace_gid,
  completed = false,
  modified_at.after = (week_end - 14 days)
)
```

Then exclude tasks whose section name matches `/block|hold|stuck/i` (Asana sections often act as Kanban columns).

### 2c. Blocked or at-risk

Two pulls, merge by task GID.

**First**, tasks in sections that signal blocked. Asana sections are how most teams represent blocked status. Pull all open tasks and filter client-side:
```
asana_search_tasks_for_workspace(
  workspace_gid,
  completed = false
)
```
For each task, get the membership data (which section in which project) and filter to section names matching `/block|hold|stuck|wait/i`.

**Second**, overdue with no recent activity:
```
asana_search_tasks_for_workspace(
  workspace_gid,
  completed = false,
  due_on.before = today_iso,
  modified_at.before = (week_end - 7 days)
)
```

Tag with `blocked_section` or `overdue_stale`.

### 2d. Upcoming next 7 days

```
asana_search_tasks_for_workspace(
  workspace_gid,
  completed = false,
  due_on.after = week_end_iso,
  due_on.before = upcoming_end_iso
)
```

## Step 3 - Normalize to common shape

```json
{
  "id": "task_gid",
  "name": "task.name",
  "container": "Project name (or 'Project / Section' if section is meaningful)",
  "assignee": "first name from assignee.name, or 'unassigned'",
  "status": "section name OR 'completed' OR 'in progress'",
  "due_date": "due_on or null",
  "url": "task.permalink_url"
}
```

For container: tasks belong to projects, and projects often have meaningful section structure. Use the first project's name. If the section name carries info ("In Review", "Waiting on Client"), append it: `Project Name / In Review`.

## Step 4 - Write the JSON

Same as ClickUp adapter - dump the four buckets to `/tmp/weekly-report-pull-YYYY-MM-DD.json`.

## Edge cases

- **Tasks in multiple projects.** Asana allows this. Dedupe by task GID; for container display, use the project the user most recently engaged with (or first project if unclear).
- **No `due_on` set.** Common in Asana. Such tasks won't appear in 2d (upcoming) - that's correct behavior.
- **Sections vs custom fields for status.** Some Asana teams use a custom field for status instead of sections. If the workspace has a custom field named "Status", "Stage", or similar, prefer it over section names for the in_progress/blocked classification. Check `task.custom_fields` for this.
- **V1 vs V2 MCP server.** This adapter assumes V2 (`https://mcp.asana.com/mcp`). The V1 SSE server is deprecated and shuts down 2026-05-11. If the user is on V1, the tool names are similar but parameter shapes differ - they should re-add the connector with the V2 URL. See the Asana setup SOP.
