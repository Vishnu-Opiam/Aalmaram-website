import { NextResponse } from "next/server";
import { ADMIN_COOKIE, checkPassword, createSessionToken } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    if (typeof password !== "string" || !checkPassword(password)) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }

    const res = NextResponse.json({ status: "ok" });
    res.cookies.set(ADMIN_COOKIE, createSessionToken(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12, // 12 hours
    });
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Login failed";
    // Surface config errors (missing env) clearly; otherwise generic.
    const isConfig = /ADMIN_PASSWORD|ADMIN_SESSION_SECRET/.test(msg);
    return NextResponse.json(
      { error: isConfig ? msg : "Login failed" },
      { status: isConfig ? 500 : 400 }
    );
  }
}

export async function DELETE() {
  const res = NextResponse.json({ status: "ok" });
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
