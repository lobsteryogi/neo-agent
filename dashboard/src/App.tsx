export default function App() {
  return (
    <div
      style={{
        background: '#0a0a0a',
        color: '#00ff41',
        fontFamily: "'Fira Code', 'Cascadia Code', monospace",
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
      }}
    >
      <h1 style={{ fontSize: '3rem', letterSpacing: '0.3em', textTransform: 'uppercase' }}>
        NEO-AGENT
      </h1>
      <p style={{ color: '#00ff4180', fontSize: '1.2rem', fontStyle: 'italic' }}>
        "The Construct is loading..."
      </p>
      <p style={{ color: '#333', marginTop: '2rem', fontSize: '0.9rem' }}>
        Full dashboard coming in Phase 4
      </p>
    </div>
  );
}
