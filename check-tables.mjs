import mysql from 'mysql2/promise';
const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url);
const [tables] = await conn.execute('SHOW TABLES');
const tableNames = tables.map(t => Object.values(t)[0]);
console.log('All tables:', tableNames.join(', '));
for (const t of tableNames) {
  const [cnt] = await conn.execute(`SELECT COUNT(*) as n FROM \`${t}\``);
  if (cnt[0].n > 0) console.log(`  ${t}: ${cnt[0].n} rows`);
}
await conn.end();
