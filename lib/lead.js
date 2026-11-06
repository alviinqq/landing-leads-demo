// Pure helpers: validation and message formatting. No network here, so it is easy to test.

const SERVICES = {
  montaz: "Montaż klimatyzacji",
  serwis: "Serwis i czyszczenie",
  naprawa: "Naprawa / diagnostyka",
  inne: "Inne pytanie",
};

function clean(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function validateLead(body) {
  const data = body && typeof body === "object" ? body : {};

  // Honeypot: real people never see this field, bots fill it in.
  if (clean(data.website, 200)) {
    return { ok: false, spam: true, errors: {} };
  }

  const lead = {
    name: clean(data.name, 80),
    phone: clean(data.phone, 30),
    service: clean(data.service, 20),
    city: clean(data.city, 60),
    message: clean(data.message, 1000),
  };

  const errors = {};
  if (lead.name.length < 2) errors.name = "Podaj imię";

  const digits = lead.phone.replace(/\D/g, "");
  if (!/^[+\d\s()-]+$/.test(lead.phone) || digits.length < 9 || digits.length > 15) {
    errors.phone = "Podaj poprawny numer telefonu";
  }

  if (!SERVICES[lead.service]) errors.service = "Wybierz usługę";

  return { ok: Object.keys(errors).length === 0, spam: false, errors, lead };
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatTelegram(lead, receivedAt = new Date()) {
  const time = receivedAt.toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" });
  const lines = [
    "🆕 <b>Nowe zgłoszenie ze strony</b>",
    "",
    `👤 ${escapeHtml(lead.name)}`,
    `📞 ${escapeHtml(lead.phone)}`,
    `🛠 ${SERVICES[lead.service]}`,
  ];
  if (lead.city) lines.push(`📍 ${escapeHtml(lead.city)}`);
  if (lead.message) lines.push("", `💬 ${escapeHtml(lead.message)}`);
  lines.push("", `🕒 ${time}`);
  return lines.join("\n");
}

function sheetRow(lead, receivedAt = new Date()) {
  return {
    date: receivedAt.toISOString(),
    name: lead.name,
    phone: lead.phone,
    service: SERVICES[lead.service],
    city: lead.city,
    message: lead.message,
  };
}

module.exports = { SERVICES, validateLead, formatTelegram, sheetRow, escapeHtml };
