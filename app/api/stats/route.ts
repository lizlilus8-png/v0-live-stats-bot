import { NextResponse } from "next/server";

const LOGGED_SESSION = process.env.LOGGED_TG_SESSION_COOKIE!;
const SESSION_URL    = "https://logged.tg/api/session";
const API_BASE       = "https://api.injuries.to";
const SECRET         = process.env.STATS_API_SECRET;

async function getAuth() {
  const res = await fetch(SESSION_URL, {
    headers: {
      Cookie:       LOGGED_SESSION,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      Referer:      "https://logged.tg/dashboard",
    },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Session fetch failed: ${res.status}`);

  const data     = await res.json();
  const authObj  = data?.Auth ?? data?.userSettings?.Auth ?? null;

  if (!authObj) throw new Error("Auth tokens not found — session cookie may be expired.");

  const id    = Array.isArray(authObj) ? authObj[0] : (authObj.Id    ?? authObj.id);
  const token = Array.isArray(authObj) ? authObj[1] : (authObj.Token ?? authObj.token);

  if (!id || !token) throw new Error("Auth.Id or Auth.Token missing in session.");

  return { id: String(id), token: String(token), user: data?.userSettings ?? data?.user ?? {}, raw: data };
}

async function apiGet(path: string, session: { id: string; token: string }) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "x-id":         session.id,
      "x-token":      session.token,
      "content-type": "application/json; charset=utf-8",
      "User-Agent":   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      Origin:         "https://logged.tg",
      Referer:        "https://logged.tg/dashboard",
    },
    cache: "no-store",
  });

  const text = await res.text();
  let json: Record<string, unknown>;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!res.ok) throw new Error(`API ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);

  return json;
}

export async function GET(request: Request) {
  // Validate secret if configured
  if (SECRET) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const session = await getAuth();
    const data    = await apiGet("/api/auth", session);

    const mainData     = (data?.omniData as Record<string, unknown>)?.Main as Record<string, unknown>
                         ?? (data?.Main as Record<string, unknown>)
                         ?? data;
    const mainDataInner= (mainData?.Data as Record<string, unknown>) ?? mainData;
    const profile      = ((data?.omniData as Record<string, unknown>)?.Profile as Record<string, unknown>)?.Header
                          ?? {} as Record<string, unknown>;
    const totals       = (mainDataInner?.Totals       as Record<string, number>)  ?? {};
    const collectibles = (mainDataInner?.Collectibles as Record<string, unknown>) ?? {};
    const billing      = (mainDataInner?.Billing      as Record<string, unknown>) ?? {};
    const groups       = (mainDataInner?.Groups       as Record<string, unknown>) ?? {};
    const cookies      = (mainDataInner?.Cookies      as Record<string, unknown>) ?? {};

    const userSettings = data?.userSettings as Record<string, unknown> ?? {};

    const stats = {
      userName:     String(userSettings?.userName    ?? (profile as Record<string,unknown>)?.Username  ?? session.user?.userName ?? "Unknown"),
      displayName:  String(userSettings?.displayName ?? (profile as Record<string,unknown>)?.DisplayName ?? userSettings?.userName ?? "Unknown"),
      isPremium:    Boolean(userSettings?.IsPremium  ?? (profile as Record<string,unknown>)?.IsPremium ?? false),
      avatar:       String(data?.userAvatar ?? ""),
      visits:       Number(totals?.Visits   ?? 0),
      accounts:     Number(totals?.Accounts ?? 0),
      summary:      Number(totals?.Summary  ?? 0),
      rap:          Number(totals?.Rap      ?? 0),
      balance:      Number(totals?.Balance  ?? 0),
      rapItems:     Number((collectibles?.Limiteds as Record<string,unknown>)?.Rap ?? 0),
      hasKorblox:   Boolean((collectibles as Record<string,unknown>)?.Korblox  ?? false),
      hasHeadless:  Boolean((collectibles as Record<string,unknown>)?.Headless ?? false),
      subActive:    Boolean((billing?.Subscription as Record<string,unknown>)?.Has     ?? false),
      subExpires:   String((billing?.Subscription  as Record<string,unknown>)?.Expires ?? ""),
      billingTotal: Number(billing?.Total                         ?? 0),
      credit:       Number((billing?.Credit as Record<string,unknown>)?.Balance ?? 0),
      groupsOwned:  Array.isArray(groups?.Owned) ? (groups.Owned as unknown[]).length : Number(groups?.Owned ?? 0),
      groupBalance: Number(groups?.Balance ?? 0),
      groupPending: Number(groups?.Pending ?? 0),
      cookieStatus: (cookies as Record<string,unknown>)?.Security ? "Valid" : "None",
    };

    return NextResponse.json({ ok: true, stats });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
