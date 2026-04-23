import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import * as Y from 'yjs';
import { createAdapter } from '@socket.io/redis-adapter';
import { redisClient, initStorage, loadDocument, cacheDocumentToRedis, flushDocumentToPostgres, pgPool } from './storage';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-default-key-for-dev';

const activeDocs = new Map<string, Y.Doc>();

async function getOrLoadDoc(docId: string): Promise<Y.Doc> {
  if (activeDocs.has(docId)) {
    return activeDocs.get(docId)!;
  }
  const doc = await loadDocument(docId);
  activeDocs.set(docId, doc);
  return doc;
}

// Set up periodic flushing for all active documents
setInterval(async () => {
  for (const [docId, doc] of activeDocs.entries()) {
    try {
      await flushDocumentToPostgres(docId, doc);
      // Optional: if doc has no connected clients, we could unload it to save memory.
    } catch (e) {
      console.error(`Failed to flush doc ${docId} to DB:`, e);
    }
  }
}, 10000); // Flush every 10 seconds

async function bootstrap() {
  await initStorage();
  
  const app = express();
  app.use(cors());
  app.use(express.json()); // For parsing application/json
  
  // API Routes
  app.post('/api/register', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
      
      const checkParams = [username];
      const checkResult = await pgPool.query('SELECT id FROM users WHERE username = $1', checkParams);
      if (checkResult.rows.length > 0) return res.status(409).json({ error: 'Username taken' });
      
      const hash = await bcrypt.hash(password, 10);
      const params = [username, hash];
      const result = await pgPool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id', params);
      const userId = result.rows[0].id;
      
      const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ token, userId, username });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      const params = [username];
      const result = await pgPool.query('SELECT id, password_hash FROM users WHERE username = $1', params);
      
      if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
      
      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
      
      const token = jwt.sign({ userId: user.id, username }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ token, userId: user.id, username });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Middleware for checking auth
  const requireAuth = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
      if (err) return res.status(403).json({ error: 'Invalid token' });
      req.user = decoded;
      next();
    });
  };

  app.get('/api/boards', requireAuth, async (req: any, res: any) => {
    try {
      const result = await pgPool.query(`
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
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/boards/:id/join', requireAuth, async (req: any, res: any) => {
    try {
      const boardId = req.params.id;
      const userId = req.user.userId;
      
      // Upsert into board_collaborators
      await pgPool.query(`
        INSERT INTO board_collaborators (board_id, user_id, last_accessed)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (board_id, user_id) 
        DO UPDATE SET last_accessed = CURRENT_TIMESTAMP
      `, [boardId, userId]);
      
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/boards', requireAuth, async (req: any, res: any) => {
    try {
      const { title } = req.body;
      const id = uuidv4();
      await pgPool.query('INSERT INTO boards (id, owner_id, title) VALUES ($1, $2, $3)', [id, req.user.userId, title || 'Untitled Board']);
      res.json({ id, title });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  const httpServer = createServer(app);
  
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  
  // Setup Redis Pub/Sub Adapter for scaling across instances safely
  try {
    const pubClient = redisClient.duplicate();
    const subClient = redisClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
  } catch (e) {
    console.log('⚠️ Redis pub/sub not available. Using default in-memory adapter.');
  }
  
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    
    let currentRoom: string | null = null;
    
    socket.on('join-document', async (docId: string) => {
      if (currentRoom) {
        socket.leave(currentRoom);
      }
      currentRoom = docId;
      socket.join(docId);
      
      const doc = await getOrLoadDoc(docId);
      const stateVector = Y.encodeStateAsUpdate(doc);
      socket.emit('sync-update', docId, Buffer.from(stateVector)); // send docId for initial sync
    });
    
    socket.on('sync-update', async (docId: string, updateMsg: Buffer | Uint8Array) => {
      if (!docId) return;
      const update = new Uint8Array(updateMsg);
      // broadcast to everyone else in this room
      socket.broadcast.to(docId).emit('sync-update', docId, Buffer.from(update));
      
      const doc = await getOrLoadDoc(docId);
      Y.applyUpdate(doc, update);
      await cacheDocumentToRedis(docId, doc);
    });
    
    socket.on('awareness-update', (docId: string, awarenessMsg: Buffer | Uint8Array) => {
      if (!docId) return;
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
