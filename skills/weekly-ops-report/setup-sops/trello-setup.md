# Trello setup SOP

How to wire up Trello as the data source for the weekly ops report.
Estimated time: ~20 minutes.

> **Trello is a custom (extended) platform.** It has no official MCP connector, so
> this setup uses the **Trello REST API** with an API key + token instead of a
> connector. The adapter (`adapters/trello.md`) calls the API directly with `curl`.
> Everything else - synthesis, verification, Slack delivery - is identical to the
> other platforms.

## Prerequisites

- A Claude.ai account on Pro, Max, Team, or Enterprise (Routines require a paid plan)
- A Trello account with access to the board(s) you want reported
- A Slack workspace where you can use the Claude Slack connector

## Step 1 - Get your Trello API key

1. Log in to Trello in your browser.
2. Go to **https://trello.com/power-ups/admin** and create a Power-Up (any name,
   e.g. "Weekly Ops Report"). Associate it with your workspace.
3. Open the Power-Up > **API key** tab.
4. Click **Generate a new API key**.
5. Copy the **API key**. This is your `TRELLO_KEY`.

> Trello moved key generation behind the Power-Up admin in recent years. If your
> account still shows the old `trello.com/app-key` page, you can use the key there
> instead - either works.

## Step 2 - Generate a read-only token

On the same API key page, find the **Token** link (text like "you can manually
generate a Token"). Click it. You'll see an authorization screen.

To make this a **read-only** token (recommended - the report never writes):

1. Build the authorization URL yourself so you can set the scope and expiration:

   ```
   https://trello.com/1/authorize?expiration=never&scope=read&response_type=token&key=YOUR_API_KEY&name=Weekly%20Ops%20Report
   ```

   Replace `YOUR_API_KEY` with the key from Step 1.
2. Open that URL, click **Allow**.
3. Copy the token Trello shows you. This is your `TRELLO_TOKEN`.

> **Scope:** `scope=read` grants read-only access - the report cannot modify any
> card. **Expiration:** `expiration=never` keeps the weekly run working without
> re-auth; use `30days` if you prefer to rotate. A read-only token is low-risk, but
> still treat it like a password (see Step 6).

## Step 3 - Find your board IDs

For each board you want in the report:

1. Open the board in Trello. The URL looks like
   `https://trello.com/b/AbCd1234/my-board-name`.
2. Append `.json` to the board URL and open it:
   `https://trello.com/b/AbCd1234/my-board-name.json`
3. The very first field is `"id":"5f3a9e..."` - that 24-character hex string is the
   board ID. Copy it.
4. Repeat for each board.

`WORKSPACE_SCOPE` will be these IDs comma-separated, no spaces:
`5f3a9e...,6b1c2d...`. Or use `all` to pull every open board your token can see.

## Step 4 - Test your credentials (do this before building the Routine)

Quick sanity check in any terminal (or ask Claude Code to run it):

```bash
curl -s "https://api.trello.com/1/members/me/boards?key=YOUR_KEY&token=YOUR_TOKEN&fields=name" | head
```

You should get back a JSON list of your boards' names. If you get
`invalid key` or `invalid token`, redo Steps 1-2. If you get `[]`, the token has no
board access - check you clicked Allow on the right account.

## Step 5 - Connect Slack and find your destination ID

1. **claude.ai > Settings > Connectors > Slack > Connect** (if not already).
   Authorize the workspace where the report should land. DMs-only is fine for a
   self-report.
2. Find the channel ID:
   - **Self-DM** (cleanest): open Slack, click your own name in the sidebar. The URL
     is `https://app.slack.com/client/T0XXXXXXX/D0YYYYYYY` - the `D0YYYYYYY` part is
     your DM channel ID.
   - **Channel**: right-click the channel > **Copy link** >
     `.../archives/C0ZZZZZZZ` - the `C0ZZZZZZZ` part is the channel ID.

## Step 6 - Push the skill to GitHub

The skill must live in a GitHub repo so the Routine can clone it.

```bash
# from wherever the weekly-ops-report folder is
mkdir -p /path/to/your-repo/skills
cp -r weekly-ops-report /path/to/your-repo/skills/
cd /path/to/your-repo
git add skills/weekly-ops-report
git commit -m "Add weekly-ops-report skill with Trello adapter"
git push origin main
```

**Do not put your Trello key or token in the repo.** They go on the Routine as
environment variables (next step), never in source control.

## Step 7 - Create the Routine

1. Go to **claude.ai/code/scheduled** > **New scheduled task**.
2. Fill in:
   - **Name**: `Weekly Ops Report - Trello`
   - **Prompt**: open `ROUTINE_PROMPT_TEMPLATE.txt`, use the **Trello block** at the
     bottom of that file, fill in your `WORKSPACE_SCOPE` and Slack channel ID, and
     paste the whole thing in.
   - **Repositories**: add the GitHub repo you pushed to.
   - **Environment variables / Secrets**: add
     - `TRELLO_KEY` = your API key
     - `TRELLO_TOKEN` = your read-only token
   - **Schedule**: Weekly, Monday, 7:00 AM, your local timezone.
   - **Connectors**: enable **Slack** only. (There is no Trello connector - the
     adapter uses the API key/token from the environment variables above.)
3. Click **Create**.

> **On secrets:** supply the key and token through the Routine's environment
> variable / secrets fields if your plan exposes them - that keeps them out of the
> prompt text. If your Routine UI does **not** offer an env-var/secrets field, the
> fallback is to put them in the prompt itself (add two lines:
> `TRELLO_KEY: ...` and `TRELLO_TOKEN: ...`). This works but stores the token in the
> task config in plaintext, so use a **read-only, rotatable** token if you go that
> route, and rotate it if the config is ever shared. Confirm which option your
> account has before deciding.

## Step 8 - Test before Monday

On the task detail page, click **Run now**. Watch the session at
`claude.ai/code/scheduled > Weekly Ops Report - Trello > [latest run]`. You should
see Claude:

1. Read SKILL.md and `adapters/trello.md`
2. Make Trello API `curl` calls (board list, lists, members, cards, actions)
3. Synthesize the one-page report
4. Run the Phase 3 verification checks
5. Send the Slack message

Then check Slack - the message should arrive within 1-2 minutes.

## Common issues

**`invalid token` or 401 in the session**
The token expired or was generated against the wrong account. Regenerate it
(Step 2), update the `TRELLO_TOKEN` env var on the Routine, and re-run.

**"No completed tasks this week" but you know cards were finished**
Trello detects completion from card movement and due-complete toggles, not a
completion date. If your team finishes work without moving the card to a Done-named
list or checking the due-complete box, the signal won't fire. Either adopt a "Done"
list / due-complete habit, or add your team's convention to the patterns in
`adapters/trello.md` Steps 1 and 3 and push.

**A board is missing from the report**
The token can't see it, or the board ID is wrong. Re-check the ID via the `.json`
trick (Step 3) and confirm the token's account is a member of that board.

**Slack message never arrives**
Confirm the channel ID format (D-prefix for DMs, C-prefix for channels) and that
the Slack connector is enabled on this Routine. The session's `slack_send_message`
call shows the exact error.

**Rate limited (429)**
Only happens with very large scopes. The adapter stays well under limits for normal
use; if you're pulling dozens of boards, split into two Routines.

## Maintenance

- **Token rotation**: if you used `expiration=30days`, regenerate and update the env
  var monthly. `expiration=never` avoids this but means a longer-lived credential.
- **Workflow drift**: if your team adds new list names for done/blocked states, add
  them to the regexes in `adapters/trello.md` and push - the next run picks it up.
- **Pause for vacation**: toggle **Repeats** off on the task detail page; toggle it
  back on when you return.
