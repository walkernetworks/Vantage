import mysql from 'mysql2/promise';
const PROD = 'mysql://2GaQM4ygVv2AqjL.root:pejvOTHeJ9BM5uOC@gateway01.us-east-1.prod.aws.tidbcloud.com:4000/beignets_brew?ssl={"rejectUnauthorized":true}';
const conn = await mysql.createConnection(PROD);

// Sum of extension from invoice_lines
const [extSum] = await conn.execute('SELECT SUM(CAST(extension AS DECIMAL(10,2))) as total, COUNT(*) as line_count FROM invoice_lines WHERE invoiceId = 840003');
console.log('Sum of extension:', JSON.stringify(extSum[0]));

// Sample lines
const [lines] = await conn.execute('SELECT id, description, shippedQty, unitPrice, extension, matchStatus FROM invoice_lines WHERE invoiceId = 840003 LIMIT 5');
console.log('Sample lines:', JSON.stringify(lines, null, 2));

// Lines with null extension
const [nullExt] = await conn.execute('SELECT COUNT(*) as n FROM invoice_lines WHERE invoiceId = 840003 AND extension IS NULL');
console.log('Lines with null extension:', nullExt[0].n);

// Alt total using unitPrice * shippedQty
const [calcAlt] = await conn.execute('SELECT SUM(CAST(unitPrice AS DECIMAL(10,4)) * CAST(shippedQty AS DECIMAL(10,4))) as altTotal FROM invoice_lines WHERE invoiceId = 840003');
console.log('Alt total (unitPrice * shippedQty):', JSON.stringify(calcAlt[0]));

// Check items table prices for matched lines
const [matched] = await conn.execute(`
  SELECT il.description, il.shippedQty, il.unitPrice, il.extension, i.price as catalogPrice
  FROM invoice_lines il
  LEFT JOIN items i ON i.id = il.itemId
  WHERE il.invoiceId = 840003 AND il.matchStatus = 'matched'
  LIMIT 5
`);
console.log('Matched lines with catalog prices:', JSON.stringify(matched, null, 2));

await conn.end();
