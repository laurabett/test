# Report template - locked format

This is the one-page format. Phase 2 writes to this shape exactly. No added sections, no reordering, no renamed headers.

---

## Template

```
*Weekly ops report - week of {week_start_short} to {week_end_short}*

*Snapshot*
• Completed: {completed_count}
• In progress: {in_progress_count}
• Blocked: {blocked_count}
• Due next 7 days: {upcoming_count}

*Completed this week*
• {task_name} ({container}) - {assignee}
• {task_name} ({container}) - {assignee}
{...up to 8, then "...and {N} more" if truncated}

*In progress*
• {task_name} ({container}) - {assignee}, {status}
{...up to 6}

*Blocked / at risk*
• {task_name} ({container}) - {assignee}, {reason: status=Blocked OR overdue {N} days with no update}
{...up to 6}

*Upcoming this week*
• {task_name} ({container}) - {assignee}, due {due_date_short}
{...up to 8}
```

## Formatting rules

- Slack-flavored markdown: `*bold*` for section headers, `•` bullets.
- Use a consistent separator between fields. Default is a hyphen with spaces (` - `). If you prefer a different separator (em dash, pipe, comma), set it via the STYLE config (see below) so it applies everywhere.
- Date format: "Mon Apr 20" for ranges, "Apr 23" for due dates.
- Assignee = first name only. If unassigned, write `unassigned`.
- Container = whatever the adapter populated (Space > List for ClickUp, Project for Asana, Board for Monday, Database for Notion).
- Stack-rank within each section by what is most material to the reader. Default ordering:
  1. Items flagged high priority on the source platform
  2. Items with imminent due dates
  3. Items in containers the reader cares most about (configurable - see below)
  4. Everything else
- Truncation: max 8 items in Completed and Upcoming, max 6 in In Progress and Blocked. Overflow goes into a single "...and N more" line at the end of that section.

## Voice and style

The default voice is neutral and professional so the report works for any team without customization. Voice and style are configurable - set the TONE and STYLE values in the Routine prompt to change them. If nothing is configured, use the default below.

### Default voice (neutral)

- Clear, concise, professional. Plain language.
- State what happened, what is in progress, and what is blocked. Be specific and factual.
- Bullet fragments are fine - full sentences are not required.
- Past tense for completed items, present for in-progress, future for upcoming.
- If a task is overdue, say it is overdue. Do not euphemize delays or blockers.
- Avoid empty filler and padding ("in today's fast-paced environment", restating the section header, hedging that adds no information).

### TONE presets (optional)

Set `TONE` in the Routine prompt to one of:

- `neutral` (default) - clear, professional, balanced detail.
- `concise` - terse. Shortest accurate phrasing. Drop adjectives.
- `detailed` - one extra clause of context per item where it helps the reader.
- `custom` - follow the free-text voice guidance the user supplies in the Routine prompt under `TONE_NOTES`.

### STYLE rules (optional)

Set `STYLE` in the Routine prompt to apply hard formatting and word-choice constraints. Leave it empty for none. STYLE is a free-text list of rules the report must satisfy, checked in Phase 3. Examples a user might set:

- `no em dashes` - use hyphens with spaces instead of the em dash character.
- `avoid: leverage, robust, streamline, synergy, circle back, delve` - rewrite any of these words.
- `first names only, no titles`
- `separator: |` - use a pipe between fields instead of a hyphen.

Any rule listed in STYLE becomes a Phase 3 verification check. Rules not listed are not enforced.

## Examples

### Bad blocked item (vague, hedged)
```
• Landing page revision is currently experiencing some delays due to pending client feedback (Marketing) - Sarah, awaiting input
```

### Good blocked item (specific, direct)
```
• Acme landing page copy (Marketing) - Sarah, blocked 9 days waiting on client
```

### Bad completed item (padded)
```
• Successfully delivered the Q3 report to drive stakeholder alignment (Strategy) - John
```

### Good completed item (plain)
```
• Q3 report sent to leadership (Strategy) - John
```
