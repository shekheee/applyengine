"use client";

import { InterviewPractice } from "@/components/interview-practice";

export default function InterviewPage() {
  return (
    <div className="iv-page pb-8">
      <style>{`
        .iv-page {
          --iv-section-gap: 2rem;
        }
        @media (prefers-reduced-motion: no-preference) {
          .iv-page .page-enter > * {
            animation: fade-up 0.4s ease-out both;
          }
          .iv-page .page-enter > *:nth-child(2) { animation-delay: 0.05s; }
          .iv-page .page-enter > *:nth-child(3) { animation-delay: 0.1s; }
          .iv-page .page-enter > *:nth-child(4) { animation-delay: 0.15s; }
        }
        @media (max-width: 640px) {
          .iv-page {
            overflow-x: hidden;
          }
        }
      `}</style>
      <InterviewPractice />
    </div>
  );
}
