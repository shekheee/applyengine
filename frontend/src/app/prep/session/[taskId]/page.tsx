import { WorkSession } from "@/components/prep/work-session";

export default async function PrepSessionPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  return <WorkSession taskId={decodeURIComponent(taskId)} />;
}
