import type { FlowStep } from "./step-indicator";

const MIN_JD_CHARS = 50;

export function useFlowSteps(profile: boolean, jobText: string, busy: boolean): FlowStep[] {
  const hasProfile = profile;
  const hasJob = jobText.trim().length >= MIN_JD_CHARS;

  let activeStep = 1;
  if (hasProfile && !hasJob) activeStep = 2;
  if (hasProfile && hasJob) activeStep = 3;
  if (busy) activeStep = 3;

  return [
    {
      id: 1,
      label: "Base resume",
      shortLabel: "Resume",
      status: hasProfile ? "complete" : activeStep === 1 ? "current" : "upcoming",
    },
    {
      id: 2,
      label: "Job description",
      shortLabel: "Job",
      status: hasJob
        ? "complete"
        : activeStep === 2
          ? "current"
          : hasProfile
            ? "current"
            : "upcoming",
    },
    {
      id: 3,
      label: "Analyze & open",
      shortLabel: "Analyze",
      status: busy ? "current" : hasProfile && hasJob ? "current" : "upcoming",
    },
  ];
}

export const JD_MIN_CHARS = MIN_JD_CHARS;
