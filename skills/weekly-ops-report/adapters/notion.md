# Notion adapter

Phase 1 logic for Notion. Uses the official Notion MCP connector (`https://mcp.notion.com/mcp`).

## Required config from Routine prompt

- `WORKSPACE_SCOPE`: a Notion **database ID** (just one - Notion task tracking is database-shaped, not workspace-shaped)

Notion is the most loosely structured of the four platforms. There's no native "tasks" concept - instead, teams build a database with whatever properties they want, and that database becomes their task tracker.

For this skill to work, the user MUST point at a single tasks database. If they have multiple project databases, they pick the primary one (or set up multiple Routines, one per database).

## Required database properties

The skill needs the database to have properties (under whatever names) that map to:

- **Status** - a `select`, `status`, or `multi_select` property
- **Assignee** - a `people` property
- **Due date** - a `date` property
- **Last edited time** - usually auto-available; the skill uses `last_edited_time` from the page metadata

The Routine prompt can include a property-name map if the database uses non-standard names:
```
NOTION_PROPERTY_MAP: status=Stage, assignee=Owner, due=Deadline
```

If the map isn't provided, the adapter tries common names: `Status`, `Assignee`, `Owner`, `Due`, `Due Date`, `Deadline`. If none match, it asks (in interactive mode) or fails with a clear error (in Routine mode).

## Date math

Same as other adapters.

## Step 1 - Resolve the database and properties

Call the Notion MCP `retrieve_database` (or equivalent) with the database ID. From the response:

- Confirm the database exists and is accessible
- Inspect `properties` to find the status, assignee, and due date properties (using either NOTION_PROPERTY_MAP or the default name list)
- Capture the option values for the status property - these become the input for the bucket classification regex

## Step 2 - Detect status semantics

Notion `status` properties have three groups: `To-do`, `In progress`, `Complete`. If the database uses a `status` property type, prefer those native groups - they're the cleanest signal:

- Group `Complete` -> completed bucket
- Group `In progress` -> in_progress or blocked (further classify by option name)
- Group `To-do` -> upcoming (if has due date) or in_progress

If it's a `select` or `multi_select` instead, fall back to regex on option names:
- `/done|complete|shipped|closed/i` -> completed
- `/block|hold|stuck|wait/i` -> blocked
- everything else open -> in_progress

## Step 3 - Four queries

Use the Notion MCP `query_database` tool with filters.

### 3a. Completed in the last 7 days

```
query_database(
  database_id,
  filter = {
    and: [
      { property: status_prop, status: { group: "Complete" } },     # or select equals
      { timestamp: "last_edited_time", last_edited_time: { on_or_after: week_start_iso, before: week_end_iso } }
    ]
  }
)
```

Caveat: Notion doesn't natively store "completed_at" - we use `last_edited_time` as a proxy. This catches edits that aren't completion events too. Accept the noise; flag in audit if the count looks suspicious.

### 3b. In progress

```
query_database(
  database_id,
  filter = {
    and: [
      { property: status_prop, status: { group: "In progress" } },
      { timestamp: "last_edited_time", last_edited_time: { on_or_after: (week_end - 14 days) } }
    ]
  }
)
```

Then exclude pages whose status option matches the blocked regex (those go to 3c).

### 3c. Blocked or at-risk

Two queries, merge by page ID.

**First**: pages with status option matching `/block|hold|stuck|wait/i`.

**Second**: pages where `due` is before today AND `last_edited_time` is more than 7 days old AND status is not Complete.

### 3d. Upcoming next 7 days

```
query_database(
  database_id,
  filter = {
    and: [
      { property: due_prop, date: { on_or_after: week_end_iso, before: upcoming_end_iso } },
      { property: status_prop, status: { does_not_equal: "Done" } }   # or group != Complete
    ]
  }
)
```

## Step 4 - Normalize to common shape

```json
{
  "id": "page.id",
  "name": "page title (from the title property)",
  "container": "database name",
  "assignee": "first name of first person in assignee property, or 'unassigned'",
  "status": "status option name",
  "due_date": "due date or null",
  "url": "page.url"
}
```

Container is just the database name - Notion doesn't have ClickUp-style nested lists. If the user wants finer grouping, recommend they use a `select` "Project" or "Area" property and the skill can be extended to surface that in container.

## Step 5 - Write the JSON

Same as other adapters.

## Edge cases

- **Database has no status property.** Hard fail with a clear error - the skill can't bucket without it. The user needs to either add one or pick a different database.
- **Multiple title properties.** Notion always has exactly one title property; use whichever the API marks as `type: "title"`.
- **Pagination.** Notion `query_database` returns up to 100 results per call with a cursor. Paginate if any bucket might exceed 100.
- **Permissions.** The Notion connector only sees databases that have been explicitly shared with the integration. If the database ID is correct but the query returns "object not found", the user needs to share the database with their Notion integration. Setup SOP covers this.
- **Timezone.** Notion stores dates in the database's timezone setting. Make sure the Routine timezone matches (or normalize both to UTC for filter math, then display in user's local zone).
