"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/* ========== Types ========== */

export interface WizardStep {
  label: string;
  description?: string;
}

export interface WizardStepperProps {
  steps: WizardStep[];
  currentStep: number;
  className?: string;
}

/* ========== Pure Functions (exported for testing) ========== */

export type StepStatus = "completed" | "current" | "upcoming";

/**
 * Determine the status of a step given the current step index.
 */
export function getStepStatus(stepIndex: number, currentStep: number): StepStatus {
  if (stepIndex < currentStep) return "completed";
  if (stepIndex === currentStep) return "current";
  return "upcoming";
}

/**
 * Calculate the progress percentage (0–100) through the wizard.
 * Step 0 → 0%, last step → 100%.
 */
export function getProgressPercent(currentStep: number, totalSteps: number): number {
  if (totalSteps <= 1) return 100;
  const pct = Math.round((currentStep / (totalSteps - 1)) * 100);
  return Math.min(100, Math.max(0, pct));
}

/* ========== Component ========== */

export function WizardStepper({ steps, currentStep, className }: WizardStepperProps) {
  return (
    <nav
      aria-label="向导进度"
      className={cn("w-full", className)}
    >
      <ol className="flex items-center gap-0" role="list">
        {steps.map((step, index) => {
          const status = getStepStatus(index, currentStep);
          const isLast = index === steps.length - 1;

          return (
            <li
              key={step.label}
              className={cn("flex items-center", !isLast && "flex-1")}
            >
              {/* Step circle + label */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors",
                    status === "completed" &&
                      "bg-primary text-primary-foreground",
                    status === "current" &&
                      "border-2 border-primary bg-background text-primary",
                    status === "upcoming" &&
                      "border-2 border-muted-foreground/30 bg-background text-muted-foreground/50"
                  )}
                  aria-current={status === "current" ? "step" : undefined}
                >
                  {status === "completed" ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs text-center max-w-[80px] leading-tight",
                    status === "current"
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  className={cn(
                    "mx-2 h-0.5 flex-1 transition-colors",
                    index < currentStep
                      ? "bg-primary"
                      : "bg-muted-foreground/20"
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
