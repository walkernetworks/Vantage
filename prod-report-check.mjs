import mysql from 'mysql2/promise';
const PROD_URL = 'mysql://2GaQM4ygVv2AqjL.root:pejvOTHeJ9BM5uOC@gateway01.us-east-1.prod.aws.tidbcloud.com:4000/beignets_brew?ssl={"rejectUnauthorized":true}';
const conn = await mysql.createConnection(PROD_URL);

// Run the EXACT query from getInvoiceHistoryReport
const [rows] = await conn.execute(`
  SELECT
    i.id, i.vendor, i.invoiceNumber, i.invoiceDate, i.totalAmount, i.status, i.createdAt,
    COALESCE(SUM(CAST(il.extension AS DECIMAL(10,2))), 0) AS calculatedTotal,
    COUNT(il.id) AS lineCount,
    SUM(CASE WHEN il.matchStatus = 'matched' THEN 1 ELSE 0 END) AS matchedCount,
    SUM(CASE WHEN il.matchStatus = 'unmatched' THEN 1 ELSE 0 END) AS unmatchedCount
  FROM invoices i
  LEFT JOIN invoice_lines il ON il.invoiceId = i.id
  GROUP BY i.id
  ORDER BY i.createdAt DESC
  LIMIT 50
`);
console.log('Rows returned:', rows.length);
console.log(JSON.stringify(rows, null, 2));

// Also check what tables exist in production
const [tables] = await conn.execute('SHOW TABLES');
console.log('Tables:', tables.map(t => Object.values(t)[0]).join(', '));

await conn.end();
