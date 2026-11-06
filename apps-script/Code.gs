// Google Apps Script: paste into Extensions -> Apps Script of your sheet,
// set SECRET below, then Deploy -> New deployment -> Web app (access: Anyone).
// Copy the web app URL into GOOGLE_SHEETS_WEBHOOK on Vercel.

const SECRET = "change-me";

function doPost(e) {
  const data = JSON.parse(e.postData.contents || "{}");
  if (SECRET && data.secret !== SECRET) {
    return ContentService.createTextOutput("forbidden");
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Data", "Imię", "Telefon", "Usługa", "Miasto", "Wiadomość"]);
  }
  sheet.appendRow([
    new Date(data.date || Date.now()),
    data.name || "",
    // Leading apostrophe keeps "+48..." as text instead of a formula/number.
    "'" + (data.phone || ""),
    data.service || "",
    data.city || "",
    data.message || "",
  ]);

  return ContentService.createTextOutput("ok");
}
