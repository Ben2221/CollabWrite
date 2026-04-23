import * as Y from 'yjs';
import { Socket } from 'socket.io-client';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';

export class SocketIOProvider {
  doc: Y.Doc;
  socket: Socket;
  roomName: string;
  awareness: Awareness;
  private onBeforeUnload: () => void;

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
      applyAwarenessUpdate(this.awareness, update, this);
    });

    this.doc.on('update', (update: Uint8Array, origin: any) => {
      if (origin !== this) {
        this.socket.emit('sync-update', this.roomName, update);
      }
    });

    this.awareness.on('update', ({ added, updated, removed }: any, origin: any) => {
      if (origin !== this) {
        const changedClients = added.concat(updated).concat(removed);
        const update = encodeAwarenessUpdate(this.awareness, changedClients);
        this.socket.emit('awareness-update', this.roomName, update);
      }
    });

    // Gracefully remove this client from the network's awareness map when they close the physical window
    this.onBeforeUnload = () => {
      removeAwarenessStates(this.awareness, [this.doc.clientID], 'window unload');
    };
    window.addEventListener('beforeunload', this.onBeforeUnload);
  }

  destroy() {
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    removeAwarenessStates(this.awareness, [this.doc.clientID], 'local');
    this.socket.off('sync-update');
    this.socket.off('awareness-update');
  }
}
