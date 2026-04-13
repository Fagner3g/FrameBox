import fs from "node:fs";
import path from "node:path";
import { db } from "./connection";

export function runMigrations() {
  console.log("Running database migrations...");

  // Criar tabela de controle de migrations se não existir
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      executed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const migrationsDir = path.join(__dirname, "migrations");
  
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }

  // Buscar todos os arquivos .sql
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith(".sql"))
    .sort();

  // Buscar migrations já executadas
  const executedMigrations = db.prepare("SELECT name FROM _migrations").all() as { name: string }[];
  const executedSet = new Set(executedMigrations.map(m => m.name));

  let count = 0;

  // Executar migrations pendentes de forma transacional
  const runTransaction = db.transaction((file: string, sql: string) => {
    db.exec(sql);
    db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
  });

  for (const file of files) {
    if (!executedSet.has(file)) {
      console.log(`Applying migration: ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
      runTransaction(file, sql);
      count++;
    }
  }

  if (count === 0) {
    console.log("Database is up to date.");
  } else {
    console.log(`Applied ${count} new migrations.`);
  }
}
