import { NextResponse } from "next/server";

/**
 * POST /api/order
 * Accepts multipart form-data for a UPI manual-payment order.
 *
 * Forwards to a Google Apps Script web app which:
 *  - saves the screenshot to a Drive folder
 *  - appends a row to a Google Sheet with the order + image link
 *
 * ──────────── Apps Script setup ────────────
 * 1. New Google Sheet. Row 1 headers (recommended):
 *      Timestamp | Order ID | Name | Phone | Email | Address | City | Pincode | Items | Subtotal | Screenshot
 * 2. New Drive folder for screenshots; copy its ID from the URL.
 * 3. Extensions → Apps Script → paste the code below → set FOLDER_ID.
 * 4. Deploy → New deployment → Web app:
 *      Execute as: Me
 *      Who has access: Anyone
 *    Copy the /exec URL into .env.local as GOOGLE_SHEET_ORDER_WEBHOOK_URL, then restart `npm run dev`.
 *
 * const FOLDER_ID = 'PUT_DRIVE_FOLDER_ID_HERE';
 *
 * function doPost(e) {
 *   const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
 *   const p = e.parameter;
 *   const buyer = JSON.parse(p.buyer || '{}');
 *   const items = JSON.parse(p.items || '[]');
 *   let fileUrl = '';
 *   if (p.screenshotBase64) {
 *     const blob = Utilities.newBlob(
 *       Utilities.base64Decode(p.screenshotBase64),
 *       p.screenshotMime || 'image/jpeg',
 *       (p.orderId || 'order') + '_' + (p.screenshotName || 'proof.jpg')
 *     );
 *     const file = DriveApp.getFolderById(FOLDER_ID).createFile(blob);
 *     // Make it viewable by anyone with the link so you can click from the sheet
 *     file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
 *     fileUrl = file.getUrl();
 *   }
 *   sheet.appendRow([
 *     new Date(),
 *     p.orderId,
 *     buyer.name, buyer.phone, buyer.email,
 *     buyer.address, buyer.city, buyer.pincode,
 *     items.map(function(i){ return i.title + ' x' + i.qty; }).join('; '),
 *     p.subtotal,
 *     fileUrl,
 *   ]);
 *   return ContentService
 *     .createTextOutput(JSON.stringify({ status: 'ok', fileUrl: fileUrl }))
 *     .setMimeType(ContentService.MimeType.JSON);
 * }
 * ────────────────────────────────────────────
 */

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const orderId = String(form.get("orderId") || "");
    const buyer = String(form.get("buyer") || "{}");
    const items = String(form.get("items") || "[]");
    const subtotal = String(form.get("subtotal") || "");
    const screenshot = form.get("screenshot") as File | null;

    if (!orderId || !screenshot) {
      return NextResponse.json({ error: "Missing orderId or screenshot" }, { status: 400 });
    }

    const buf = Buffer.from(await screenshot.arrayBuffer());
    const screenshotBase64 = buf.toString("base64");

    const webhookUrl = process.env.GOOGLE_SHEET_ORDER_WEBHOOK_URL;

    if (!webhookUrl) {
      console.log("📦 ORDER (no webhook configured):", {
        orderId,
        buyer: JSON.parse(buyer),
        items: JSON.parse(items),
        subtotal,
        screenshotBytes: buf.length,
      });
      return NextResponse.json({ status: "ok", note: "Logged locally" });
    }

    // Apps Script web apps accept form-urlencoded params; send as x-www-form-urlencoded
    // so the screenshot bytes ride as base64.
    const body = new URLSearchParams({
      orderId,
      buyer,
      items,
      subtotal,
      screenshotBase64,
      screenshotMime: screenshot.type || "image/jpeg",
      screenshotName: screenshot.name || "proof.jpg",
    });

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      redirect: "follow",
    });

    if (!res.ok) throw new Error(`Apps Script returned ${res.status}`);

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("Order error:", err);
    return NextResponse.json({ error: "Failed to save order" }, { status: 500 });
  }
}
