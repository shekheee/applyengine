import { Button, PageSkeleton } from "@/components/ui";

export function ApplicationError({ message }: { message: string }) {
  return (
    <div
      className="rounded-[var(--radius-lg)] border border-red-500/30 bg-red-500/5 p-6 motion-safe:animate-fade-up"
      role="alert"
    >
      <p className="font-medium text-red-300">Could not load application</p>
      <p className="mt-1 text-sm text-red-300/80">{message}</p>
      <Button href="/" variant="outline" size="sm" className="mt-4">
        Back to pipeline
      </Button>
    </div>
  );
}

export function ApplicationLoading() {
  return <PageSkeleton />;
}
