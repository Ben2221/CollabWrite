import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Editor } from './components/Editor';

function App() {
  const [markdown, setMarkdown] = useState('');

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <span className="logo-icon" style={{ fontSize: '24px' }}>📝</span>
          <h1>CollabWrite</h1>
        </div>
        <div className="header-actions">
          <button className="share-btn">
            <span style={{ fontSize: '16px' }}>🔗</span>
            <span>Share</span>
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
            <Editor onTextChange={setMarkdown} />
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

export default App;
