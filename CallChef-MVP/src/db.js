import { readFile, readdir, mkdir } from 'node:fs/promises';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
export async function openDatabase({url=process.env.DATABASE_URL, memory=false}={}) {
 if(url) {
  const pool=new pg.Pool({connectionString:url, max:10});
  return {query:(sql,p=[])=>pool.query(sql,p),exec:sql=>pool.query(sql),close:()=>pool.end(),transaction:async fn=>{const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}};
 }
 if(process.env.NODE_ENV==='production') throw new Error('DATABASE_URL obligatoire en production');
 if(!memory) await mkdir('.data',{recursive:true});
 const db=new PGlite(memory?undefined:'.data/postgres');await db.waitReady;
 return {query:(sql,p=[])=>db.query(sql,p),exec:sql=>db.exec(sql),close:()=>db.close(),transaction:fn=>db.transaction(fn)};
}
export async function migrate(db) {
 await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())');
 for(const name of (await readdir(new URL('../db/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()) {
  if((await db.query('SELECT name FROM schema_migrations WHERE name=$1',[name])).rows.length) continue;
  await db.transaction(async tx=>{await tx.exec?.(await readFile(new URL('../db/migrations/'+name,import.meta.url),'utf8')) ?? await tx.query(await readFile(new URL('../db/migrations/'+name,import.meta.url),'utf8'));await tx.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);});
 }
}
export const one=async(db,sql,p=[]) => (await db.query(sql,p)).rows[0];
