---
name: weekly-ops-report
description: Generate and deliver a weekly one-page operational report from a project management platform (ClickUp, Asana, Monday.com, or Notion) and post it to a Slack channel or DM. Pulls completed, in-progress, blocked, and upcoming tasks for the past 7 days, synthesizes a one-page report in a standard ops format, verifies every claim against the source data, and delivers via Slack. Designed to be invoked by a Claude Code Routine on a weekly schedule, and also runnable interactively for previews and backfills. Use whenever the user says "run the weekly report", "generate weekly ops report", "preview Monday report", "send the weekly status update", mentions a scheduled weekly ops routine, or when a Routine fires its configured prompt.
---

# Weekly Operational Report

A one-page Monday-morning ops report, generated from your project management platform of choice and delivered to Slack. Designed to run autonomously every week via a Claude Code Routine.

## Supported platforms

Pick one source of truth per install. The adapter file tells the skill how to pull data from that platform.

- **ClickUp** - see `adapters/clickup.md`
- **Asana** - see `adapters/asana.md`
- **Monday.com** - see `adapters/monday.md`
- **Notion** - see `adapters/notion.md`
- **Trello** - see `adapters/trello.md` (custom: uses the Trello REST API via `curl`, not an MCP connector)

The user picks the platform during setup. The Routine prompt names it (e.g., "use the asana adapter"), and this skill loads the matching adapter file.

## Configuration

This skill reads config from the Routine prompt that invokes it.

**Required:**

1. **PLATFORM** - one of `clickup`, `asana`, `monday`, `notion`, `trello`
2. **WORKSPACE_SCOPE** - what to pull from (workspace ID, team ID, board IDs, database ID, etc., depending on platform)
3. **SLACK_DESTINATION** - the Slack channel ID (a DM channel like `D0XXXXXXX` or a public/private channel like `C0XXXXXXX`)

If any of the three required values is missing from the invocation, ask the user before proceeding. Never guess.

**Optional (report type):**

0. **REPORT** - `weekly` (default) or `daily`.
   - `weekly` produces the four-bucket Monday summary using `report-template.md`
     (completed, in progress, blocked, upcoming over a 7-day window).
   - `daily` produces a "what's still not done" report using
     `report-template-daily.md`: every open card, grouped by board and list, with
     due-date flags and no Completed section. Adapters run in daily mode (see the
     adapter's "Daily mode" section) - open cards only, no completion detection,
     no one-page cap.

**Optional (voice and style):**

4. **TONE** - `neutral` (default), `concise`, `detailed`, or `custom`. Controls how the report reads. See `report-template.md`.
5. **TONE_NOTES** - free-text voice guidance, used only when `TONE = custom`.
6. **STYLE** - free-text list of hard formatting and word-choice rules to enforce in Phase 3 (e.g., `no em dashes`, `avoid: leverage, synergy`). Empty by default, which means no extra constraints beyond clarity.

If the optional values are not supplied, use the neutral default. The skill ships with no built-in personal voice - it reads professionally for any team out of the box, and each install can set its own tone and style.

## Execution modes

- **Routine mode** - invoked by a scheduled Routine. The prompt explicitly says "scheduled mode" or "autonomous run". Run all four phases without confirmation pauses. Deliver to Slack.
- **Interactive preview** - user says "preview the weekly report" or "dry-run". Run phases 1-3, show the report, ask before delivery.
- **Backfill** - user specifies a past week ("weekly report for week of Apr 13"). Adjust the date window, run all phases, ask before delivery.

Default to interactive behavior unless the invocation is clearly a Routine.

## The four phases

Run in order. In Routine mode, no pauses between phases.

### Phase 1 - Pull

Load the platform adapter file from `adapters/{PLATFORM}.md`. Follow its exact queries. Most adapters use the platform's MCP connector; the Trello adapter is the exception - it calls the Trello REST API directly with `curl` using `TRELLO_KEY`/`TRELLO_TOKEN` from the environment.

Every adapter returns the same four buckets:

- **completed** - finished in the last 7 days
- **in_progress** - actively being worked on
- **blocked** - flagged as blocked, on hold, or overdue with no recent activity
- **upcoming** - due in the next 7 days

Each item should have: a stable ID, name, container (project/list/board/database), assignee (or "unassigned"), status, and due date if applicable.

Write the raw pull as JSON to the working directory so Phase 3 can verify against it.

### Phase 2 - Synthesize

Load `report-template.md`. Use it as the locked format. Do not restructure.

Write in clear, professional language by default: direct, concrete, no filler. Apply the configured TONE (see `report-template.md`); if none is set, use the neutral default. If STYLE rules are configured, follow them while drafting.

Stack-rank within each section by what is most material to the reader: high-priority items first, then imminent due dates, then the containers the reader cares most about. Do not assume a specific business model.

Keep it to one page. If a section has more than 6-8 items, roll minor items into a "...and N more" line.

### Phase 3 - Verify

Run the report against three checks before delivery:

1. **No fabrication** - every task name, ID, and assignee in the report appears in the Phase 1 JSON pull. Drop anything that doesn't.
2. **Style rules** - if a STYLE config was supplied, scan the report against each rule in it (e.g., banned words, em-dash restriction, separator choice) and rewrite any hits. If no STYLE was supplied, just confirm the report is free of obvious filler and padding. The default ships with no banned-word list.
3. **Length cap** - report fits on one page. Target ~350-500 words, hard cap 600.

If any check fails, fix and re-verify. Note what was fixed in the session output so the audit trail captures it.

### Phase 4 - Deliver

Use the Slack MCP `slack_send_message` tool. The `channel_id` is the SLACK_DESTINATION from the config. The `message` is the full report formatted per `report-template.md`.

Open the message with the week range. Example: `*Weekly ops report - week of Mon Apr 13 to Sun Apr 19*`

In Routine mode: send, confirm success in session output, done.
In interactive mode: show the final draft, confirm, then send.

## Files in this skill

- `SKILL.md` - this file (dispatcher)
- `adapters/clickup.md`, `adapters/asana.md`, `adapters/monday.md`, `adapters/notion.md` - per-platform pull queries
- `report-template.md` - the locked one-page format
- `setup-sops/` - one SOP per platform for first-time setup
- `setup-sops/operating-runbook.md` - day-to-day operations guide (platform-agnostic)
- `ROUTINE_PROMPT_TEMPLATE.txt` - copy-paste prompt for the Routine creation form
- `examples/sample-report.md` - reference output
- `README.md` - install + quickstart

## Safety rules

- **Never fabricate task data.** If the platform pull fails or returns empty, send a short "report could not be generated - [error]" Slack message instead of a fabricated report.
- **Verify the Slack destination is what the user configured.** If the channel ID in the prompt doesn't match what was set up, stop and ask.
- **One-page cap is real.** If the report runs long, cut from the bottom of each section, not from the Snapshot or Blocked sections.
- **Status name detection is per-adapter.** Each adapter file owns the logic for what "blocked" or "in progress" means on that platform. Don't try to apply ClickUp logic to Asana data.
