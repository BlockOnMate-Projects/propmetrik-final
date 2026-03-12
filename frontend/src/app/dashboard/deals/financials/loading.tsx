export default function Loading() {
  return (
    <div className="p-6 space-y-4">
      <div className="h-8 w-48 bg-zinc-800 rounded animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-zinc-800/50 rounded-lg animate-pulse" />
        ))}
      </div>
      <div className="h-64 bg-zinc-800/30 rounded-lg animate-pulse" />
    </div>
  );
}
