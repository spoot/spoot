import { sealData, unsealData } from "iron-session";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@spoot/log";
import { getCurrentUrl, isProdUrl } from "@spoot/next-url";
import { SessionConfig } from "./SessionConfig";

const HOUR_SEC = 60 * 60;
const DAY_SEC = HOUR_SEC * 24;

const COOKIE_TTL = DAY_SEC * 7;

const SessionSchema = z.union([
  z
    .object({
      type: z.literal("user"),
      email: z.string(),
      authenticatedAt: z.number(),
    })
    .readonly(),
  z
    .object({
      type: z.literal("webauthn-in-progress"),
      challenge: z.string(),
      email: z.string().optional(),
      action: z.enum(["register", "authenticate", "conditional"]),
      targetAfterAuth: z.string(),
    })
    .readonly(),
]);

type SessionData = z.infer<typeof SessionSchema>;

async function parseSession(
  cookieValue: string,
  secret: string,
): Promise<SessionData> {
  const unsealed = await unsealData<unknown>(cookieValue, {
    password: secret,
    ttl: COOKIE_TTL,
  });

  const safe = SessionSchema.safeParse(unsealed);
  if (safe.success) {
    return safe.data;
  } else {
    throw new Error(
      `Session data did not match schema, ${safe.error.flatten().formErrors.join(", ")}`,
    );
  }
}

export class Session {
  static async use<R extends NextResponse>(
    config: SessionConfig,
    req: NextRequest,
    block: (session: Session) => Promise<R>,
  ): Promise<R> {
    const session = await Session.get(config, req);
    return await session.persistChanges(await block(session));
  }

  /**
   * Reads the session from the current request's cookies
   */
  private static async get(config: SessionConfig, req: NextRequest) {
    const cookie = req.cookies.get("session");
    const currentUrl = getCurrentUrl(req);

    if (!cookie) {
      return new Session(config, null, currentUrl);
    }

    try {
      return new Session(
        config,
        await parseSession(cookie.value, config.AUTH_SECRET),
        currentUrl,
      );
    } catch (error) {
      logger.error(`Failed to parse session cookie: ${error}`);
      return new Session(config, null, currentUrl);
    }
  }

  private readonly initial: SessionData | null;
  private constructor(
    private readonly config: SessionConfig,
    private current: SessionData | null,
    private currentUrl: URL,
  ) {
    this.initial = current;
  }

  /**
   * Checks if the session is valid (user is authenticated)
   */
  async isValid(): Promise<boolean> {
    return this.current?.type === "user";
  }

  /**
   * Get the email from the session
   */
  getEmail(): string | null {
    return this.current?.type === "user" ? this.current.email : null;
  }

  /**
   * Set user session after successful authentication
   */
  setUser(email: string): void {
    this.current = {
      type: "user",
      email,
      authenticatedAt: Date.now(),
    };
    logger.info(`User authenticated: ${email}`);
  }

  /**
   * Start a WebAuthn ceremony by storing the challenge
   */
  startWebAuthn(
    challenge: string,
    email: string,
    action: "register" | "authenticate",
    targetAfterAuth: URL,
  ): void {
    this.current = {
      type: "webauthn-in-progress",
      challenge,
      email,
      action,
      targetAfterAuth: targetAfterAuth.href,
    };
  }

  /**
   * Start a conditional WebAuthn ceremony (passkey autofill, no email known)
   */
  startConditionalWebAuthn(challenge: string, targetAfterAuth: URL): void {
    this.current = {
      type: "webauthn-in-progress",
      challenge,
      action: "conditional",
      targetAfterAuth: targetAfterAuth.href,
    };
  }

  /**
   * Get the WebAuthn challenge from the session
   */
  getWebAuthnData(): {
    challenge: string;
    email?: string;
    action: "register" | "authenticate" | "conditional";
    targetAfterAuth: string;
  } | null {
    return this.current?.type === "webauthn-in-progress" ? this.current : null;
  }

  /**
   * Reset the session to a clean state
   */
  async reset(): Promise<void> {
    this.current = null;
  }

  /**
   * Get the login URL for redirecting unauthenticated users
   */
  getLoginUrl(targetAfterAuth?: URL): string {
    const loginUrl = new URL("/auth/login", this.currentUrl);
    if (targetAfterAuth) {
      loginUrl.searchParams.set("redirect", targetAfterAuth.pathname);
    }
    return loginUrl.href;
  }

  private async persistChanges<R extends NextResponse>(resp: R): Promise<R> {
    if (this.initial === this.current) {
      // skip the write if the initial and current values are the same
      return resp;
    }

    if (this.current === null) {
      resp.cookies.delete("session");
    } else {
      resp.cookies.set({
        name: "session",
        value: await sealData(SessionSchema.parse(this.current), {
          password: this.config.AUTH_SECRET,
          ttl: COOKIE_TTL,
        }),
        httpOnly: true,
        maxAge: COOKIE_TTL,
        sameSite: "lax",
        secure: isProdUrl(this.currentUrl),
      });
    }

    return resp;
  }
}
