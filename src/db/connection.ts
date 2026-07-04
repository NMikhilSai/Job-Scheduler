import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// Disable prepare statements for compatibility with pgbouncer transaction mode
export const sql = postgres(connectionString, {
  prepare: false,
  ssl: 'require',
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

(async () => {
  try {
    const result = await sql`SELECT NOW()`;
    console.log('✅ Database connected:', result);
  } catch (err) {
    console.error('❌ Database connection failed:', err);
  }
})();
