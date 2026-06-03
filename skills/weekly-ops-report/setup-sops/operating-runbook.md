# Operating runbook

How to operate, debug, and extend the weekly ops report once it's installed and running. Platform-agnostic - use alongside the platform-specific setup SOP.

## Quick reference

| Task | Where |
|------|-------|
| Pause the weekly report | claude.ai/code/scheduled > [task] > Repeats toggle |
| Edit the schedule | claude.ai/code/scheduled > [task] > edit |
| Edit the prompt or scope | Same place - edit the prompt field |
| Edit the report format or platform logic | Edit files in `weekly-ops-report/` in your repo, push to default branch |
| See past runs | claude.ai/code/scheduled > [task] > sessions list |
| Run immediately (off-schedule) | claude.ai/code/scheduled > [task] > Run now |
| Preview a report interactively | Open Claude Code, ask "preview the weekly ops report" |
| Backfill a past week | Open Claude Code, ask "generate weekly report for week of [date]" |

## The skill vs the Routine - what changes go where

This trips people up. There are two things to edit, in two different places:

**Edit the Routine config** (at claude.ai/code/scheduled) when you want to change:
- Schedule (day, time, frequency, timezone)
- Which Slack channel the report goes to
- Which platform scope (workspace IDs, project GIDs, board IDs, database IDs)
- Which connectors are enabled
- Pausing or resuming

**Edit the skill files** (in your GitHub repo) when you want to change:
- Report format, headers, default voice, tone/style config
- Which fields appear, how items are ranked, truncation rules
- Status name regex (what counts as blocked, in progress, etc.)
- Verification rules (what Phase 3 checks)
- Adapter logic (how data is pulled from the platform)

The split is intentional: operational config stays out of source control, workflow logic stays in source control with full diff history.

## Monitoring the first 4-6 weeks

Every Routine run creates a session at claude.ai/code/scheduled > [your task]. The session is the audit trail - full tool calls, raw platform responses, the report draft, and the Slack delivery confirmation.

For the first 4-6 Mondays, glance at the session output before you trust the report:

1. Open the latest session
2. Scan for any error or warning messages
3. Compare a few items in the report against what you actually see in the source platform
4. Confirm the Slack message arrived

After 4-6 clean runs, you can stop checking and just trust the Slack delivery. If the DM doesn't show up by 7:30 AM Monday, open the session to see what happened.

## Debugging a failed run

Symptoms and where to look:

**No Slack message at all**
- Open the session at claude.ai/code/scheduled
- Look at the bottom of the session for the final outcome
- Common causes: connector auth expired, wrong channel ID, network issue

**Slack message arrived but says "report could not be generated"**
- The skill caught a platform error and surfaced it correctly
- Look at the session for the actual platform error message
- Common causes: platform connector auth expired, scope contains an ID that no longer exists, platform API outage

**Report has fabricated tasks (tasks that don't exist in the platform)**
- Phase 3 verification failed to catch a hallucination
- This shouldn't happen, but if it does:
  - Open the session, find the Phase 1 JSON pull
  - Search for the fabricated task in the JSON - if it's not there, the verifier missed it
  - Tighten the no-fabrication check in `SKILL.md` Phase 3, or add explicit ID matching in the verifier

**Report violates a configured STYLE rule (e.g., a banned word or em-dash rule slips through)**
- Phase 3 style check failed for a rule you set in the Routine prompt
- Open the session, find the verification step
- If the rule wasn't precise enough, tighten the STYLE wording in the Routine prompt, or move it into the default voice in `report-template.md`
- Push the change (if you edited the file); next run picks it up

**Report is too long (over one page)**
- Phase 3 length check failed, or the truncation logic wasn't aggressive enough
- Reduce the per-section caps in `report-template.md`
- Push and rerun

## Onboarding someone else

If you're handing this off to a teammate:

1. Walk them through the platform setup SOP for their platform
2. Show them the operating runbook (this file)
3. Give them edit access to the GitHub repo (so they can change the skill)
4. Give them admin access to the Routine at claude.ai/code/scheduled (or have them create their own Routine pointing at the same skill, with their own Slack destination)

Multiple users can use the same skill repo with different Routines - one skill, many installs.

## Adding a new platform scope

You want to add another workspace, project, board, or database to an existing Routine.

1. Find the new ID in the platform (per the platform setup SOP)
2. Edit the Routine prompt at claude.ai/code/scheduled to include the new ID in WORKSPACE_SCOPE
3. Click **Run now** to verify
4. If results look right, you're done - the next scheduled run picks up the new scope

You don't need to touch the skill repo for scope changes.

## Adding a new platform (extending the skill)

You want to support a platform that isn't ClickUp, Asana, Monday, or Notion (Linear, Jira, Trello, Smartsheet, etc.).

1. Create a new file `adapters/{platform}.md` in the skill folder
2. Use one of the existing adapters as a template
3. Define: required config, date math, the four bucket pulls, the normalize step, edge cases
4. Make sure the normalized output matches the common shape (same fields as other adapters)
5. Add a setup SOP at `setup-sops/{platform}-setup.md`
6. Update the SKILL.md "Supported platforms" list
7. Push and create a Routine using the new platform

The skill is designed for this - the only platform-specific code is in the adapter files. SKILL.md, report-template.md, and the verification logic are platform-agnostic.

## Pausing for vacation or holidays

Toggle **Repeats** off on the task detail page. The Routine config is preserved; it just doesn't fire.

When you return, toggle it back on. The next scheduled run will fire at the next scheduled time (it doesn't backfill missed weeks).

## Changing platforms

If your team migrates from one platform to another (e.g., ClickUp -> Asana):

1. Set up the connector for the new platform per its setup SOP
2. Either:
   - Edit the existing Routine: change PLATFORM in the prompt, change WORKSPACE_SCOPE to new IDs, swap connectors, OR
   - Create a new Routine for the new platform and pause the old one (recommended - keeps the old run history clean)

## Cost considerations

Routines draw against your Claude plan's usage limits. A weekly report is one run per week - rounding error on any paid plan.

If you set up multiple Routines (multiple platforms, multiple scopes, multiple Slack destinations), the per-run cost stacks. Check claude.ai/settings/usage if you start running many.

## When to file an issue or extend the skill

Good signals that the skill needs work:
- The same fix is needed every Monday (e.g., manually deleting a fabricated item)
- A platform's API changed and the adapter doesn't reflect it
- A configured STYLE rule keeps getting violated
- You want to change the report's structure (more sections, fewer sections, different snapshot metrics)

The skill is meant to be edited. It's not a black box - the markdown files are the source of truth, and they're designed to be tuned over time as the team's conventions and the platforms' APIs evolve.
