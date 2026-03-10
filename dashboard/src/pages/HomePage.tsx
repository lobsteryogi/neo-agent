import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <h1
        style={{
          fontSize: '3rem',
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          color: 'var(--text-primary)',
        }}
      >
        NEO-AGENT
      </h1>
      <p style={{ color: 'var(--text-dim)', fontSize: '1.2rem', fontStyle: 'italic' }}>
        "The Construct is loading..."
      </p>
      <Link
        to="/board"
        style={{
          marginTop: '20px',
          color: 'var(--text-primary)',
          border: '1px solid var(--text-primary)',
          borderRadius: 'var(--radius)',
          padding: '8px 20px',
          textDecoration: 'none',
          fontSize: '13px',
          letterSpacing: '0.1em',
        }}
      >
        OPEN TASK BOARD
      </Link>
    </div>
  );
}
