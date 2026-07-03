import { createServerApp } from "./server/app.js";
import { HOST, PORT } from "./server/config.js";

const app = createServerApp();
app.listen(PORT, HOST, () => {
  console.log(`Harhub API listening on http://${HOST}:${PORT}`);
});
