import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Editor } from './Editor';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function Workspace() {
  const [markdown, setMarkdown] = useState('');
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();

  // Use a fallback just in case, though the route matches /board/:id
  const boardId = id || 'default';
  
  useEffect(() => {
    if (!token || !boardId || boardId === 'default') return;
    
    // Register that this user has accessed the board
    fetch(`https://collabwrite-ufp0.onrender.com/api/boards/${boardId}/join`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }).catch(console.error);
  }, [boardId, token]);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <Link to="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="logo-icon" style={{ fontSize: '24px' }}>📝</span>
            <h1>CollabWrite</h1>
          </Link>
          <span style={{ color: '#8b949e', fontSize: '14px', borderLeft: '1px solid #30363d', paddingLeft: '15px' }}>
            Board ID: {boardId.slice(0, 8)}...
          </span>
        </div>
        <div className="header-actions">
          <button 
            className="share-btn"
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              alert('Link copied to clipboard!');
            }}
          >
            <span style={{ fontSize: '16px' }}>🔗</span>
            <span>Share Link</span>
          </button>
        </div>
      </header>

      <main className="main-content">
        <div className="editor-pane pane">
          <div className="pane-header">
            <span className="pane-icon" style={{ fontSize: '16px' }}>📄</span>
            <h2>Markdown Input</h2>
          </div>
          <div className="pane-content">
            <Editor boardId={boardId} username={user?.username || 'Guest'} onTextChange={setMarkdown} />
          </div>
        </div>

        <div className="preview-pane pane">
          <div className="pane-header">
            <div className="live-badge"></div>
            <h2>Live Preview</h2>
          </div>
          <div className="pane-content preview-content">
            {markdown ? (
              <ReactMarkdown>{markdown}</ReactMarkdown>
            ) : (
              <div className="empty-state">Start typing to see preview...</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
