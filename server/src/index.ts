import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import * as Y from 'yjs';
import { createAdapter } from '@socket.io/redis-adapter';
import { redisClient, initStorage, loadDocument, cacheDocumentToRedis, flushDocumentToPostgres } from './storage';

const PORT = process.env.PORT || 3001;
const DOC_ID = 'default';

async function bootstrap() {
  await initStorage();
  
  const app = express();
  app.use(cors());
  
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
  
  // Load the initial document state
  const doc = await loadDocument(DOC_ID);
  
  // Set up periodic flushing
  setInterval(async () => {
    try {
      await flushDocumentToPostgres(DOC_ID, doc);
    } catch (e) {
      console.error('Failed to flush to DB:', e);
    }
  }, 10000); // Flush every 10 seconds for this demo
  
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    
    // Join the common document room
    socket.join(DOC_ID);
    
    // When a user connects, send them the current full document state
    const stateVector = Y.encodeStateAsUpdate(doc);
    socket.emit('sync-update', Buffer.from(stateVector));
    
    // Handle document updates from clients
    socket.on('sync-update', async (updateMsg: Buffer | Uint8Array) => {
      const update = new Uint8Array(updateMsg);
      // Broadcast to other users in the room
      socket.broadcast.to(DOC_ID).emit('sync-update', Buffer.from(update));
      
      // Apply the update locally to our backend in-memory doc
      Y.applyUpdate(doc, update);
      
      // Fast persist to Redis
      await cacheDocumentToRedis(DOC_ID, doc);
    });
    
    // Handle awareness (cursor positions) updates
    socket.on('awareness-update', (awarenessMsg: Buffer | Uint8Array) => {
      // Just broadcast awareness, the server doesn't need to track it
      socket.broadcast.to(DOC_ID).emit('awareness-update', Buffer.from(awarenessMsg));
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
