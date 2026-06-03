# Trello adapter

Phase 1 logic for Trello.

**Trello has no official MCP connector.** Unlike the ClickUp, Asana, Monday, and
Notion adapters, this adapter calls the **Trello REST API directly with `curl`**
from the Routine session. Credentials are read from environment variables, never
hard-coded and never committed to the repo. See `setup-sops/trello-setup.md` for
how to create the key/token and supply them to the Routine.

## Required config

From the Routine prompt:

- `WORKSPACE_SCOPE`: either `all` (every open board the token's user can see) or a
  comma-separated list of board IDs, e.g. `5f3a...,6b1c...` (no spaces).

From the environment (set on the Routine, not in the prompt or repo):

- `TRELLO_KEY`: the Trello API key
- `TRELLO_TOKEN`: a Trello API token (read-only scope is sufficient)

If `TRELLO_KEY` or `TRELLO_TOKEN` is missing, do not guess and do not proceed with
a fabricated pull. Surface the error so Phase 4 sends an error message.

## API basics

- Base URL: `https://api.trello.com/1`
- Auth: append `key=$TRELLO_KEY&token=$TRELLO_TOKEN` to the query string of every
  request.
- Rate limits: 300 requests / 10s per key, 100 / 10s per token. This adapter makes
  ~5-6 requests per board, well under the limit for any normal scope.
- All `curl` calls should use `-s` (silent) and `-G` with `--data-urlencode` for
  query params so values are encoded correctly. Always quote the URL.

Example request shape:

```bash
curl -s -G "https://api.trello.com/1/boards/$BOARD_ID/cards" \
  --data-urlencode "key=$TRELLO_KEY" \
  --data-urlencode "token=$TRELLO_TOKEN" \
  --data-urlencode "fields=id,name,idList,due,dueComplete,dateLastActivity,idMembers,labels,shortUrl,closed" \
  --data-urlencode "filter=open"
```

## Date math

At run time, in the user's configured timezone:

- `week_end` = this Monday, 00:00 local
- `week_start` = `week_end` minus 7 days
- `upcoming_end` = `week_end` plus 7 days

Trello timestamps (`due`, `dateLastActivity`, action `date`) are ISO 8601 UTC.
Convert the three boundaries above to ISO 8601 UTC for comparison, and use the
ISO `week_start` as the `since` parameter on the actions call.

## Step 0 - Resolve the board list

If `WORKSPACE_SCOPE = all`:

```bash
curl -s -G "https://api.trello.com/1/members/me/boards" \
  --data-urlencode "key=$TRELLO_KEY" --data-urlencode "token=$TRELLO_TOKEN" \
  --data-urlencode "filter=open" --data-urlencode "fields=id,name"
```

If `WORKSPACE_SCOPE` is a comma-separated list, use those IDs directly.

For **each** board, run Steps 1-3 below, then merge all boards' results.

## Step 1 - Board context (one-time per board)

Fetch the board name, its lists, and its members. These let us build the
`container` and `assignee` fields and classify lists.

```bash
# Board name
curl -s -G ".../boards/$BOARD_ID" ... --data-urlencode "fields=name"

# Open lists
curl -s -G ".../boards/$BOARD_ID/lists" ... \
  --data-urlencode "filter=open" --data-urlencode "fields=id,name"

# Board members (id -> fullName)
curl -s -G ".../boards/$BOARD_ID/members" ... \
  --data-urlencode "fields=fullName,username"
```

Classify each list by its name:

- **done list**: name matches `/done|complete|completed|shipped|closed|launched|live/i`
- **blocked list**: name matches `/block|hold|stuck|waiting|paused|on hold/i`
- **active list**: everything else

Build lookup maps: `listId -> {name, kind}` and `memberId -> fullName`.

## Step 2 - The pulls

### 2a. Card snapshot (open cards)

```bash
curl -s -G ".../boards/$BOARD_ID/cards" ... \
  --data-urlencode "fields=id,name,idList,due,dueComplete,dateLastActivity,idMembers,labels,shortUrl,closed" \
  --data-urlencode "filter=open"
```

This is the working set for the in_progress, blocked, and upcoming buckets.

### 2b. Board actions since week_start (for completion detection)

Trello has no "date completed" field on a card, so completion is detected from the
activity log. Pull `updateCard` actions in the window:

```bash
curl -s -G ".../boards/$BOARD_ID/actions" ... \
  --data-urlencode "filter=updateCard" \
  --data-urlencode "since=$WEEK_START_ISO" \
  --data-urlencode "limit=1000"
```

If exactly 1000 actions are returned, paginate: take the oldest action's `id` and
re-request with `before=<that id>` until fewer than 1000 come back. Merge.

## Step 3 - Bucket the cards

**completed** (finished in the window) - union of these signals, deduped by card id:

1. **Archived in the window** (the primary signal for archive-based workflows):
   an `updateCard` action where `data.old.closed == false` and
   `data.card.closed == true`. Use `data.card.id` and `data.card.name`.
2. **Moved into a done list**: an `updateCard` action where
   `data.listAfter.name` matches the done pattern and `data.listBefore` differs.
   Use `data.card.id`, `data.card.name`, and `data.listAfter.name`.
3. **Marked due-complete**: an `updateCard` action where `data.old.dueComplete == false`
   and `data.card.dueComplete == true`.

Collect the set of completed card IDs from all three signals, deduped.

**Hydrate completed cards.** The action payload for an archived card often omits
`idMembers`, `due`, and the current list, so the assignee/due fields would be blank.
For each completed card ID, fetch the full card directly (archived cards are still
retrievable by ID):

```bash
curl -s -G ".../cards/$CARD_ID" ... \
  --data-urlencode "fields=name,idList,due,dueComplete,idMembers,shortUrl,closed"
```

Use the hydrated `idList` to resolve the container list name (fall back to the
`listAfter` name from a move action if the list no longer exists), and the hydrated
`idMembers` to resolve the assignee. If a card 404s (deleted, not just archived),
drop it from the completed bucket - do not invent details.

**blocked / at risk** - from the open-card snapshot (2a), a card is blocked if ANY:

- it sits on a **blocked list**, OR
- it has a label whose name matches `/block|hold|stuck|risk|waiting/i`, OR
- it is **overdue and stale**: `due < now`, `dueComplete == false`, and
  `dateLastActivity` older than 7 days.

Tag each with a reason: `blocked_list`, `blocked_label`, or `overdue_stale`.
Exclude any card already in `completed`.

**in_progress** - open cards (2a) that are:

- on an **active list** (not done, not blocked), AND
- `dateLastActivity` within the last 14 days, AND
- not already in `blocked` or `completed`.

**upcoming** (due next 7 days) - open cards (2a) where `due` is in
`(week_end, upcoming_end]` and `dueComplete == false`. A card can appear in both
`upcoming` and `in_progress`; that's fine - report it in both if material, but
prefer `upcoming` if you must dedupe for length.

## Step 4 - Normalize to common shape

Convert every card to the standard shape Phase 2 expects:

```json
{
  "id": "card_id",
  "name": "card name",
  "container": "Board name > List name",
  "assignee": "first member fullName or 'unassigned'",
  "status": "list name (or blocked reason)",
  "due_date": "ISO date or null",
  "url": "card shortUrl for traceability"
}
```

- **container**: board name + current/landing list name joined with ` > `.
- **assignee**: map the first id in `idMembers` via the member lookup. If a card has
  multiple members, use the first and you may append ` +N` if it aids clarity. If
  `idMembers` is empty, use `unassigned`.
- **status**: the list name; for blocked cards you may use the reason
  (`Blocked`, `Overdue`) if the list name isn't descriptive.
- **due_date**: the card `due` in ISO, or `null`.
- **url**: `shortUrl`.

## Step 5 - Write the JSON

Save the four buckets to `/tmp/weekly-report-pull-YYYY-MM-DD.json` for the Phase 3
verifier, same as every other adapter.

## Edge cases

- **No done/blocked lists by name.** If the board uses labels instead of dedicated
  lists, the label and due-complete signals still work. Completion via list-move
  just won't fire - that's acceptable. Note it in the audit log.
- **Empty completed bucket.** Legitimate slow week. Report 0 honestly - never invent
  completions.
- **Auth failure (401/invalid token).** Surface immediately, do not retry. Phase 4
  sends an error message, not a fabricated report.
- **Token lacks access to a board ID in scope.** Trello returns 401/404 for that
  board. Skip it, note which board was skipped in the audit log, and continue with
  the rest. Do not fail the whole run for one bad board ID.
- **Cards on multiple boards / duplicate ids.** Card ids are globally unique in
  Trello, so dedupe by id across boards; first occurrence wins.
- **Custom workflow names.** If "blocked" or "done" is expressed with terms the
  regexes miss (e.g., "Frozen", "Parked"), add them to the patterns in Step 1 and
  Step 3, then push - the next run picks them up.
- **Actions truncated.** If you hit the 1000-action page limit and pagination by
  `before` isn't completing, prefer reporting the completions you did capture and
  note the truncation, rather than guessing.
