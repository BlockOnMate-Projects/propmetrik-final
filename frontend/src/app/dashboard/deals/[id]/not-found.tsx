import Link from 'next/link';

export default function DealNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-6">
      <div className="text-center space-y-4">
        <div className="text-4xl">🔍</div>
        <h2 className="text-xl font-semibold text-zinc-100">Deal not found</h2>
        <p className="text-muted-foreground">This deal may have been deleted or you don't have access to it.</p>
        <Link
          href="/dashboard/deals"
          className="inline-block px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded-lg transition-colors"
        >
          Back to Deals
        </Link>
      </div>
    </div>
  );
}
