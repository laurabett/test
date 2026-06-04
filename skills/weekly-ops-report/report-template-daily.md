# Daily outstanding-work report template

The locked format for the **daily** "what's still not done" report. This is a
different report from the weekly one (`report-template.md`): it lists **every open
item**, grouped by board and list, with no "Completed" section. Use it when the
invocation says `REPORT=daily` or "daily outstanding report".

## Purpose

A morning snapshot of all open work so nothing slips. Completed work is irrelevant
here - this report answers one question: *what is still not done?*

## Source data

The full set of **open** cards from the configured boards (Phase 1, daily mode -
see the adapter). No completion detection, no 7-day window. "Open" = not archived
and not sitting on a done-named list.

## Format

Open with the date line:

```
*Outstanding work - Tue Jun 3*
```

Then a one-line snapshot:

```
*Open items: 45* — Overdue: 4 · Due today: 2 · Due ≤3 days: 7 · No due date: 32
```

Then, **for each board**, a section. Within each board, group by list and show
every open card. Order lists by workflow position if known (e.g., In Progress
before Requested), otherwise as returned. Order cards within a list by due date
ascending (cards with no due date last).

```
*Andersonville Seminary*
_In Progress (12)_
• Update catalog per cherry — Laura — ⚠️ overdue (May 28)
• Fix transcript wording — unassigned — due today
• Add onsite picture button — Laura — due Jun 5
• Homepage RED transcript note — Laura — no due date
... (list every open card in this list)

_Requested (27)_
• ...

*GI lineup*
_In Process (6)_
• Bolick follow-up — Laura — no due date
• ...
```

## Due-date flags

Mark each card's due status inline so the eye catches risk even in a long list:

- `⚠️ overdue (Mon DD)` — due date is before today
- `due today`
- `due Mon DD` — due within the next 3 days
- `due Mon DD` — further out (same wording; the snapshot counts handle urgency)
- `no due date` — omit a date entirely

## Fields per line

`• {name} — {assignee} — {due flag}`

Keep names intact but trim trailing whitespace. If a card name is extremely long
(a full sentence, which happens on these boards), keep it - do not truncate the
substance; this report values completeness over brevity.

## Length

Unlike the weekly report, the daily report is **not** capped at one page - the user
explicitly wants the full open list. Do not roll items into "...and N more." List
everything. Keep formatting tight so it stays scannable.

## Tone and style

Plain and factual. No narrative, no commentary on priorities unless a STYLE/TONE
config says otherwise. The grouping and due flags carry the meaning.

## Verification (Phase 3, daily variant)

1. **No fabrication** - every card listed appears in the Phase 1 open-card JSON.
2. **Completeness** - the number of cards listed equals the total open count in the
   snapshot. If they differ, something was dropped - fix before delivery.
3. **Style** - apply any configured STYLE rules.

(The one-page length cap from the weekly report does NOT apply here.)
