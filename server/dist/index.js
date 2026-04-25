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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const Y = __importStar(require("yjs"));
const redis_adapter_1 = require("@socket.io/redis-adapter");
const storage_1 = require("./storage");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const uuid_1 = require("uuid");
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-default-key-for-dev';
const activeDocs = new Map();
async function getOrLoadDoc(docId) {
    if (activeDocs.has(docId)) {
        return activeDocs.get(docId);
    }
    const doc = await (0, storage_1.loadDocument)(docId);
    activeDocs.set(docId, doc);
    return doc;
}
// Set up periodic flushing for all active documents
setInterval(async () => {
    for (const [docId, doc] of activeDocs.entries()) {
        try {
            await (0, storage_1.flushDocumentToPostgres)(docId, doc);
            // Optional: if doc has no connected clients, we could unload it to save memory.
        }
        catch (e) {
            console.error(`Failed to flush doc ${docId} to DB:`, e);
        }
    }
}, 10000); // Flush every 10 seconds
async function bootstrap() {
    await (0, storage_1.initStorage)();
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use(express_1.default.json()); // For parsing application/json
    // API Routes
    app.post('/api/register', async (req, res) => {
        try {
            const { username, password } = req.body;
            if (!username || !password)
                return res.status(400).json({ error: 'Missing fields' });
            const checkParams = [username];
            const checkResult = await storage_1.pgPool.query('SELECT id FROM users WHERE username = $1', checkParams);
            if (checkResult.rows.length > 0)
                return res.status(409).json({ error: 'Username taken' });
            const hash = await bcryptjs_1.default.hash(password, 10);
            const params = [username, hash];
            const result = await storage_1.pgPool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id', params);
            const userId = result.rows[0].id;
            const token = jsonwebtoken_1.default.sign({ userId, username }, JWT_SECRET, { expiresIn: '7d' });
            res.json({ token, userId, username });
        }
        catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Server error' });
        }
    });
    app.post('/api/login', async (req, res) => {
        try {
            const { username, password } = req.body;
            const params = [username];
            const result = await storage_1.pgPool.query('SELECT id, password_hash FROM users WHERE username = $1', params);
            if (result.rows.length === 0)
                return res.status(401).json({ error: 'Invalid credentials' });
            const user = result.rows[0];
            const valid = await bcryptjs_1.default.compare(password, user.password_hash);
            if (!valid)
                return res.status(401).json({ error: 'Invalid credentials' });
            const token = jsonwebtoken_1.default.sign({ userId: user.id, username }, JWT_SECRET, { expiresIn: '7d' });
            res.json({ token, userId: user.id, username });
        }
        catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Server error' });
        }
    });
    // Middleware for checking auth
    const requireAuth = (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader)
            return res.status(401).json({ error: 'No token provided' });
        const token = authHeader.split(' ')[1];
        jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, decoded) => {
            if (err)
                return res.status(403).json({ error: 'Invalid token' });
            req.user = decoded;
            next();
        });
    };
    app.get('/api/boards', requireAuth, async (req, res) => {
        try {
            const result = await storage_1.pgPool.query(`
        SELECT b.id, b.title, b.created_at, 'owner' as role
        FROM boards b 
        WHERE b.owner_id = $1
        
        UNION ALL
        
        SELECT b.id, b.title, bc.last_accessed as created_at, 'collaborator' as role
        FROM boards b
        JOIN board_collaborators bc ON b.id = bc.board_id
        WHERE bc.user_id = $1 AND b.owner_id != $1
        
        ORDER BY created_at DESC
      `, [req.user.userId]);
            res.json(result.rows);
        }
        catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Server error' });
        }
    });
    app.post('/api/boards/:id/join', requireAuth, async (req, res) => {
        try {
            const boardId = req.params.id;
            const userId = req.user.userId;
            // Upsert into board_collaborators
            await storage_1.pgPool.query(`
        INSERT INTO board_collaborators (board_id, user_id, last_accessed)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (board_id, user_id) 
        DO UPDATE SET last_accessed = CURRENT_TIMESTAMP
      `, [boardId, userId]);
            res.json({ success: true });
        }
        catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Server error' });
        }
    });
    app.post('/api/boards', requireAuth, async (req, res) => {
        try {
            const { title } = req.body;
            const id = (0, uuid_1.v4)();
            await storage_1.pgPool.query('INSERT INTO boards (id, owner_id, title) VALUES ($1, $2, $3)', [id, req.user.userId, title || 'Untitled Board']);
            res.json({ id, title });
        }
        catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Server error' });
        }
    });
    const httpServer = (0, http_1.createServer)(app);
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });
    // Setup Redis Pub/Sub Adapter for scaling across instances safely
    try {
        const pubClient = storage_1.redisClient.duplicate();
        const subClient = storage_1.redisClient.duplicate();
        await Promise.all([pubClient.connect(), subClient.connect()]);
        io.adapter((0, redis_adapter_1.createAdapter)(pubClient, subClient));
    }
    catch (e) {
        console.log('⚠️ Redis pub/sub not available. Using default in-memory adapter.');
    }
    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.id}`);
        let currentRoom = null;
        socket.on('join-document', async (docId) => {
            if (currentRoom) {
                socket.leave(currentRoom);
            }
            currentRoom = docId;
            socket.join(docId);
            const doc = await getOrLoadDoc(docId);
            const stateVector = Y.encodeStateAsUpdate(doc);
            socket.emit('sync-update', docId, Buffer.from(stateVector)); // send docId for initial sync
        });
        socket.on('sync-update', async (docId, updateMsg) => {
            if (!docId)
                return;
            const update = new Uint8Array(updateMsg);
            // broadcast to everyone else in this room
            socket.broadcast.to(docId).emit('sync-update', docId, Buffer.from(update));
            const doc = await getOrLoadDoc(docId);
            Y.applyUpdate(doc, update);
            await (0, storage_1.cacheDocumentToRedis)(docId, doc);
        });
        socket.on('awareness-update', (docId, awarenessMsg) => {
            if (!docId)
                return;
            socket.broadcast.to(docId).emit('awareness-update', docId, Buffer.from(awarenessMsg));
        });
        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.id}`);
        });
    });
    httpServer.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
}
bootstrap().catch(console.error);
