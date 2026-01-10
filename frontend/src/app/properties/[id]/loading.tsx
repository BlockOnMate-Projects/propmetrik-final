
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      <div className="space-y-4">
        <Skeleton className="h-[400px] w-full rounded-xl" />
        <div className="flex gap-4">
           <Skeleton className="h-24 w-24 rounded-lg" />
           <Skeleton className="h-24 w-24 rounded-lg" />
           <Skeleton className="h-24 w-24 rounded-lg" />
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-8">
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-[400px] w-full rounded-xl" />
        </div>
        <div className="lg:col-span-1">
            <Skeleton className="h-[300px] w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
