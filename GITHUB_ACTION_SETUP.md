# Daily Trello → Slack report (GitHub Actions)

This repo runs a scheduled GitHub Action that posts a daily "what's still not
done" report to Slack every weekday morning. It pulls all open cards from your
Trello boards, groups them by board and list (skipping "done"-type lists), flags
due dates, and DMs you the result.

Why GitHub Actions instead of a Claude cloud Routine: the Claude cloud sandbox
blocks outbound calls to `api.trello.com`. GitHub's runners have full internet
access, so the Trello pull works, and GitHub stores the credentials as encrypted
secrets.

## Files

- `.github/workflows/daily-trello-report.yml` — the schedule (Mon–Fri 11:00 UTC = 7 AM ET)
- `scripts/daily-trello-report.mjs` — the report logic (Node 20, no dependencies)

## One-time setup

### 1. Create a Slack app + bot token

The Action posts via a Slack bot, so you need a bot token.

1. Go to **https://api.slack.com/apps** → **Create New App** → **From scratch**.
2. Name it (e.g. "Ops Report Bot"), pick the **YYMI** workspace, **Create App**.
3. Left sidebar → **OAuth & Permissions** → scroll to **Scopes** → **Bot Token Scopes** → add:
   - `chat:write`
4. Scroll up → **Install to Workspace** → **Allow**.
5. Copy the **Bot User OAuth Token** (starts with `xoxb-`). This is `SLACK_BOT_TOKEN`.

> The first report will arrive as a DM from this app, not from yourself. That's normal.

### 2. Add the repository secrets

In GitHub: **repo → Settings → Secrets and variables → Actions → New repository secret.**
Add these three secrets:

| Secret name | Value |
|-------------|-------|
| `TRELLO_KEY` | your Trello API key |
| `TRELLO_TOKEN` | your Trello **read-only** token |
| `SLACK_BOT_TOKEN` | the `xoxb-...` bot token from step 1 |

(Optional **Variables** — same screen, "Variables" tab — only if you want to override defaults:
`SLACK_CHANNEL` (the channel ID the bot posts to; bot must be a member), `TRELLO_BOARDS`, `TIMEZONE`.)

### 3. Test it

- **repo → Actions → "Daily Trello Outstanding Report" → Run workflow.**
- Watch the run; on success you'll get the DM within ~30 seconds.
- If something's wrong, the bot DMs you a one-line failure reason, and the
  Actions log shows the detail.

## Changing things

- **Schedule / time**: edit the `cron` in the workflow (UTC). DST note is in the file.
- **Which boards**: set a `TRELLO_BOARDS` repo *variable* (comma-separated board IDs),
  or edit the default in the workflow.
- **Report format / grouping / due flags**: edit `scripts/daily-trello-report.mjs`.
- **"Done" list detection**: edit the `DONE_RE` regex in the script.

## Notes

- GitHub Actions cron can be delayed a few minutes under load — fine for a daily report.
- The Trello token is read-only; the bot token can only post messages.
- Rotate the Trello API **Secret** you generated during setup (it was shared in chat).
