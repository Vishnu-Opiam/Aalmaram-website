import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next 16 renamed Middleware to Proxy. Two jobs here, and only two:
 *
 *  1. refresh the Supabase auth cookies so a signed-in admin does not get
 *     logged out mid-session;
 *  2. an *optimistic* redirect to /admin/login when there is no session at all.
 *
 * The real authorisation — is this email actually an admin — happens in
 * `requireAdmin()` on the page and in every route handler. The Next docs are
 * explicit that proxy is not a session or authorisation solution, and a cookie
 * being present proves nothing about who owns it.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Not configured yet (fresh clone, no .env.local) — let the page render and
  // show its own error rather than redirect-looping.
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Responses that set auth cookies must never be cached, or one
        // admin's token could be served to somebody else.
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // getClaims() checks the token's signature locally against the cached
  // signing keys (and refreshes an expired session), so this runs on every
  // admin click and prefetch without a round trip to Supabase Auth.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;

  const { pathname } = request.nextUrl;

  // Accepting an invite is how someone without a session gets one.
  const isPublicAdminPage = pathname === "/admin/login" || pathname === "/admin/accept-invite";

  if (!user && pathname.startsWith("/admin") && !isPublicAdminPage) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/admin/login") {
    const adminUrl = request.nextUrl.clone();
    adminUrl.pathname = "/admin";
    adminUrl.search = "";
    return NextResponse.redirect(adminUrl);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
