// Daily outstanding-work report: Trello -> Slack
//
// Pulls all OPEN cards from the configured Trello boards, groups them by
// board and list (excluding "done"-named lists), flags due dates, and posts
// the report to Slack as a DM. Runs on GitHub Actions (full internet access),
// so it sidesteps the cloud-sandbox network restrictions.
//
// Requires Node 20+ (uses global fetch). No npm dependencies.
//
// Environment variables (set as GitHub Actions secrets / vars):
//   TRELLO_KEY        - Trello API key
//   TRELLO_TOKEN      - Trello read-only token
//   SLACK_BOT_TOKEN   - Slack bot token (xoxb-...), scope: chat:write
//   SLACK_CHANNEL     - Slack channel ID to post to (default: #opps-report).
//                       The bot must be a member of this channel.
//   TRELLO_BOARDS     - comma-separated board IDs (default: the two configured)
//   TIMEZONE          - IANA tz for "today" + due flags (default America/New_York)

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = process.env.SLACK_CHANNEL || "C0BB1T50196"; // #opps-report
const BOARDS = (process.env.TRELLO_BOARDS ||
  "69dc17d2508a8dd209d02b69,6a133bb7d1660fa6f40aff27,5ebf60e57aa7682d656d12b4")
  .split(",").map((s) => s.trim()).filter(Boolean);
const TZ = process.env.TIMEZONE || "America/New_York";

const DONE_RE = /done|complete|completed|closed|shipped|launched|live/i;

const DRY_RUN = !!process.env.DRY_RUN; // print report instead of posting to Slack

function requireEnv() {
  const missing = [];
  if (!TRELLO_KEY) missing.push("TRELLO_KEY");
  if (!TRELLO_TOKEN) missing.push("TRELLO_TOKEN");
  if (!DRY_RUN && !SLACK_BOT_TOKEN) missing.push("SLACK_BOT_TOKEN");
  if (missing.length) throw new Error(`Missing required secrets: ${missing.join(", ")}`);
}

async function trello(path, params = {}) {
  const url = new URL(`https://api.trello.com/1/${path}`);
  url.searchParams.set("key", TRELLO_KEY);
  url.searchParams.set("token", TRELLO_TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Trello ${path} -> HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

// --- date helpers (in the configured timezone) ---
function ymdInTz(date) {
  // en-CA gives YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}
function shortInTz(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, weekday: "short", month: "short", day: "numeric",
  }).format(date);
}
function monDayInTz(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, month: "short", day: "numeric",
  }).format(date);
}
function dayDiff(ymdA, ymdB) {
  const [ay, am, ad] = ymdA.split("-").map(Number);
  const [by, bm, bd] = ymdB.split("-").map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000);
}

function dueInfo(due, todayYmd) {
  if (!due) return { flag: "no due date", rank: Number.POSITIVE_INFINITY, bucket: "none" };
  const d = new Date(due);
  const diff = dayDiff(ymdInTz(d), todayYmd);
  if (diff < 0) return { flag: `⚠️ overdue (${monDayInTz(d)})`, rank: diff, bucket: "overdue" };
  if (diff === 0) return { flag: "due today", rank: 0, bucket: "today" };
  if (diff <= 3) return { flag: `due ${monDayInTz(d)}`, rank: diff, bucket: "soon" };
  return { flag: `due ${monDayInTz(d)}`, rank: diff, bucket: "future" };
}

async function buildReport() {
  const now = new Date();
  const todayYmd = ymdInTz(now);
  const counts = { total: 0, overdue: 0, today: 0, soon: 0, none: 0 };
  const sections = [];

  for (const boardId of BOARDS) {
    const [board, lists, members, cards] = await Promise.all([
      trello(`boards/${boardId}`, { fields: "name" }),
      trello(`boards/${boardId}/lists`, { filter: "open", fields: "name" }),
      trello(`boards/${boardId}/members`, { fields: "fullName" }),
      trello(`boards/${boardId}/cards`, {
        filter: "open",
        fields: "id,name,idList,due,idMembers,shortUrl",
      }),
    ]);

    const listName = Object.fromEntries(lists.map((l) => [l.id, l.name]));
    const listOrder = lists.map((l) => l.id);
    const memberName = Object.fromEntries(members.map((m) => [m.id, m.fullName]));

    const byList = new Map();
    for (const card of cards) {
      const lname = listName[card.idList] || "(unknown list)";
      if (DONE_RE.test(lname)) continue; // skip done-named lists
      const who = card.idMembers && card.idMembers.length
        ? (memberName[card.idMembers[0]] || "unassigned")
        : "unassigned";
      const di = dueInfo(card.due, todayYmd);
      counts.total++;
      if (di.bucket === "overdue") counts.overdue++;
      else if (di.bucket === "today") counts.today++;
      else if (di.bucket === "soon") counts.soon++;
      else if (di.bucket === "none") counts.none++;
      const name = String(card.name || "").trim();
      if (!byList.has(card.idList)) byList.set(card.idList, []);
      byList.get(card.idList).push({ name, who, di });
    }

    const lines = [`*${board.name}*`];
    let boardHasCards = false;
    for (const lid of listOrder) {
      const items = byList.get(lid);
      if (!items || !items.length) continue;
      boardHasCards = true;
      items.sort((a, b) => a.di.rank - b.di.rank);
      lines.push(`_${listName[lid]} (${items.length})_`);
      for (const it of items) lines.push(`• ${it.name} — ${it.who} — ${it.di.flag}`);
    }
    if (boardHasCards) sections.push(lines.join("\n"));
  }

  const header = `*Outstanding work — ${shortInTz(now)}*`;
  const snapshot =
    `*Open items: ${counts.total}* — Overdue: ${counts.overdue} · ` +
    `Due today: ${counts.today} · Due ≤3 days: ${counts.soon} · No due date: ${counts.none}`;
  const body = counts.total === 0
    ? "No open items on the tracked boards. 🎉"
    : sections.join("\n\n");
  return [header, snapshot, body].join("\n\n");
}

async function slack(method, payload) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack ${method} failed: ${data.error}`);
  return data;
}

async function postToSlack(text) {
  // Post to the configured channel. The bot must be a member of it (chat:write).
  await slack("chat.postMessage", { channel: SLACK_CHANNEL, text, mrkdwn: true, unfurl_links: false });
}

async function main() {
  requireEnv();
  const report = await buildReport();
  if (DRY_RUN) {
    console.log("----- DRY RUN (not sent to Slack) -----\n");
    console.log(report);
    return;
  }
  await postToSlack(report);
  console.log("Report delivered to Slack.");
}

main().catch(async (err) => {
  console.error("FAILED:", err.message);
  // Best-effort failure notice (only if Slack creds exist)
  if (SLACK_BOT_TOKEN) {
    try {
      await postToSlack(`Daily outstanding report failed: ${err.message}`);
    } catch (e) {
      console.error("Could not send failure notice:", e.message);
    }
  }
  process.exit(1);
});
