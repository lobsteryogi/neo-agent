import { NavLink } from 'react-router-dom';

const linkStyle = (isActive: boolean): React.CSSProperties => ({
  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
  textDecoration: 'none',
  padding: '6px 14px',
  borderRadius: 'var(--radius)',
  background: isActive ? 'var(--accent-dim)' : 'transparent',
  transition: 'all 0.15s',
  fontSize: '13px',
  letterSpacing: '0.05em',
});

export default function NavBar() {
  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
      }}
    >
      <span
        style={{
          color: 'var(--text-primary)',
          fontWeight: 700,
          fontSize: '15px',
          letterSpacing: '0.15em',
          marginRight: '20px',
        }}
      >
        NEO-AGENT
      </span>
      <NavLink to="/" style={({ isActive }) => linkStyle(isActive)} end>
        Home
      </NavLink>
      <NavLink to="/board" style={({ isActive }) => linkStyle(isActive)}>
        Board
      </NavLink>
    </nav>
  );
}
