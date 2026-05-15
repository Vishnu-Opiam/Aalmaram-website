import { NextResponse } from "next/server";

/**
 * POST /api/preorder
 * Saves a pre-order (name + email) to a Google Sheet via a Google Apps Script web app.
 *
 * Setup instructions:
 * 1. Create a new Google Sheet
 * 2. Go to Extensions → Apps Script
 * 3. Paste the doPost handler (see SETUP.md or comments below)
 * 4. Deploy as Web App (execute as: Me, access: Anyone)
 * 5. Copy the deployment URL into .env.local as GOOGLE_SHEET_WEBHOOK_URL
 *
 * Google Apps Script code to paste:
 * ─────────────────────────────────
 * function doPost(e) {
 *   var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
 *   var data = JSON.parse(e.postData.contents);
 *   sheet.appendRow([new Date(), data.name, data.email]);
 *   return ContentService.createTextOutput(
 *     JSON.stringify({ status: "ok" })
 *   ).setMimeType(ContentService.MimeType.JSON);
 * }
 * ─────────────────────────────────
 */

export async function POST(request: Request) {
  try {
    const { name, email } = await request.json();

    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;

    if (!webhookUrl) {
      // Fallback: log to server console if webhook not configured
      console.log("📋 PRE-ORDER:", { name, email, timestamp: new Date().toISOString() });
      return NextResponse.json({ status: "ok", note: "Logged locally (webhook not configured)" });
    }

    // Send to Google Apps Script web app
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });

    if (!res.ok) {
      throw new Error(`Google Sheet webhook returned ${res.status}`);
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("Pre-order error:", err);
    return NextResponse.json(
      { error: "Failed to save pre-order" },
      { status: 500 }
    );
  }
}
