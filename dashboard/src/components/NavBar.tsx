import { NavLink, type NavLinkProps } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { Switch } from './ui/switch';
import { useTheme } from '../contexts/theme-context';
import { cn } from '../lib/utils';

function NavItem({ to, end, children }: Pick<NavLinkProps, 'to' | 'end' | 'children'>) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'text-xs px-3 py-1.5 rounded-md tracking-wider transition-colors',
          isActive
            ? 'bg-primary/10 text-primary border border-primary/30'
            : 'text-muted-foreground hover:text-foreground',
        )
      }
    >
      {children}
    </NavLink>
  );
}

export default function NavBar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card">
      <span className="text-primary font-bold text-sm tracking-[0.2em] mr-4">NEO-AGENT</span>
      <NavItem to="/" end>
        Home
      </NavItem>
      <NavItem to="/board">Board</NavItem>
      <NavItem to="/geo">GEO-SEO</NavItem>
      <NavItem to="/cron">Cron</NavItem>
      <NavItem to="/skills">Skills</NavItem>
      <div className="ml-auto flex items-center gap-2">
        <Sun className="h-3.5 w-3.5 text-muted-foreground" />
        <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
        <Moon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
    </nav>
  );
}
