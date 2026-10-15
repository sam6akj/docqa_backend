import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { registerSchema, loginSchema } from "../schemas/auth.js";
import { hashPassword, comparePassword } from "../lib/password.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_MAX_AGE_MS,
} from "../lib/jwt.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { HttpError } from "../middleware/errorHandler.js";
import { env } from "../config/env.js";

export const authRouter = Router();

const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  path: "/api/auth",
};

authRouter.post("/register", async (req, res, next) => {
  try {
    const { email, password } = registerSchema.parse(req.body);

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      throw new HttpError(409, "An account with this email already exists");
    }

    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash })
      .returning({ id: users.id, email: users.email });

    const accessToken = signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = signRefreshToken({ sub: user.id });

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions);
    res.status(201).json({ user, accessToken });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !(await comparePassword(password, user.passwordHash))) {
      throw new HttpError(401, "Invalid email or password");
    }

    const accessToken = signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = signRefreshToken({ sub: user.id });

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions);
    res.json({ user: { id: user.id, email: user.email }, accessToken });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!token) throw new HttpError(401, "Missing refresh token");

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw new HttpError(401, "Invalid or expired refresh token");
    }

    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user) throw new HttpError(401, "User no longer exists");

    const accessToken = signAccessToken({ sub: user.id, email: user.email });
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });
  res.status(204).send();
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
