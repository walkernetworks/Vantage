import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const sql = `
CREATE TABLE IF NOT EXISTS \`import_batches\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`importSource\` varchar(32) NOT NULL,
  \`fileName\` varchar(255),
  \`itemsCreated\` int NOT NULL DEFAULT 0,
  \`itemsUpdated\` int NOT NULL DEFAULT 0,
  \`itemsUnchanged\` int NOT NULL DEFAULT 0,
  \`priceChangesCount\` int NOT NULL DEFAULT 0,
  \`priceSnapshot\` json,
  \`importedBy\` int,
  \`importedAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`import_batches_id\` PRIMARY KEY(\`id\`)
)
`;

const fk = `ALTER TABLE \`import_batches\` ADD CONSTRAINT \`import_batches_importedBy_users_id_fk\` FOREIGN KEY (\`importedBy\`) REFERENCES \`users\`(\`id\`) ON DELETE no action ON UPDATE no action`;
const idx1 = `CREATE INDEX IF NOT EXISTS \`idx_import_batches_source\` ON \`import_batches\` (\`importSource\`)`;
const idx2 = `CREATE INDEX IF NOT EXISTS \`idx_import_batches_date\` ON \`import_batches\` (\`importedAt\`)`;

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  console.log('Connected');
  
  await conn.execute(sql);
  console.log('Table created');
  
  try {
    await conn.execute(fk);
    console.log('FK added');
  } catch (e) {
    if (e.code === 'ER_DUP_KEY' || e.message.includes('Duplicate')) {
      console.log('FK already exists, skipping');
    } else {
      console.log('FK error (may already exist):', e.message);
    }
  }
  
  try { await conn.execute(idx1); console.log('idx1 created'); } catch(e) { console.log('idx1:', e.message); }
  try { await conn.execute(idx2); console.log('idx2 created'); } catch(e) { console.log('idx2:', e.message); }
  
  // Verify
  const [rows] = await conn.execute("SHOW TABLES LIKE 'import_batches'");
  console.log('Table exists:', rows.length > 0);
  
  await conn.end();
}

main().catch(console.error);
