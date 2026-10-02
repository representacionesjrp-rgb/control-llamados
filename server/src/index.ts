import path from "node:path";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";

const config = loadConfig();
const db = openDatabase(config.DATA_DIR);
// Works both from src/ (tsx) and dist/src/ (compiled).
const publicDir = path.resolve(import.meta.dirname, import.meta.dirname.includes(`${path.sep}dist${path.sep}`) ? "../../public" : "../public");
const app = createApp(config, db, publicDir);

app.listen(config.PORT, () => {
  console.log(`Control de llamados escuchando en el puerto ${config.PORT}`);
});
