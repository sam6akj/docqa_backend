import { test as setup } from "@playwright/test";

const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

if (!email || !password) {
  throw new Error("Missing TEST_USER_EMAIL or TEST_USER_PASSWORD");
}

const user = { email, password };

setup("authenticate", async ({ request }) => {
  const registerRes = await request.post("/api/auth/register", {
    data: user,
  });

  if (!registerRes.ok() && registerRes.status() !== 409) {
    throw new Error(
      `Registration failed: ${registerRes.status()} ${await registerRes.text()}`
    );
  }

  const loginRes = await request.post("/api/auth/login", {
    data: user,
  });

  if (!loginRes.ok()) {
    throw new Error(
      `Setup login failed: ${loginRes.status()} ${await loginRes.text()}`
    );
  }

  await request.storageState({
    path: "tests/.auth/session.json",
  });
});