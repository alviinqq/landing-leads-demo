// Vercel serverless function: POST /api/lead
// Sends the lead to Telegram and (optionally) to a Google Sheet via Apps Script.
// Secrets live in environment variables, never in the page code.

const { validateLead, formatTelegram, sheetRow } = require("../lib/lead");

async function sendTelegram(text, env, fetchImpl) {
  const res = await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML" }),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}`);
}

async function sendSheet(row, env, fetchImpl) {
  const res = await fetchImpl(env.GOOGLE_SHEETS_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...row, secret: env.GOOGLE_SHEETS_SECRET || "" }),
  });
  if (!res.ok) throw new Error(`Sheets ${res.status}`);
}

function createHandler({ env = process.env, fetchImpl = fetch, now = () => new Date() } = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const result = validateLead(body);
    // Pretend success for bots so they don't retry.
    if (result.spam) return res.status(200).json({ ok: true });
    if (!result.ok) return res.status(400).json({ ok: false, errors: result.errors });

    const receivedAt = now();
    const tasks = [];
    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      tasks.push(sendTelegram(formatTelegram(result.lead, receivedAt), env, fetchImpl));
    }
    if (env.GOOGLE_SHEETS_WEBHOOK) {
      tasks.push(sendSheet(sheetRow(result.lead, receivedAt), env, fetchImpl));
    }

    if (tasks.length === 0) {
      // Demo mode: nothing configured, just log it.
      console.log("[demo] lead received:", result.lead);
      return res.status(200).json({ ok: true, demo: true });
    }

    const settled = await Promise.allSettled(tasks);
    const failed = settled.filter((s) => s.status === "rejected");
    failed.forEach((f) => console.error("delivery failed:", f.reason?.message));

    // If at least one channel worked, the lead is not lost.
    if (failed.length === settled.length) {
      return res.status(502).json({ ok: false, error: "Nie udało się wysłać. Zadzwoń do nas." });
    }
    return res.status(200).json({ ok: true });
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
