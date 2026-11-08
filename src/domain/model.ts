export type Profile = "child" | "parent";
export type PublicationStatus = "draft" | "published";
export type IconName =
  | "sparkles"
  | "book"
  | "calculator"
  | "globe"
  | "languages"
  | "leaf"
  | "flask"
  | "palette"
  | "music"
  | "activity"
  | "cpu"
  | "calendar"
  | "camera"
  | "upload"
  | "check"
  | "arrow-right"
  | "arrow-left"
  | "play"
  | "chart"
  | "file"
  | "pencil"
  | "shield"
  | "plus"
  | "close"
  | "lightbulb"
  | "volume"
  | "clock"
  | "home"
  | "users"
  | "chevron-right"
  | "refresh"
  | "menu"
  | "trash"
  | "settings"
  | "download"
  | "lock"
  | "logout"
  | "eye"
  | "eye-off"
  | "save"
  | "rotate"
  | "wifi"
  | "search"
  | "headphones";
export interface Subject {
  id: string;
  title: string;
  shortLabel: string;
  icon: IconName;
  color: string;
}
export interface CourseSource {
  id: string;
  name: string;
  uri?: string;
  mimeType?: string;
  storageId?: string;
  page?: number;
  rotation?: number;
  extractedText?: string;
  uncertain?: boolean;
  cachedUri?: string;
}
export interface SourceReference {
  sourceId: string;
  page?: number;
  excerpt?: string;
}
export interface LearningDiagram {
  type: "number-line" | "fraction" | "timeline";
  min?: number;
  max?: number;
  numerator?: number;
  denominator?: number;
  points?: { value: number; label: string }[];
}
export interface RevisionSection {
  id: string;
  title: string;
  kind: "essential" | "vocabulary" | "method" | "warning";
  content: string;
  example?: string;
  sourceRefs?: SourceReference[];
  diagram?: LearningDiagram;
}
export interface Course {
  id: string;
  subjectId: string;
  title: string;
  description: string;
  status: PublicationStatus;
  updatedAt: string;
  sections: RevisionSection[];
  sources: CourseSource[];
  sourceText?: string;
  originId?: string;
  revision?: number;
  profileId?: string;
  generationJobId?: string;
}
export interface Choice {
  id: string;
  label: string;
}
export type QuestionType =
  "single-choice" | "true-false" | "fill-blank" | "short-answer" | "problem";
export interface Question {
  id: string;
  prompt: string;
  choices: Choice[];
  correctChoiceId: string;
  explanation: string;
  hint: string;
  concept: string;
  type?: QuestionType;
  expectedAnswers?: string[];
  tolerance?: number;
  rubric?: string;
  sourceRefs?: SourceReference[];
}
export interface ExerciseSeries {
  id: string;
  title: string;
  courseIds: string[];
  subjectId: string;
  status: PublicationStatus;
  level: "discovery" | "practice" | "challenge";
  dueDate?: string;
  questions: Question[];
  mode?: "practice" | "exam";
  timeLimitSeconds?: number;
  profileId?: string;
  generationJobId?: string;
}
export interface Answer {
  questionId: string;
  choiceId: string;
  isCorrect: boolean;
  usedHint: boolean;
  answeredAt: string;
  response?: string;
}
export interface Attempt {
  id: string;
  seriesId: string;
  startedAt: string;
  completedAt?: string;
  answers: Answer[];
  questions: Question[];
  seriesTitle: string;
  subjectId: string;
  profileId?: string;
  mode?: "practice" | "exam";
  deadlineAt?: string;
  submittedAt?: string;
  planId?: string;
  stepId?: string;
}
export interface LearningData {
  version: 1;
  courses: Course[];
  series: ExerciseSeries[];
  attempts: Attempt[];
  reviewedCourseIds: string[];
  plans?: RevisionPlan[];
  english?: EnglishSettings;
  readingRecords?: ReadingRecord[];
  spacedReviews?: SpacedReview[];
}
export interface CourseDraftInput {
  subjectId: string;
  title: string;
  description?: string;
  sections?: RevisionSection[];
  sources?: CourseSource[];
  sourceText?: string;
  originId?: string;
  revision?: number;
  generationJobId?: string;
}
export type SeriesDraftInput = Omit<ExerciseSeries, "id" | "status">;

export interface PlanStep {
  id: string;
  date: string;
  title: string;
  kind: "read" | "practice" | "mistakes" | "mock" | "summary";
  minutes: number;
  courseIds: string[];
  seriesId?: string;
  completedAt?: string;
}
export interface RevisionPlan {
  id: string;
  title: string;
  subjectId: string;
  examDate: string;
  courseIds: string[];
  dailyMinutes: number;
  status: PublicationStatus;
  steps: PlanStep[];
}
export type PlanDraftInput = Omit<RevisionPlan, "id" | "status">;
export interface EnglishWord {
  id: string;
  en: string;
  fr: string;
}
export interface EnglishVerb {
  id: string;
  base: string;
  past: string;
  participle: string;
  meaning: string;
}
export interface EnglishSettings {
  words: EnglishWord[];
  verbs: EnglishVerb[];
  tenses: string[];
  toolWords: string[];
}
export interface ChildProfile {
  id: string;
  name: string;
  grade: string;
  needsPin?: boolean;
}
export interface SessionUser {
  id: string;
  familyId: string;
  role: Profile;
  profileId?: string;
  name: string;
  email?: string;
}
export interface ReadingRecord {
  courseId: string;
  reviewedAt: string;
}
export interface SpacedReview {
  courseId: string;
  dueDate: string;
  interval: number;
  lastReviewedAt?: string;
}
export interface AiJob {
  id: string;
  profileId?: string;
  input?: Record<string, unknown>;
  kind: "course" | "exercises" | "english";
  status: "queued" | "running" | "succeeded" | "failed";
  stage?: string;
  message?: string;
  createdAt: string;
  result?: {
    course?: Partial<Course>;
    questions?: Question[];
    words?: EnglishWord[];
    verbs?: EnglishVerb[];
    tenses?: string[];
    toolWords?: string[];
  };
  error?: string;
}
