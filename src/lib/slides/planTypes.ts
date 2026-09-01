import type { SlidesOutline } from "@/lib/slidesOutlineParser";

export type SlidesPlanStage =
  | "planning"
  | "researching"
  | "reviewing"
  | "generating"
  | "done";

export interface SlidesSourceFile {
  name: string;
  chars: number;
}

export interface SlidesResearchState {
  jobId?: string;
  status?: string;
  summary?: string;
  sources?: { title: string; url: string }[];
}

export interface SlidesSlideContent {
  title: string;
  body: string;
}

/**
 * Full state of the staged slides workflow that lives on one assistant
 * message: plan → (optional deep research) → content review → generation.
 */
export interface SlidesPlanState {
  topic: string;
  templateId: string;
  language: "ar" | "en";
  outline: SlidesOutline;
  stage: SlidesPlanStage;
  research?: SlidesResearchState;
  sourceFiles?: SlidesSourceFile[];
  /** Extracted text from user-attached files, used as grounding data. */
  sourceText?: string;
  /** Fully written slide content produced in the review step. */
  content?: SlidesSlideContent[];
}
