import { useEffect, useRef, useState } from 'react';
import { EditorState, Extension } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { tags } from '@lezer/highlight';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import * as Y from 'yjs';
import { yCollab } from 'y-codemirror.next';
import { io } from 'socket.io-client';
import { SocketIOProvider } from '../y-socket-provider';

// Dark Mode Theme
const myTheme = EditorView.theme({
  "&": { color: "#c9d1d9", backgroundColor: "#0d1117" },
  ".cm-content": { caretColor: "#58a6ff" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "#58a6ff" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#1f3b5e !important" },
  ".cm-panels": { backgroundColor: "#0d1117", color: "#c9d1d9" },
  ".cm-panels.cm-panels-top": { borderBottom: "2px solid black" },
  ".cm-panels.cm-panels-bottom": { borderTop: "2px solid black" },
  ".cm-searchMatch": { backgroundColor: "#72a1ff59", outline: "1px solid #457dff" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#6199ff2f" },
  ".cm-activeLine": { backgroundColor: "#1e2430" },
  ".cm-selectionMatch": { backgroundColor: "#aafe661a" },
  "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": { backgroundColor: "#328c8252", outline: "1px solid #515a6b" },
  ".cm-gutters": { backgroundColor: "#0d1117", color: "#484f58", border: "none" },
  ".cm-activeLineGutter": { backgroundColor: "#1e2430" },
  ".cm-foldPlaceholder": { backgroundColor: "transparent", border: "none", color: "#ddd" },
  ".cm-tooltip": { border: "none", backgroundColor: "#1f2428" },
  ".cm-tooltip .cm-tooltip-arrow:before": { borderTopColor: "transparent", borderBottomColor: "transparent" },
  ".cm-tooltip .cm-tooltip-arrow:after": { borderTopColor: "#1f2428", borderBottomColor: "#1f2428" },
  ".cm-tooltip-autocomplete": { "& > ul > li[aria-selected]": { backgroundColor: "#24292e", color: "#c9d1d9" } }
}, { dark: true });

const myHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#ff7b72" },
  { tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName], color: "#79c0ff" },
  { tag: [tags.function(tags.variableName), tags.labelName], color: "#d2a8ff" },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: "#79c0ff" },
  { tag: [tags.definition(tags.name), tags.separator], color: "#c9d1d9" },
  { tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: "#ff7b72" },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link, tags.special(tags.string)], color: "#79c0ff" },
  { tag: [tags.meta, tags.comment], color: "#8b949e", fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "#8b949e", textDecoration: "underline" },
  { tag: tags.heading, fontWeight: "bold", color: "#79c0ff" },
  { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: "#c9d1d9" },
  { tag: [tags.processingInstruction, tags.string, tags.inserted], color: "#a5d6ff" },
  { tag: tags.invalid, color: "#f85149" },
]);

export function Editor({ onTextChange }: { onTextChange: (text: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // Connect to Backend Socket.io
    const socket = io('http://localhost:3001');

    // Setup Yjs Document
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('codemirror');

    // Subscribe to local YJS changes to update the preview window
    ytext.observe(() => {
      onTextChange(ytext.toString());
    });

    // Custom Socket.io provider
    const provider = new SocketIOProvider(socket, 'default', ydoc);
    
    // Configure user awareness
    const userColors = ['#ff7b72', '#79c0ff', '#d2a8ff', '#a5d6ff', '#ffa657', '#3fb950'];
    provider.awareness.setLocalStateField('user', {
      name: `User ${Math.floor(Math.random() * 1000)}`,
      color: userColors[Math.floor(Math.random() * userColors.length)],
      colorLight: userColors[Math.floor(Math.random() * userColors.length)] + '55'
    });

    socket.on('connect', () => {
      setSynced(true);
    });

    // CodeMirror Extensions
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown(),
      syntaxHighlighting(myHighlightStyle),
      myTheme,
      yCollab(ytext, provider.awareness, { undoManager: new Y.UndoManager(ytext) }),
      EditorView.lineWrapping,
      EditorView.updateListener.of((v) => {
        if (v.docChanged) {
          onTextChange(v.state.doc.toString());
        }
      })
    ];

    const state = EditorState.create({
      doc: ytext.toString(),
      extensions
    });

    const view = new EditorView({
      state,
      parent: containerRef.current
    });

    return () => {
      provider.destroy();
      socket.disconnect();
      view.destroy();
      ydoc.destroy();
    };
  }, []);

  return (
    <div className="editor-wrapper">
      <div className="status-bar">
        <span>●</span> {synced ? 'Connected (Synced)' : 'Connecting...'}
      </div>
      <div className="editor-container" ref={containerRef}></div>
    </div>
  );
}
