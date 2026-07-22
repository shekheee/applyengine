import { Skeleton } from "@/components/ui";

export function PipelineSkeleton() {
  return (
    <div className="page-enter space-y-8 motion-reduce:animate-none">
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-[var(--radius-lg)] border p-4"
            style={{ borderColor: "var(--border)" }}
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-8 w-16" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>

      <Skeleton className="h-16 w-full rounded-[var(--radius-lg)]" />

      <div className="flex gap-4 overflow-hidden">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="w-[260px] shrink-0 space-y-3">
            <Skeleton className="h-14 w-full rounded-[var(--radius-md)]" />
            <Skeleton className="h-28 w-full rounded-[var(--radius-md)]" />
            <Skeleton className="h-28 w-full rounded-[var(--radius-md)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
