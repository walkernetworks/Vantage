import mysql from 'mysql2/promise';
const PROD = 'mysql://2GaQM4ygVv2AqjL.root:pejvOTHeJ9BM5uOC@gateway01.us-east-1.prod.aws.tidbcloud.com:4000/beignets_brew?ssl={"rejectUnauthorized":true}';
const conn = await mysql.createConnection(PROD);

// Get the 6/23 invoice (id 840003)
const [inv] = await conn.execute('SELECT id, invoiceNumber, invoiceDate, totalAmount, status FROM invoices WHERE id = 840003');
console.log('Invoice:', JSON.stringify(inv[0]));

// Sum of extension from invoice_lines
const [extSum] = await conn.execute('SELECT SUM(CAST(extension AS DECIMAL(10,2))) as total, COUNT(*) as lines FROM invoice_lines WHERE invoiceId = 840003');
console.log('Sum of extension:', JSON.stringify(extSum[0]));

// Check a few lines to see what extension values look like
const [lines] = await conn.execute('SELECT id, description, shippedQty, unitPrice, extension, matchStatus FROM invoice_lines WHERE invoiceId = 840003 LIMIT 10');
console.log('Sample lines:', JSON.stringify(lines, null, 2));

// Also check if there are lines with null extension
const [nullExt] = await conn.execute('SELECT COUNT(*) as n FROM invoice_lines WHERE invoiceId = 840003 AND extension IS NULL');
console.log('Lines with null extension:', nullExt[0].n);

// Check what the calculated total would be using unitPrice * shippedQty instead
const [calcAlt] = await conn.execute('SELECT SUM(CAST(unitPrice AS DECIMAL(10,4)) * CAST(shippedQty AS DECIMAL(10,4))) as altTotal FROM invoice_lines WHERE invoiceId = 840003');
console.log('Alt total (unitPrice * shippedQty):', JSON.stringify(calcAlt[0]));

await conn.end();
