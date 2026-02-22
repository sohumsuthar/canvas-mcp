import { config } from "dotenv";
config();

const CANVAS_TOKEN = process.env.CANVAS_TOKEN;
const CANVAS_DOMAIN = process.env.CANVAS_DOMAIN;

export function validateEnv(): void {
  const missing: string[] = [];
  if (!CANVAS_TOKEN) missing.push("CANVAS_TOKEN");
  if (!CANVAS_DOMAIN) missing.push("CANVAS_DOMAIN");
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        `Please create a .env file with these values. See .env.example for reference.`
    );
  }
}

export const BASE_URL = `https://${CANVAS_DOMAIN}/api/v1`;

export const AUTH_HEADERS: Record<string, string> = {
  Authorization: `Bearer ${CANVAS_TOKEN}`,
  "Content-Type": "application/json",
};

/**
 * Follows Canvas Link header pagination until all pages are fetched.
 */
export async function fetchAllPages<T>(initialUrl: string): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = initialUrl;

  while (url) {
    const response = await fetch(url, { headers: AUTH_HEADERS });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Canvas API error ${response.status} ${response.statusText}: ${body}`
      );
    }

    const data = (await response.json()) as T[];
    results.push(...data);

    // Parse Link header for next page
    const linkHeader = response.headers.get("Link");
    url = parseLinkNext(linkHeader);
  }

  return results;
}

/**
 * Single-page fetch returning typed JSON.
 */
export async function fetchOne<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: AUTH_HEADERS });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Canvas API error ${response.status} ${response.statusText}: ${body}`
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Parse the rel="next" URL from a Canvas Link header.
 * e.g. Link: <https://...?page=2>; rel="next", <https://...?page=5>; rel="last"
 */
function parseLinkNext(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const parts = linkHeader.split(",");
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

// ── Canvas types ─────────────────────────────────────────────────────────────

export interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  start_at: string | null;
  end_at: string | null;
  enrollment_state: string;
  workflow_state: string;
}

export interface CanvasAssignment {
  id: number;
  course_id: number;
  name: string;
  due_at: string | null;
  points_possible: number | null;
  submission_types: string[];
  has_submitted_submissions: boolean;
  workflow_state: string;
  // Populated when fetched with include[]=submission
  submission?: CanvasSubmission;
}

export interface CanvasFile {
  id: number;
  display_name: string;
  filename: string;
  content_type: string;
  size: number;
  url: string;
  created_at: string;
  updated_at: string;
  folder_id: number;
}

export interface CanvasPage {
  page_id: number;
  url: string;
  title: string;
  created_at: string;
  updated_at: string;
  body: string | null;
}

export interface CanvasSubmission {
  id: number;
  assignment_id: number;
  user_id: number;
  workflow_state: string;
  score: number | null;
  grade: string | null;
  submitted_at: string | null;
  assignment?: CanvasAssignment;
}

export interface CanvasEnrollment {
  id: number;
  course_id: number;
  type: string;
  computed_current_grade: string | null;
  computed_final_grade: string | null;
  computed_current_score: number | null;
  computed_final_score: number | null;
}

export interface CanvasCalendarEvent {
  id: number;
  title: string;
  start_at: string | null;
  end_at: string | null;
  description: string | null;
  context_code: string;
}

export interface CanvasModule {
  id: number;
  name: string;
  position: number;
  workflow_state: string;
  completed_at: string | null;
  items_count: number;
  items_url: string;
}

export interface CanvasModuleItem {
  id: number;
  title: string;
  type: string;
  completion_requirement?: {
    type: string;
    completed: boolean;
  };
  content_id?: number;
  url?: string;
  html_url?: string;
  page_url?: string;
}

export interface CanvasDiscussionTopic {
  id: number;
  title: string;
  message: string | null;
  posted_at: string | null;
  course_id?: number;
  context_code?: string;
}

export interface CanvasTodoItem {
  type: string;
  assignment?: CanvasAssignment;
  context_type: string;
  course_id?: number;
  ignore: string;
  ignore_permanently: string;
  html_url: string;
}
