import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";

// Certificar que o diretório do banco de dados existe
const dbDir = path.dirname(config.DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Singleton de conexão com o banco de dados
const db = new Database(config.DB_PATH, { verbose: console.log });

// Habilitar chaves estrangeiras (frequentemente necessário no SQLite)
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export { db };
