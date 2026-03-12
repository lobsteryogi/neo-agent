import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';

export default function HomePage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4">
      <h1 className="text-5xl font-bold tracking-[0.3em] uppercase text-primary">NEO-AGENT</h1>
      <p className="text-primary/50 text-lg italic">"The Construct is loading..."</p>
      <Button asChild variant="primary" size="lg" className="mt-4 tracking-widest">
        <Link to="/board">OPEN TASK BOARD</Link>
      </Button>
    </div>
  );
}
