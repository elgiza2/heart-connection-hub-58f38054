export type DocsPlanStage =
  | "planning"
  | "researching"
  | "reviewing"
  | "generating"
  | "done";

export interface DocsSourceFile {
  name: string;
  chars: number;
}

export interface DocsResearchState {
  jobId?: string;
  status?: string;
  summary?: string;
  sources?: { title: string; url: string }[];
}

export interface DocsSection {
  title: string;
  points: string[];
}

export interface DocsSectionContent {
  title: string;
  body: string;
}

/**
 * Full state of the staged docs workflow living on one assistant message:
 * plan → (optional deep research) → content review → clean writing/generation.
 */
export interface DocsPlanState {
  topic: string;
  docType: string;
  language: "ar" | "en";
  sections: DocsSection[];
  stage: DocsPlanStage;
  research?: DocsResearchState;
  sourceFiles?: DocsSourceFile[];
  /** Extracted text from user-attached files, used as grounding data. */
  sourceText?: string;
  /** Written content per section, produced in the review step. */
  content?: DocsSectionContent[];
  /** Artifact id of a previously generated document being revised. */
  previousArtifactId?: string;
}
