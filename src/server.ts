import { createServerApp } from "./server/app.js";
import { PORT } from "./server/config.js";

const app = createServerApp();
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Harhub API listening on http://127.0.0.1:${PORT}`);
});
