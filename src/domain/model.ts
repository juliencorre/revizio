export type Profile = 'child' | 'parent';
export type PublicationStatus = 'draft' | 'published';
export type IconName = 'sparkles' | 'book' | 'calculator' | 'globe' | 'languages' | 'leaf' | 'flask' | 'palette' | 'music' | 'activity' | 'cpu' | 'calendar' | 'camera' | 'upload' | 'check' | 'arrow-right' | 'arrow-left' | 'play' | 'chart' | 'file' | 'pencil' | 'shield' | 'plus' | 'close' | 'lightbulb' | 'volume' | 'clock' | 'home' | 'users' | 'chevron-right' | 'refresh' | 'menu' | 'trash';
export interface Subject { id: string; title: string; shortLabel: string; icon: IconName; color: string; }
export interface CourseSource { id: string; name: string; uri?: string; mimeType?: string; }
export interface RevisionSection { id: string; title: string; kind: 'essential' | 'vocabulary' | 'method' | 'warning'; content: string; example?: string; }
export interface Course { id: string; subjectId: string; title: string; description: string; status: PublicationStatus; updatedAt: string; sections: RevisionSection[]; sources: CourseSource[]; }
export interface Choice { id: string; label: string; }
export interface Question { id: string; prompt: string; choices: Choice[]; correctChoiceId: string; explanation: string; hint: string; concept: string; }
export interface ExerciseSeries { id: string; title: string; courseIds: string[]; subjectId: string; status: PublicationStatus; level: 'discovery' | 'practice' | 'challenge'; dueDate?: string; questions: Question[]; }
export interface Answer { questionId: string; choiceId: string; isCorrect: boolean; usedHint: boolean; answeredAt: string; }
export interface Attempt { id: string; seriesId: string; startedAt: string; completedAt?: string; answers: Answer[]; questions: Question[]; seriesTitle: string; subjectId: string; }
export interface LearningData { version: 1; courses: Course[]; series: ExerciseSeries[]; attempts: Attempt[]; reviewedCourseIds: string[]; }
export interface CourseDraftInput { subjectId: string; title: string; description?: string; sections?: RevisionSection[]; sources?: CourseSource[]; }
export type SeriesDraftInput = Omit<ExerciseSeries, 'id' | 'status'>;
