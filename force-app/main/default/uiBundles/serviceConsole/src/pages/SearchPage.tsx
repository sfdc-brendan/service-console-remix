import { Search, config } from '@/features/search';

export default function SearchPage() {
  return (
    <div className="animate-rise space-y-4">
      <header>
        <h1 className="text-3xl font-semibold">Search</h1>
        <p className="text-sm text-muted-foreground">
          Find cases, contacts, and accounts across the org.
        </p>
      </header>
      <div className="rounded-xl border bg-card p-4">
        <Search config={config} />
      </div>
    </div>
  );
}
