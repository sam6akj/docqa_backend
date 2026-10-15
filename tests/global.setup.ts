import { test as setup } from "@playwright/test";

const user = {
  email: process.env.TEST_USER_EMAIL!,
  password: process.env.TEST_USER_PASSWORD!,
};

setup("authenticate", async ({ request }) => {
  const res = await request.post("/api/auth/login", { data: user });
  if (!res.ok()) {
    throw new Error(`Setup login failed: ${res.status()} ${await res.text()}`);
  }
  await request.storageState({ path: "tests/.auth/session.json" });
});