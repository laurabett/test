# weekly-ops-report

A distributable Claude Code skill that generates a weekly one-page operational report from your project management platform (ClickUp, Asana, Monday.com, or Notion) and delivers it to Slack every Monday morning, automatically.

Runs on Anthropic's cloud infrastructure via Claude Code Routines. No server. No cron job. No laptop staying awake.

## What you get

Every Monday at 7 AM (or whenever you schedule it), a Slack DM that looks like this:

```
*Weekly ops report - week of Mon Apr 13 to Sun Apr 19*

*Snapshot*
• Completed: 12
• In progress: 18
• Blocked: 4
• Due next 7 days: 9

*Completed this week*
• Acme MSA signed and countersigned (Sales > Contracts) - Priya
• Q2 marketing site redesign shipped (Marketing > Web) - Sam
...

*In progress*
...

*Blocked / at risk*
...

*Upcoming this week*
...
```

Pulled from your task data, written in clear, professional language, verified against the source so nothing is fabricated. The tone and style are configurable, with a neutral default that suits any team. See `examples/sample-report.md` for a full example.

## Supported platforms

| Platform | Adapter | Setup SOP | Time to setup |
|----------|---------|-----------|---------------|
| ClickUp | `adapters/clickup.md` | `setup-sops/clickup-setup.md` | ~10 min |
| Asana | `adapters/asana.md` | `setup-sops/asana-setup.md` | ~15 min |
| Monday.com | `adapters/monday.md` | `setup-sops/monday-setup.md` | ~20 min |
| Notion | `adapters/notion.md` | `setup-sops/notion-setup.md` | ~20-30 min |
| Trello | `adapters/trello.md` | `setup-sops/trello-setup.md` | ~20 min |

Pick the one that matches your platform. The skill is the same for everyone - the adapter handles the platform-specific details.

> **Note on Trello:** Trello has no official MCP connector, so its adapter calls the Trello REST API directly (API key + read-only token, supplied as environment variables on the Routine). It works the same as the others end to end; it's just authenticated differently. See `setup-sops/trello-setup.md`.

## Quickstart

1. **Pick your platform** and open the matching setup SOP in `setup-sops/`
2. **Follow the SOP end to end** - it covers connecting the platform connector, finding your scope, connecting Slack, pushing the skill to your repo, creating the Routine, and testing
3. **Click "Run now"** on the Routine to test before Monday
4. **Wait for Monday** - the report arrives in Slack on its own

## Requirements

- Claude.ai paid plan (Pro, Max, Team, or Enterprise) - Routines aren't on the free tier
- A GitHub repo where you can push the skill (private is fine)
- The MCP connector for your platform of choice (free in the Anthropic connector directory)
- The Slack MCP connector

## How it works

```
Monday 7 AM (your timezone)
        │
        ▼
┌────────────────────────────┐
│ Claude Code Routine         │ (configured once at claude.ai/code/scheduled)
└─────────────┬──────────────┘
              │ clones your skill repo
              ▼
┌────────────────────────────┐
│ Cloud session                │
│   reads SKILL.md             │
│   loads adapters/{platform}  │
│   ├─ Phase 1: Platform MCP   │ ─→ all task data
│   ├─ Phase 2: Synthesize     │
│   ├─ Phase 3: Verify         │
│   └─ Phase 4: Slack MCP      │ ─→ DM or channel message
└────────────────────────────┘
```

The skill itself is platform-agnostic. The adapter file handles the platform-specific pull. Every adapter returns data in the same normalized shape, so the synthesis and verification logic is shared across all four platforms.

## Files in this skill

```
weekly-ops-report/
├── SKILL.md                           - Main dispatcher (read this first if you want to understand the skill)
├── README.md                          - This file
├── ROUTINE_PROMPT_TEMPLATE.txt        - Paste-into-Routine-form prompt
├── report-template.md                 - The locked one-page report format
├── adapters/
│   ├── clickup.md                     - ClickUp pull queries
│   ├── asana.md                       - Asana pull queries
│   ├── monday.md                      - Monday.com pull queries
│   ├── notion.md                      - Notion pull queries
│   └── trello.md                      - Trello pull queries (REST API via curl)
├── setup-sops/
│   ├── clickup-setup.md               - ClickUp first-time setup
│   ├── asana-setup.md                 - Asana first-time setup
│   ├── monday-setup.md                - Monday.com first-time setup
│   ├── notion-setup.md                - Notion first-time setup
│   ├── trello-setup.md                - Trello first-time setup
│   └── operating-runbook.md           - Day-to-day operations (debug, monitor, extend)
└── examples/
    └── sample-report.md               - Example output
```

## Operating it

After install, see `setup-sops/operating-runbook.md` for:
- How to monitor runs and read the audit trail
- How to debug a failed run
- How to change the report format
- How to add a new platform scope (more workspaces, projects, boards)
- How to onboard another user
- How to extend the skill to a platform not currently supported

## Customizing

The skill is meant to be edited. Markdown files are the source of truth.

- **Want different report sections?** Edit `report-template.md`.
- **Want a different tone?** Set `TONE` in the Routine prompt (`neutral`, `concise`, `detailed`, or `custom` with your own `TONE_NOTES`). No file edits needed.
- **Want hard word-choice or formatting rules?** Set `STYLE` in the Routine prompt (e.g., `no em dashes; avoid: leverage, synergy`). Phase 3 enforces them.
- **Want to change the default voice for everyone on this install?** Edit the voice section in `report-template.md`.
- **Want different bucket logic?** Edit your platform's adapter file.
- **Want to add a status pattern your team uses?** Edit the adapter regex.

Push the changes to your repo's default branch. The next Routine run picks them up automatically (Routines clone fresh each run).

## Costs and limits

- Each weekly run is one Claude Code session. On a paid plan this is rounding-error usage.
- Minimum schedule interval is 1 hour (Routines limit). Weekly is no problem.
- Routines have a daily run cap per account. One per week, no issue. If you set up many Routines across many platforms, watch claude.ai/settings/usage.

## Distribution

This skill is built to be shared. Anyone with a paid Claude plan can:

1. Fork or copy the skill into their own repo
2. Pick their platform and follow the matching setup SOP
3. Be running their own weekly report within 30 minutes

No central service to maintain, no shared infrastructure, no per-user cost beyond the user's own Claude subscription. Each install is fully self-contained.

## License

Use it. Modify it. Share it. No warranty - verify the output before relying on it for anything important. The audit trail at claude.ai/code/scheduled is your friend for debugging.
