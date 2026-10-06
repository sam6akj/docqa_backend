import { test, expect } from "@playwright/test";

const user = {
  email: process.env.TEST_USER_EMAIL!,
  password: process.env.TEST_USER_PASSWORD!,
};

test.describe("POST /api/auth/login", () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    const ctx = await playwright.request.newContext({ baseURL });
    const res = await ctx.post("/api/auth/register", { data: user });
    expect([200, 201, 400, 409]).toContain(res.status());
    await ctx.dispose();
  });

  test("logs in with valid credentials", async ({ request }) => {
    const res = await request.post("/api/auth/login", { data: user });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBeTruthy();
  });

  test("rejects wrong password", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: { email: user.email, password: "definitely-wrong" },
    });
    expect(res.status()).toBe(401);
  });

  test("rejects unknown email", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: { email: "nobody@example.com", password: user.password },
    });
    expect(res.status()).toBe(401);
  });
});