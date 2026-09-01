/*
 * 署名付き entitlement token の発行(goodcoiner-app #18 / #100)。
 *
 * 目的は「ローカルのファイルを書き換えて課金状態を偽装する」のを防ぐこと。
 * アプリには公開鍵だけを埋め込み、オフラインでも署名を検証できるようにする。
 *
 * 仕様: tradeCoinSystem/docs/SIGNED_ENTITLEMENT_TOKEN_SPEC.md
 *
 * HMAC(共通鍵)は使わない。アプリ内に共通鍵を置くと抽出されるため、必ず非対称署名にする。
 * Workers の標準 Web Crypto だけで作れるので外部ライブラリは要らない。
 */

/** アプリ側の検証値と完全一致が必要。**変えてはいけない**(仕様書の警告) */
const ISSUER = "https://goodcoiner.com";
const AUDIENCE = "goodcoiner-app";

/*
 * オフライン猶予期間。
 * ⚠️ サブスクの期間終了日にしないこと。年額で1年のトークンを出すと、
 * 解約・返金・流出のあとも最大1年オフラインで使い続けられてしまう。
 * 短期にしておき、解約時は「再発行しない」ことで最長でもこの期間内に失効させる。
 */
const TOKEN_TTL_SECONDS = 14 * 24 * 60 * 60;

/** トークンを発行してよい状態。free / expired には発行しない(= 再発行拒否で失効させる) */
const ISSUABLE = new Set(["monthly", "yearly", "owner", "early_access"]);

export type IssuableClaims = {
  /** アプリはこれを entitlementKey として保持する */
  entitlementKey: string;
  plan: string;
  /** 表示用。ゲート判定には使わせない */
  currentPeriodEnd: string | null | undefined;
};

function base64url(data: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * 署名付き entitlement token を作る。
 * 秘密鍵が未設定なら null を返す — 導入途中でも既存のレスポンスを壊さないため。
 */
export async function issueEntitlementToken(
  env: { ENTITLEMENT_PRIVATE_JWK?: string },
  claims: IssuableClaims,
): Promise<string | null> {
  if (!ISSUABLE.has(claims.plan)) return null;

  const raw = env.ENTITLEMENT_PRIVATE_JWK;
  if (!raw) return null;

  try {
    const jwk = JSON.parse(raw) as JsonWebKey & { kid?: string };
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "ES256", typ: "JWT", kid: jwk.kid };
    const payload = {
      sub: claims.entitlementKey,
      plan: claims.plan,
      currentPeriodEnd: claims.currentPeriodEnd,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
      iss: ISSUER,
      aud: AUDIENCE,
    };

    const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      new TextEncoder().encode(input),
    );
    return `${input}.${base64url(signature)}`;
  } catch {
    // 鍵が壊れている等。既存のレスポンスは返せるよう、ここでは落とさない。
    return null;
  }
}

/**
 * entitlement のレスポンスに署名トークンを足す。
 * 発行できないとき(free / expired / 鍵未設定)はフィールドごと付けない。
 */
export async function withEntitlementToken<
  T extends {
    billingStatus: string;
    entitlementKey: string;
    currentPeriodEnd: string | null | undefined;
  },
>(env: { ENTITLEMENT_PRIVATE_JWK?: string }, body: T): Promise<T & { entitlementToken?: string }> {
  const token = await issueEntitlementToken(env, {
    entitlementKey: body.entitlementKey,
    plan: body.billingStatus,
    currentPeriodEnd: body.currentPeriodEnd,
  });
  return token ? { ...body, entitlementToken: token } : body;
}
