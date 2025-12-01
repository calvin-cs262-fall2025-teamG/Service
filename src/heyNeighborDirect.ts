/**
 * Direct Postgres access to the HeyNeighbor DB hosted on Azure PostgreSQL.
 *
 * Notes:
 * - Connection variables stored in `.env` (ignored by Git).
 * - Add your local IP to Azure firewall access list.
 * - Not suitable for production use — only for local testing.
 *
 * To execute locally:
 *      source .env
 *      npm run direct
 */

import pgPromise from 'pg-promise';

const pgp = pgPromise();
const db = pgp({
  host: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

// Example queries for your schema
async function runQueries() {
  try {
    const users = await db.any('SELECT * FROM app_user');
    console.log('Users:', users);

    const items = await db.any('SELECT * FROM Item');
    console.log('Items:', items);

    const requests = await db.any('SELECT * FROM BorrowingRequest');
    console.log('Borrowing Requests:', requests);

    const history = await db.any('SELECT * FROM BorrowingHistory');
    console.log('Borrowing History:', history);

    const messages = await db.any('SELECT * FROM Messages');
    console.log('Messages:', messages);
  } catch (error) {
    console.error('ERROR:', error);
  } finally {
    pgp.end();
  }
}

runQueries();
