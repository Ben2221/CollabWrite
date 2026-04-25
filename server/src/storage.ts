import { createClient } from 'redis';
import { Pool } from 'pg';
import * as Y from 'yjs';

// Redis Client for caching doc state
export const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: false // Fail fast if Redis is not running
  }
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));

// Postgres Pool for durable storage
export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/collab_editor'
});

export let isRedisConnected = false;
export let isPgConnected = false;

export async function initStorage() {
  try {
    await redisClient.connect();
    isRedisConnected = true;
    console.log('Connected to Redis');
  } catch (e) {
    console.log('⚠️ Redis not available. Running without fast caching.');
  }
  
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id VARCHAR PRIMARY KEY,
        document_state BYTEA
      );
      
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR UNIQUE NOT NULL,
        password_hash VARCHAR NOT NULL
      );

      CREATE TABLE IF NOT EXISTS boards (
        id VARCHAR PRIMARY KEY,
        owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
        title VARCHAR NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS board_collaborators (
        board_id VARCHAR REFERENCES boards(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (board_id, user_id)
      );
    `);
    isPgConnected = true;
    console.log('Connected to PostgreSQL');
  } catch (e) {
    console.log('⚠️ PostgreSQL not available. Running without durable storage.');
  }
}

/**
 * Loads the document from Redis or Postgres
 */
export async function loadDocument(docId: string): Promise<Y.Doc> {
  const doc = new Y.Doc();
  
  // Try Redis first (fast path)
  if (isRedisConnected) {
    try {
      const redisState = await redisClient.get(Buffer.from(`doc:${docId}`));
      if (redisState) {
        const uint8Array = new Uint8Array(Buffer.from(redisState, 'base64'));
        Y.applyUpdate(doc, uint8Array);
        return doc;
      }
    } catch (e) {}
  }
  
  // Fallback to Postgres
  if (isPgConnected) {
    try {
      const pgResult = await pgPool.query('SELECT document_state FROM documents WHERE id = $1', [docId]);
      if (pgResult.rows.length > 0) {
        const dbState = pgResult.rows[0].document_state;
        const uint8Array = new Uint8Array(dbState);
        Y.applyUpdate(doc, uint8Array);
        
        if (isRedisConnected) {
          const stateVector = Y.encodeStateAsUpdate(doc);
          await redisClient.set(`doc:${docId}`, Buffer.from(stateVector).toString('base64'));
        }
      }
    } catch (e) {}
  }
  
  return doc;
}

/**
 * Rapidly cache doc state to Redis
 */
export async function cacheDocumentToRedis(docId: string, doc: Y.Doc) {
  if (!isRedisConnected) return;
  try {
    const stateVector = Y.encodeStateAsUpdate(doc);
    await redisClient.set(`doc:${docId}`, Buffer.from(stateVector).toString('base64'));
  } catch (e) {}
}

/**
 * Flush Redis doc state to Postgres
 */
export async function flushDocumentToPostgres(docId: string, doc: Y.Doc) {
  if (!isPgConnected) return;
  try {
    const stateVector = Buffer.from(Y.encodeStateAsUpdate(doc));
    await pgPool.query(`
      INSERT INTO documents (id, document_state)
      VALUES ($1, $2)
      ON CONFLICT (id) DO UPDATE SET document_state = EXCLUDED.document_state
    `, [docId, stateVector]);
  } catch (e) {}
}
