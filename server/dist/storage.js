"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPgConnected = exports.isRedisConnected = exports.pgPool = exports.redisClient = void 0;
exports.initStorage = initStorage;
exports.loadDocument = loadDocument;
exports.cacheDocumentToRedis = cacheDocumentToRedis;
exports.flushDocumentToPostgres = flushDocumentToPostgres;
const redis_1 = require("redis");
const pg_1 = require("pg");
const Y = __importStar(require("yjs"));
// Redis Client for caching doc state
exports.redisClient = (0, redis_1.createClient)({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
        reconnectStrategy: false // Fail fast if Redis is not running
    }
});
exports.redisClient.on('error', (err) => console.log('Redis Client Error', err));
// Postgres Pool for durable storage
exports.pgPool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/collab_editor'
});
exports.isRedisConnected = false;
exports.isPgConnected = false;
async function initStorage() {
    try {
        await exports.redisClient.connect();
        exports.isRedisConnected = true;
        console.log('Connected to Redis');
    }
    catch (e) {
        console.log('⚠️ Redis not available. Running without fast caching.');
    }
    try {
        await exports.pgPool.query(`
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
        exports.isPgConnected = true;
        console.log('Connected to PostgreSQL');
    }
    catch (e) {
        console.log('⚠️ PostgreSQL not available. Running without durable storage.');
    }
}
/**
 * Loads the document from Redis or Postgres
 */
async function loadDocument(docId) {
    const doc = new Y.Doc();
    // Try Redis first (fast path)
    if (exports.isRedisConnected) {
        try {
            const redisState = await exports.redisClient.get(Buffer.from(`doc:${docId}`));
            if (redisState) {
                const uint8Array = new Uint8Array(Buffer.from(redisState, 'base64'));
                Y.applyUpdate(doc, uint8Array);
                return doc;
            }
        }
        catch (e) { }
    }
    // Fallback to Postgres
    if (exports.isPgConnected) {
        try {
            const pgResult = await exports.pgPool.query('SELECT document_state FROM documents WHERE id = $1', [docId]);
            if (pgResult.rows.length > 0) {
                const dbState = pgResult.rows[0].document_state;
                const uint8Array = new Uint8Array(dbState);
                Y.applyUpdate(doc, uint8Array);
                if (exports.isRedisConnected) {
                    const stateVector = Y.encodeStateAsUpdate(doc);
                    await exports.redisClient.set(`doc:${docId}`, Buffer.from(stateVector).toString('base64'));
                }
            }
        }
        catch (e) { }
    }
    return doc;
}
/**
 * Rapidly cache doc state to Redis
 */
async function cacheDocumentToRedis(docId, doc) {
    if (!exports.isRedisConnected)
        return;
    try {
        const stateVector = Y.encodeStateAsUpdate(doc);
        await exports.redisClient.set(`doc:${docId}`, Buffer.from(stateVector).toString('base64'));
    }
    catch (e) { }
}
/**
 * Flush Redis doc state to Postgres
 */
async function flushDocumentToPostgres(docId, doc) {
    if (!exports.isPgConnected)
        return;
    try {
        const stateVector = Buffer.from(Y.encodeStateAsUpdate(doc));
        await exports.pgPool.query(`
      INSERT INTO documents (id, document_state)
      VALUES ($1, $2)
      ON CONFLICT (id) DO UPDATE SET document_state = EXCLUDED.document_state
    `, [docId, stateVector]);
    }
    catch (e) { }
}
