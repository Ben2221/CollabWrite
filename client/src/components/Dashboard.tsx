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
    <div style={{ maxWidth: '800px', margin: '50px auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div>
          <h1 style={{ color: '#c9d1d9', margin: 0 }}>Welcome, {user?.username}</h1>
          <p style={{ color: '#8b949e', margin: '5px 0 0 0' }}>Your Collaborative Boards</p>
        </div>
        <div>
          <button 
            onClick={createBoard}
            style={{ padding: '8px 16px', backgroundColor: '#238636', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginRight: '10px' }}
          >
            + New Board
          </button>
          <button 
            onClick={() => { logout(); navigate('/login'); }}
            style={{ padding: '8px 16px', backgroundColor: 'transparent', color: '#ff7b72', border: '1px solid #ff7b72', borderRadius: '4px', cursor: 'pointer' }}
          >
            Logout
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: '#8b949e' }}>Loading boards...</p>
      ) : boards.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px', border: '1px dashed #30363d', borderRadius: '8px', color: '#8b949e' }}>
          No boards found. Create your first board to get started!
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
          {boards.map(board => (
            <Link 
              to={`/board/${board.id}`} 
              key={board.id}
              style={{ display: 'block', padding: '20px', backgroundColor: '#0d1117', border: '1px solid #30363d', borderRadius: '8px', textDecoration: 'none', transition: 'border-color 0.2s' }}
              onMouseOver={(e) => e.currentTarget.style.borderColor = '#8b949e'}
              onMouseOut={(e) => e.currentTarget.style.borderColor = '#30363d'}
            >
              <h3 style={{ color: '#58a6ff', margin: '0 0 10px 0' }}>{board.title}</h3>
              <p style={{ color: '#8b949e', margin: 0, fontSize: '12px' }}>
                Created: {new Date(board.created_at).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
