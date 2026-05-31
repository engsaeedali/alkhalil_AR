"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

const SIZE_MAP = {
  sm: {
    box: "w-8 h-8",
    icon: 22,
    outerRing: "border-2",
    innerInset: "inset-1",
    innerRing: "border",
  },
  md: {
    box: "w-14 h-14",
    icon: 40,
    outerRing: "border-[3px]",
    innerInset: "inset-1.5",
    innerRing: "border-2",
  },
  lg: {
    box: "w-16 h-16",
    icon: 44,
    outerRing: "border-4",
    innerInset: "inset-1.5",
    innerRing: "border-2",
  },
} as const;

interface ProcessingBrandSpinnerProps {
  size?: keyof typeof SIZE_MAP;
  className?: string;
}

/** أيقونة «الخليل» داخل حلقات الدوران أثناء المعالجة */
export default function ProcessingBrandSpinner({
  size = "lg",
  className,
}: ProcessingBrandSpinnerProps) {
  const s = SIZE_MAP[size];

  return (
    <div className={cn("relative shrink-0", s.box, className)} aria-hidden>
      <div className={cn("absolute inset-0 rounded-full border-amber-500/10", s.outerRing)} />
      <div
        className={cn(
          "absolute inset-0 rounded-full border-t-amber-500 border-r-transparent border-b-transparent border-l-transparent animate-spin",
          s.outerRing,
        )}
      />
      <div
        className={cn(
          "absolute rounded-full border-emerald-500/10",
          s.innerInset,
          s.innerRing,
        )}
      />
      <div
        className={cn(
          "absolute rounded-full border-b-emerald-400 border-t-transparent border-r-transparent border-l-transparent animate-spin [animation-duration:1.2s] [animation-direction:reverse]",
          s.innerInset,
          s.innerRing,
        )}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative rounded-full overflow-hidden animate-pulse [animation-duration:2s]">
          <Image
            src="/icon.png"
            alt=""
            width={s.icon}
            height={s.icon}
            className="rounded-full object-cover"
            priority
          />
        </div>
      </div>
    </div>
  );
}
