import * as Y from 'yjs';
import { Socket } from 'socket.io-client';
import { Awareness } from 'y-protocols/awareness';

export class SocketIOProvider {
  doc: Y.Doc;
  socket: Socket;
  roomName: string;
  awareness: Awareness;

  constructor(socket: Socket, roomName: string, doc: Y.Doc) {
    this.socket = socket;
    this.roomName = roomName;
    this.doc = doc;
    this.awareness = new Awareness(doc);

    this.socket.emit('join-document', this.roomName);

    this.socket.on('sync-update', (boardId: string, updateMsg: ArrayBuffer) => {
      if (boardId !== this.roomName) return;
      const update = new Uint8Array(updateMsg);
      Y.applyUpdate(this.doc, update, this);
    });

    this.socket.on('awareness-update', (boardId: string, awarenessMsg: ArrayBuffer) => {
      if (boardId !== this.roomName) return;
      const update = new Uint8Array(awarenessMsg);
      import('y-protocols/awareness').then(({ applyAwarenessUpdate }) => {
        applyAwarenessUpdate(this.awareness, update, this);
      });
    });

    this.doc.on('update', (update: Uint8Array, origin: any) => {
      if (origin !== this) {
        this.socket.emit('sync-update', this.roomName, update);
      }
    });

    this.awareness.on('update', ({ added, updated, removed }: any, origin: any) => {
      if (origin !== this) {
        import('y-protocols/awareness').then(({ encodeAwarenessUpdate }) => {
          const changedClients = added.concat(updated).concat(removed);
          const update = encodeAwarenessUpdate(this.awareness, changedClients);
          this.socket.emit('awareness-update', this.roomName, update);
        });
      }
    });
  }

  destroy() {
    this.socket.off('sync-update');
    this.socket.off('awareness-update');
  }
}
