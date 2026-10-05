import { createApp } from "./app.js";
import { env } from "./config/env.js";

createApp().listen(env.PORT, () => {
  console.log(`[api] listening on http://localhost:${env.PORT}`);
});
