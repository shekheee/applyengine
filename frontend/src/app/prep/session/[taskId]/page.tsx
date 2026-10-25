import { WorkSession } from "@/components/prep/work-session";

export default async function PrepSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ taskId: string }>;
  searchParams: Promise<{ checkpoint?: string }>;
}) {
  const { taskId } = await params;
  const { checkpoint } = await searchParams;
  const runId = Number(checkpoint);
  return (
    <WorkSession
      taskId={decodeURIComponent(taskId)}
      checkpointRunId={Number.isInteger(runId) && runId > 0 ? runId : null}
    />
  );
}
