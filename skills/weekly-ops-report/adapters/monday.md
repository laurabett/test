# Monday.com adapter

Phase 1 logic for Monday.com. Uses the official Monday.com MCP connector.

## Required config from Routine prompt

- `WORKSPACE_SCOPE`: comma-separated list of board IDs

Monday.com's hierarchy is Workspace > Folder > Board > Group > Item > Subitem. There's no native concept of "all my work across all boards" the way ClickUp and Asana have - reports are board-scoped by design. The user MUST specify which boards to include.

For the weekly report, recommend 1-5 boards. More than that and the report blows past the one-page cap.

## Date math

Same as other adapters. `week_start`, `week_end`, `upcoming_end` based on this Monday at 00:00 local.

Monday uses ISO 8601 strings for date columns.

## Step 1 - Resolve boards

For each board ID in `WORKSPACE_SCOPE`:
- Call the Monday MCP `get_board` (or equivalent - tool names vary by MCP version) to validate the board exists and the user has access
- Capture board name and column structure (you'll need to identify which columns are status, person, date)

## Step 2 - Identify the relevant columns

Monday boards are user-defined. There's no guaranteed "due date" or "status" column - they're just custom columns of certain types.

For each board, find:
- **Status column**: the first column with `type = "status"` or `type = "color"` (Monday calls these `status` columns in the API). If multiple, prefer one named "Status".
- **Person column**: the first column with `type = "person"` or `type = "people"`.
- **Date column**: the first column with `type = "date"` or `type = "timeline"`. If multiple, prefer one named "Due Date" or "Deadline".

If any of these columns don't exist on a board, log it and skip that board with a note in the audit output. Don't try to guess.

## Step 3 - Pull all items per board

Monday's MCP exposes `get_items_by_board_id` or similar. Pull all items per board, then bucket them client-side.

For each item, you get its column values. Parse:
- `status_column.label` (the human-readable status text, e.g., "Working on it", "Done", "Stuck")
- `person_column.persons_and_teams` (array of assignees)
- `date_column.date` (ISO date string)
- `item.updated_at` (last activity timestamp)

### 2a. Completed (last 7 days)

Items where:
- `status_column.label` matches `/done|complete|shipped|closed/i`, AND
- The status was changed in the last 7 days (use `item.updated_at` as a proxy, since Monday doesn't always expose status change history without GraphQL queries)

If `updated_at` is unreliable as a proxy (item updated for non-status reasons), accept some noise - this is a known limitation of the Monday data model for retrospective reporting.

### 2b. In progress

Items where:
- `status_column.label` matches `/working|in progress|active|doing/i`, OR is set but doesn't match completed/blocked patterns
- `updated_at` is within the last 14 days (proves it's actually active, not abandoned)

### 2c. Blocked or at-risk

Two paths, merge by item ID.

**First**: items where `status_column.label` matches `/stuck|block|hold|wait/i`. Monday's default "Stuck" status is the canonical blocked signal.

**Second**: items where the date column is in the past AND `updated_at` is more than 7 days old.

### 2d. Upcoming next 7 days

Items where the date column falls between `week_end` and `upcoming_end`, AND status is not in the completed pattern.

## Step 4 - Normalize to common shape

```json
{
  "id": "item.id",
  "name": "item.name",
  "container": "board name (optionally + group name if useful)",
  "assignee": "first name of first person in person column, or 'unassigned'",
  "status": "status column label",
  "due_date": "date column value or null",
  "url": "https://{account}.monday.com/boards/{board_id}/pulses/{item_id}"
}
```

## Step 5 - Write the JSON

Same as other adapters.

## Edge cases

- **Board has no status column.** Skip the board, log it. The user should add a status column or remove the board from scope.
- **Multiple person column assignees.** Use the first one's first name. Note in audit that multiple were assigned.
- **Subitems.** Monday subitems are separate items with their own boards (technically). Default to including subitems but tagging them as such; if the report gets noisy, add a config flag to skip subitems.
- **Custom status labels.** The regex patterns above cover ~80% of teams. If a workspace uses unusual status names ("Frozen" for blocked, "Burning" for urgent), the user should adjust the patterns in this adapter file or set up a status mapping in their Routine prompt.
- **API rate limits.** Monday's API has tighter rate limits than ClickUp/Asana. For 5+ boards, expect the pull phase to take 30-60 seconds. Don't parallelize beyond what the MCP defaults to.
