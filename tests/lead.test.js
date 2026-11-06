const test = require("node:test");
const assert = require("node:assert/strict");
const { validateLead, formatTelegram, sheetRow } = require("../lib/lead");
const { createHandler } = require("../api/lead");

const good = { name: "Anna", phone: "+48 600 123 456", service: "montaz", city: "Poznań", message: "Mieszkanie 50 m2" };

function fakeRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader(k, v) { this.headers[k] = v; },
  };
}

function okFetch(calls) {
  return async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return { ok: true, status: 200 }; };
}

test("valid lead passes", () => {
  const r = validateLead(good);
  assert.equal(r.ok, true);
  assert.equal(r.lead.name, "Anna");
});

test("missing name, bad phone and unknown service are reported", () => {
  const r = validateLead({ name: "A", phone: "123", service: "xxx" });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ["name", "phone", "service"]);
});

test("phone with letters is rejected", () => {
  assert.equal(validateLead({ ...good, phone: "600abc123456" }).ok, false);
});

test("honeypot marks spam", () => {
  assert.equal(validateLead({ ...good, website: "http://spam" }).spam, true);
});

test("long and multiline input is trimmed", () => {
  const r = validateLead({ ...good, name: "  Jan\n\nKowalski  ", message: "x".repeat(5000) });
  assert.equal(r.lead.name, "Jan Kowalski");
  assert.equal(r.lead.message.length, 1000);
});

test("telegram message escapes HTML", () => {
  const r = validateLead({ ...good, name: "<b>hack</b>" });
  const text = formatTelegram(r.lead, new Date("2026-11-06T10:00:00Z"));
  assert.ok(text.includes("&lt;b&gt;hack&lt;/b&gt;"));
  assert.ok(text.includes("Montaż klimatyzacji"));
});

test("sheet row uses readable service name", () => {
  const row = sheetRow(validateLead(good).lead, new Date("2026-11-06T10:00:00Z"));
  assert.equal(row.service, "Montaż klimatyzacji");
  assert.equal(row.date, "2026-11-06T10:00:00.000Z");
});

test("GET is not allowed", async () => {
  const res = fakeRes();
  await createHandler({ env: {} })({ method: "GET" }, res);
  assert.equal(res.statusCode, 405);
});

test("invalid lead returns 400 with errors", async () => {
  const res = fakeRes();
  await createHandler({ env: {} })({ method: "POST", body: { name: "" } }, res);
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.errors.name);
});

test("demo mode works without any config", async () => {
  const res = fakeRes();
  const orig = console.log; console.log = () => {};
  await createHandler({ env: {} })({ method: "POST", body: good }, res);
  console.log = orig;
  assert.deepEqual(res.body, { ok: true, demo: true });
});

test("sends to telegram and sheets when configured", async () => {
  const calls = [];
  const env = { TELEGRAM_BOT_TOKEN: "T", TELEGRAM_CHAT_ID: "1", GOOGLE_SHEETS_WEBHOOK: "https://sheet", GOOGLE_SHEETS_SECRET: "s" };
  const res = fakeRes();
  await createHandler({ env, fetchImpl: okFetch(calls) })({ method: "POST", body: JSON.stringify(good) }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.includes("botT/sendMessage"));
  assert.equal(calls[1].body.secret, "s");
});

test("one failing channel still returns ok", async () => {
  const env = { TELEGRAM_BOT_TOKEN: "T", TELEGRAM_CHAT_ID: "1", GOOGLE_SHEETS_WEBHOOK: "https://sheet" };
  const fetchImpl = async (url) => ({ ok: !url.includes("telegram"), status: url.includes("telegram") ? 500 : 200 });
  const res = fakeRes();
  const orig = console.error; console.error = () => {};
  await createHandler({ env, fetchImpl })({ method: "POST", body: good }, res);
  console.error = orig;
  assert.equal(res.statusCode, 200);
});

test("all channels failing returns 502", async () => {
  const env = { TELEGRAM_BOT_TOKEN: "T", TELEGRAM_CHAT_ID: "1" };
  const res = fakeRes();
  const orig = console.error; console.error = () => {};
  await createHandler({ env, fetchImpl: async () => ({ ok: false, status: 500 }) })({ method: "POST", body: good }, res);
  console.error = orig;
  assert.equal(res.statusCode, 502);
});

test("spam gets fake success and nothing is sent", async () => {
  const calls = [];
  const env = { TELEGRAM_BOT_TOKEN: "T", TELEGRAM_CHAT_ID: "1" };
  const res = fakeRes();
  await createHandler({ env, fetchImpl: okFetch(calls) })({ method: "POST", body: { ...good, website: "x" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 0);
});
