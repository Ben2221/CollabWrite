import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

type Board = {
  id: string;
  title: string;
  created_at: string;
};

export function Dashboard() {
  const { user, token, logout } = useAuth();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchBoards();
  }, []);

  const fetchBoards = async () => {
    try {
      const res = await fetch('https://collabwrite-ufp0.onrender.com/api/boards', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setBoards(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const createBoard = async () => {
    const title = prompt('Enter board title:');
    if (!title) return;

    try {
      const res = await fetch('https://collabwrite-ufp0.onrender.com/api/boards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title })
      });
      
      if (res.ok) {
        const data = await res.json();
        navigate(`/board/${data.id}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '60px 30px', animation: 'fadeIn 0.5s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '50px' }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '2.5rem', margin: '0 0 8px 0' }}>
            Welcome, <span className="gradient-text">{user?.username}</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '1.1rem' }}>Manage your collaborative workspaces</p>
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
          <button 
            onClick={createBoard}
            className="premium-button"
            style={{ width: 'auto', padding: '12px 24px' }}
          >
            <span style={{ marginRight: '8px' }}>+</span> New Board
          </button>
          <button 
            onClick={() => { logout(); navigate('/login'); }}
            style={{ padding: '12px 24px', backgroundColor: 'rgba(255,123,114,0.1)', color: 'var(--error)', border: '1px solid rgba(255,123,114,0.3)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontFamily: 'Outfit', fontWeight: 600, transition: 'all 0.2s' }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,123,114,0.2)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,123,114,0.1)'}
          >
            Logout
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <p>Loading your workspaces...</p>
        </div>
      ) : boards.length === 0 ? (
        <div className="premium-card" style={{ textAlign: 'center', padding: '80px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <div style={{ fontSize: '48px', opacity: 0.5 }}>📝</div>
          <h2 style={{ fontFamily: 'Outfit', margin: 0, color: 'var(--text-main)' }}>No boards yet</h2>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Create your first board to start collaborating with others in real-time.</p>
          <button onClick={createBoard} className="premium-button" style={{ width: 'auto', padding: '12px 30px', marginTop: '10px' }}>Create Board</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
          {boards.map((board, index) => (
            <Link 
              to={`/board/${board.id}`} 
              key={board.id}
              className="board-card"
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <h3>{board.title}</h3>
              <p>
                <span style={{ opacity: 0.7 }}>📄</span>
                {new Date(board.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
