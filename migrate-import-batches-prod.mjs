import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  // Check if table already exists
  const [rows] = await conn.query(
    "SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'import_batches'"
  );
  if (rows[0].cnt > 0) {
    console.log('import_batches table already exists — skipping creation.');
  } else {
    await conn.query(`
      CREATE TABLE import_batches (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        importSource VARCHAR(50) NOT NULL,
        fileName VARCHAR(255),
        itemsCreated INT NOT NULL DEFAULT 0,
        itemsUpdated INT NOT NULL DEFAULT 0,
        priceChangesCount INT NOT NULL DEFAULT 0,
        importedBy VARCHAR(255),
        priceSnapshot JSON,
        importedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('import_batches table created successfully.');
  }
} finally {
  await conn.end();
}
