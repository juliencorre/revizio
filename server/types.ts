import type {
  AiJob,
  ChildProfile,
  LearningData,
  SessionUser,
} from "../src/domain/model";

export interface ServerOptions {
  dataDir?: string;
  staticDir?: string;
  ollamaUrl?: string;
  ollamaModel?: string;
  allowedOrigins?: string[];
  secureCookies?: boolean;
  sessionDays?: number;
  logger?: boolean;
  rateLimit?: boolean;
  aiClient?: AiClient;
}
export interface StoredProfile extends ChildProfile {
  familyId: string;
  pinHash: string;
}
export interface StoredUpload {
  id: string;
  familyId: string;
  profileId: string;
  name: string;
  mimeType: string;
  path: string;
  originalPath: string;
  rotation: number;
  size: number;
  createdAt: string;
}
export interface StoredJob extends AiJob {
  familyId: string;
  profileId: string;
  payload: Record<string, unknown>;
  updatedAt: string;
}
export interface AiSettings {
  baseUrl: string;
  model: string;
}
export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[];
}
export interface AiClient {
  available(settings: AiSettings): Promise<boolean>;
  json(
    settings: AiSettings,
    messages: AiMessage[],
    schema: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown>;
}
export interface AuthSession {
  user: SessionUser;
  tokenHash: string;
}
export interface DataEnvelope {
  data: LearningData;
  revision: number;
}
export function emptyLearningData(): LearningData {
  return {
    version: 1,
    courses: [],
    series: [],
    attempts: [],
    reviewedCourseIds: [],
    plans: [],
    english: { words: [], verbs: [], tenses: [], toolWords: [] },
    readingRecords: [],
    spacedReviews: [],
  };
}
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}
export const isoNow = () => new Date().toISOString();
