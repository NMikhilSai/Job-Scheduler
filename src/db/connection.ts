import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_DB_URL = "postgresql://postgres.xjepohumtnltyeuepyki:1%40Srivani123@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true";

const connectionString = process.env.DATABASE_URL || DEFAULT_DB_URL;

// Disable prepare statements for compatibility with pgbouncer transaction mode
export const sql = postgres(connectionString, {
  prepare: false,
  ssl: 'require',
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});
