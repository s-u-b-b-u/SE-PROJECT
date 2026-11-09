// Runs a .sql file (multi-statement) against the configured MySQL server.
// Usage: node database/run-sql.js database/schema.sql
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node database/run-sql.js <file.sql>');
  const sql = fs.readFileSync(path.resolve(file), 'utf8');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });
  await conn.query(sql);
  await conn.end();
  console.log(`Executed ${file}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
