import Image from "next/image";
import { cn } from "@/components/ui";

const ICONS = {
  chat: "/icons/chat.svg",
  resume: "/icons/resume.svg",
  interview: "/icons/interview.svg",
  spark: "/icons/spark.svg",
  company: "/icons/company.svg",
} as const;

export type AppIconName = keyof typeof ICONS;

export function AppIcon({
  name,
  size = 20,
  className,
}: {
  name: AppIconName;
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={ICONS[name]}
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-hidden
    />
  );
}
