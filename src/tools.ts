import * as pdfParseModule from "pdf-parse";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = (pdfParseModule as any).default ?? pdfParseModule;
import {
  BASE_URL,
  AUTH_HEADERS,
  fetchAllPages,
  fetchOne,
  CanvasCourse,
  CanvasAssignment,
  CanvasSubmission,
  CanvasEnrollment,
  CanvasCalendarEvent,
  CanvasModule,
  CanvasModuleItem,
  CanvasDiscussionTopic,
  CanvasTodoItem,
  CanvasFile,
  CanvasPage,
} from "./canvas-client.js";

// ── PDF helper ────────────────────────────────────────────────────────────────

async function parsePdfFromUrl(url: string): Promise<string> {
  const response = await fetch(url, { headers: AUTH_HEADERS });
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const data = await pdfParse(buffer);
  return data.text.replace(/\n{3,}/g, "\n\n").trim();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isOverdue(dueAt: string | null): boolean {
  if (!dueAt) return false;
  return new Date(dueAt) < new Date();
}

function daysFromNow(dueAt: string | null, days: number): boolean {
  if (!dueAt) return false;
  const due = new Date(dueAt);
  const now = new Date();
  const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return due >= now && due <= cutoff;
}

async function getActiveCourses(): Promise<CanvasCourse[]> {
  const courses = await fetchAllPages<CanvasCourse>(
    `${BASE_URL}/courses?enrollment_state=active&state[]=available&per_page=100`
  );
  return courses.filter((c) => c.workflow_state === "available");
}

/**
 * Returns the correct submission status for the current user.
 * Uses the `submission` object included via include[]=submission,
 * NOT `has_submitted_submissions` which is an instructor aggregate field.
 */
function submissionStatus(a: CanvasAssignment): {
  label: string;
  submitted: boolean;
  state: string;
} {
  const sub = a.submission;
  if (!sub || sub.workflow_state === "unsubmitted" || sub.submitted_at === null) {
    return { label: "Not submitted", submitted: false, state: "unsubmitted" };
  }
  if (sub.workflow_state === "graded") {
    return { label: `Graded (${sub.score ?? "?"} pts)`, submitted: true, state: "graded" };
  }
  if (sub.workflow_state === "pending_review") {
    return { label: "Submitted (pending review)", submitted: true, state: "pending_review" };
  }
  return { label: "Submitted", submitted: true, state: sub.workflow_state };
}

// ── Tool implementations ─────────────────────────────────────────────────────

export async function getCourses(): Promise<string> {
  const courses = await getActiveCourses();

  if (courses.length === 0) {
    return "No active courses found.";
  }

  const lines = courses.map((c) =>
    [
      `• [${c.id}] ${c.name} (${c.course_code})`,
      `  Start: ${c.start_at ?? "N/A"}  |  End: ${c.end_at ?? "N/A"}`,
    ].join("\n")
  );

  return `Active Courses (${courses.length}):\n\n${lines.join("\n\n")}`;
}

export async function getAssignments(courseId: number): Promise<string> {
  const assignments = await fetchAllPages<CanvasAssignment>(
    `${BASE_URL}/courses/${courseId}/assignments?per_page=100&order_by=due_at&include[]=submission`
  );

  if (assignments.length === 0) {
    return `No assignments found for course ${courseId}.`;
  }

  const lines = assignments.map((a) => {
    const overdue = isOverdue(a.due_at) ? " ⚠ OVERDUE" : "";
    const { label } = submissionStatus(a);
    return [
      `• [${a.id}] ${a.name}${overdue}`,
      `  Due: ${a.due_at ?? "No due date"}`,
      `  Points: ${a.points_possible ?? "N/A"}`,
      `  Types: ${a.submission_types.join(", ")}`,
      `  Status: ${label}`,
    ].join("\n");
  });

  return `Assignments for Course ${courseId} (${assignments.length} total):\n\n${lines.join("\n\n")}`;
}

export async function getAllAssignments(): Promise<string> {
  const courses = await getActiveCourses();

  if (courses.length === 0) {
    return "No active courses found.";
  }

  const allAssignments: Array<CanvasAssignment & { course_name: string }> = [];

  await Promise.all(
    courses.map(async (course) => {
      try {
        const assignments = await fetchAllPages<CanvasAssignment>(
          `${BASE_URL}/courses/${course.id}/assignments?per_page=100&include[]=submission`
        );
        for (const a of assignments) {
          allAssignments.push({ ...a, course_name: course.name });
        }
      } catch {
        // Skip courses we can't access
      }
    })
  );

  allAssignments.sort((a, b) => {
    if (!a.due_at && !b.due_at) return 0;
    if (!a.due_at) return 1;
    if (!b.due_at) return -1;
    return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
  });

  if (allAssignments.length === 0) {
    return "No assignments found across any active courses.";
  }

  const lines = allAssignments.map((a) => {
    const overdue = isOverdue(a.due_at) ? " ⚠ OVERDUE" : "";
    const { label } = submissionStatus(a);
    return [
      `• [Course: ${a.course_name}] ${a.name}${overdue}`,
      `  Due: ${a.due_at ?? "No due date"}`,
      `  Points: ${a.points_possible ?? "N/A"}  |  Status: ${label}`,
    ].join("\n");
  });

  return `All Assignments Across Active Courses (${allAssignments.length} total):\n\n${lines.join("\n\n")}`;
}

export async function getUpcomingAssignments(days: number = 7): Promise<string> {
  const courses = await getActiveCourses();

  if (courses.length === 0) {
    return "No active courses found.";
  }

  const upcoming: Array<CanvasAssignment & { course_name: string }> = [];

  await Promise.all(
    courses.map(async (course) => {
      try {
        const assignments = await fetchAllPages<CanvasAssignment>(
          `${BASE_URL}/courses/${course.id}/assignments?per_page=100&include[]=submission`
        );
        for (const a of assignments) {
          if (daysFromNow(a.due_at, days)) {
            upcoming.push({ ...a, course_name: course.name });
          }
        }
      } catch {
        // Skip inaccessible courses
      }
    })
  );

  upcoming.sort((a, b) => {
    if (!a.due_at || !b.due_at) return 0;
    return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
  });

  if (upcoming.length === 0) {
    return `No assignments due in the next ${days} day(s).`;
  }

  const lines = upcoming.map((a) => {
    const { label, submitted } = submissionStatus(a);
    const icon = submitted ? "✅" : "❌";
    return [
      `${icon} [${a.course_name}] ${a.name}`,
      `  Due: ${a.due_at}`,
      `  Points: ${a.points_possible ?? "N/A"}  |  Status: ${label}`,
    ].join("\n");
  });

  return `Assignments Due in the Next ${days} Day(s) (${upcoming.length} total):\n\n${lines.join("\n\n")}`;
}

export async function getCalendarEvents(): Promise<string> {
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const events = await fetchAllPages<CanvasCalendarEvent>(
    `${BASE_URL}/calendar_events?type=event&start_date=${now}&end_date=${future}&per_page=100`
  );

  if (events.length === 0) {
    return "No upcoming calendar events found in the next 30 days.";
  }

  events.sort((a, b) => {
    if (!a.start_at || !b.start_at) return 0;
    return new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
  });

  const lines = events.map((e) =>
    [
      `• ${e.title}`,
      `  Start: ${e.start_at ?? "N/A"}  |  End: ${e.end_at ?? "N/A"}`,
      e.description
        ? `  Description: ${e.description.replace(/<[^>]*>/g, "").slice(0, 200)}`
        : null,
    ]
      .filter(Boolean)
      .join("\n")
  );

  return `Upcoming Calendar Events (${events.length}):\n\n${lines.join("\n\n")}`;
}

export async function getSubmissionStatus(courseId: number): Promise<string> {
  const assignments = await fetchAllPages<CanvasAssignment>(
    `${BASE_URL}/courses/${courseId}/assignments?per_page=100&include[]=submission`
  );

  if (assignments.length === 0) {
    return `No assignments found for course ${courseId}.`;
  }

  const lines = assignments.map((a) => {
    const { label, submitted, state } = submissionStatus(a);
    const stateEmoji = state === "graded" ? "✅" : submitted ? "📤" : "❌";
    const overdue = isOverdue(a.due_at) && !submitted ? " ⚠ OVERDUE" : "";

    return [
      `${stateEmoji} ${a.name}${overdue}`,
      `   Status: ${label}  |  Due: ${a.due_at ?? "N/A"}`,
      a.points_possible != null ? `   Points: ${a.points_possible}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return `Submission Status for Course ${courseId} (${assignments.length} assignments):\n\n${lines.join("\n\n")}`;
}

export async function getGrades(courseId: number): Promise<string> {
  const enrollments = await fetchAllPages<CanvasEnrollment>(
    `${BASE_URL}/courses/${courseId}/enrollments?type[]=StudentEnrollment&user_id=self&per_page=100`
  );

  const enrollment = enrollments[0];

  const assignments = await fetchAllPages<CanvasAssignment>(
    `${BASE_URL}/courses/${courseId}/assignments?per_page=100&include[]=submission`
  );

  const graded = assignments.filter(
    (a) => a.submission?.score != null && a.submission.submitted_at !== null
  );

  const header = enrollment
    ? [
        `Course ${courseId} Grades:`,
        `  Current Grade: ${enrollment.computed_current_grade ?? "N/A"} (${enrollment.computed_current_score ?? "N/A"}%)`,
        `  Final Grade:   ${enrollment.computed_final_grade ?? "N/A"} (${enrollment.computed_final_score ?? "N/A"}%)`,
        "",
      ].join("\n")
    : `Course ${courseId} Grades:\n`;

  if (graded.length === 0) {
    return header + "No graded assignments yet.";
  }

  const lines = graded.map((a) => {
    const score = a.submission?.score;
    const grade = a.submission?.grade;
    return `• ${a.name}: ${grade ?? score} ${a.points_possible != null ? `/ ${a.points_possible} pts` : ""}`;
  });

  return header + `Per-Assignment Scores (${graded.length}):\n\n${lines.join("\n")}`;
}

export async function getCourseModules(courseId: number): Promise<string> {
  const modules = await fetchAllPages<CanvasModule>(
    `${BASE_URL}/courses/${courseId}/modules?per_page=100&include[]=items&include[]=content_details`
  );

  if (modules.length === 0) {
    return `No modules found for course ${courseId}.`;
  }

  const sections: string[] = [];

  for (const mod of modules) {
    const stateIcon =
      mod.workflow_state === "completed"
        ? "✅"
        : mod.workflow_state === "unlocked"
          ? "🔓"
          : "🔒";

    let items: CanvasModuleItem[] = [];
    try {
      items = await fetchAllPages<CanvasModuleItem>(
        `${BASE_URL}/courses/${courseId}/modules/${mod.id}/items?per_page=100`
      );
    } catch {
      // ignore
    }

    const itemLines = items.map((item) => {
      const done = item.completion_requirement?.completed ? "✅" : "⬜";
      return `    ${done} ${item.title} [${item.type}]`;
    });

    sections.push(
      [`${stateIcon} Module: ${mod.name} (${mod.items_count} items)`, ...itemLines].join("\n")
    );
  }

  return `Modules for Course ${courseId} (${modules.length} modules):\n\n${sections.join("\n\n")}`;
}

export async function getAnnouncements(): Promise<string> {
  const courses = await getActiveCourses();

  if (courses.length === 0) {
    return "No active courses found.";
  }

  const contextCodes = courses.map((c) => `course_${c.id}`).join("&context_codes[]=");
  const announcements = await fetchAllPages<CanvasDiscussionTopic>(
    `${BASE_URL}/announcements?context_codes[]=${contextCodes}&per_page=100`
  );

  if (announcements.length === 0) {
    return "No recent announcements found.";
  }

  announcements.sort((a, b) => {
    if (!a.posted_at || !b.posted_at) return 0;
    return new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime();
  });

  const lines = announcements.slice(0, 20).map((a) => {
    const body = a.message
      ? a.message.replace(/<[^>]*>/g, "").trim().slice(0, 300)
      : "No content";
    return [
      `• ${a.title}`,
      `  Posted: ${a.posted_at ?? "N/A"}`,
      `  ${body}`,
    ].join("\n");
  });

  return `Recent Announcements (showing up to 20):\n\n${lines.join("\n\n")}`;
}

export async function getTodoItems(): Promise<string> {
  const todos = await fetchAllPages<CanvasTodoItem>(
    `${BASE_URL}/users/self/todo?per_page=100`
  );

  if (todos.length === 0) {
    return "Your Canvas to-do list is empty.";
  }

  const lines = todos.map((t) => {
    const a = t.assignment;
    if (a) {
      const overdue = isOverdue(a.due_at) ? " ⚠ OVERDUE" : "";
      return [
        `• [${t.type}] ${a.name}${overdue}`,
        `  Due: ${a.due_at ?? "N/A"}  |  Course ID: ${t.course_id ?? "N/A"}`,
        `  Points: ${a.points_possible ?? "N/A"}`,
      ].join("\n");
    }
    return `• [${t.type}] ${t.context_type} — ${t.html_url}`;
  });

  return `Canvas To-Do Items (${todos.length}):\n\n${lines.join("\n\n")}`;
}

export async function getCourseFiles(courseId: number): Promise<string> {
  const files = await fetchAllPages<CanvasFile>(
    `${BASE_URL}/courses/${courseId}/files?per_page=100&sort=updated_at&order=desc`
  );

  if (files.length === 0) {
    return `No files found for course ${courseId}.`;
  }

  const lines = files.map((f) => {
    const sizeMb = (f.size / 1024 / 1024).toFixed(2);
    return [
      `• [${f.id}] ${f.display_name}`,
      `  Type: ${f.content_type}  |  Size: ${sizeMb} MB`,
      `  Updated: ${f.updated_at}`,
      `  URL: ${f.url}`,
    ].join("\n");
  });

  return `Files for Course ${courseId} (${files.length} total):\n\n${lines.join("\n\n")}`;
}

export async function getCoursePages(courseId: number): Promise<string> {
  const pages = await fetchAllPages<CanvasPage>(
    `${BASE_URL}/courses/${courseId}/pages?per_page=100&sort=updated_at&order=desc`
  );

  if (pages.length === 0) {
    return `No pages found for course ${courseId}.`;
  }

  const lines = pages.map((p) =>
    [
      `• [${p.url}] ${p.title}`,
      `  Updated: ${p.updated_at}`,
    ].join("\n")
  );

  return `Pages for Course ${courseId} (${pages.length} total):\n\n${lines.join("\n\n")}`;
}

export async function getPageContent(courseId: number, pageUrl: string): Promise<string> {
  const page = await fetchOne<CanvasPage>(
    `${BASE_URL}/courses/${courseId}/pages/${pageUrl}`
  );

  const body = page.body
    ? page.body.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim()
    : "No content";

  return [
    `Page: ${page.title}`,
    `Course: ${courseId}`,
    `Updated: ${page.updated_at}`,
    ``,
    body,
  ].join("\n");
}

export async function getModuleItemContent(courseId: number, moduleName: string): Promise<string> {
  // Find module matching the name (case-insensitive substring match)
  const modules = await fetchAllPages<CanvasModule>(
    `${BASE_URL}/courses/${courseId}/modules?per_page=100`
  );

  const matches = modules.filter((m) =>
    m.name.toLowerCase().includes(moduleName.toLowerCase())
  );

  if (matches.length === 0) {
    const names = modules.map((m) => m.name).join(", ");
    return `No module matching "${moduleName}" found in course ${courseId}.\n\nAvailable modules: ${names}`;
  }

  const results: string[] = [];

  for (const mod of matches) {
    const items = await fetchAllPages<CanvasModuleItem>(
      `${BASE_URL}/courses/${courseId}/modules/${mod.id}/items?per_page=100`
    );

    results.push(`=== Module: ${mod.name} ===`);

    for (const item of items) {
      results.push(`\n--- ${item.title} [${item.type}] ---`);

      if (item.type === "Page" && item.page_url) {
        try {
          const page = await fetchOne<CanvasPage>(
            `${BASE_URL}/courses/${courseId}/pages/${item.page_url}`
          );
          const body = page.body
            ? page.body
                .replace(/<[^>]*>/g, "")
                .replace(/&nbsp;/g, " ")
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/\n{3,}/g, "\n\n")
                .trim()
            : "No content";
          results.push(body);
        } catch {
          results.push("(Could not load page content)");
        }
      } else if (item.type === "File" && item.content_id) {
        try {
          const file = await fetchOne<CanvasFile>(
            `${BASE_URL}/courses/${courseId}/files/${item.content_id}`
          );
          results.push(`File: ${file.display_name} (${file.content_type}, ${(file.size / 1024).toFixed(1)} KB)`);
          if (file.content_type === "application/pdf") {
            try {
              const text = await parsePdfFromUrl(file.url);
              results.push(`\n[PDF Content]\n${text}`);
            } catch (e) {
              results.push(`(PDF parsing failed: ${e instanceof Error ? e.message : String(e)})`);
            }
          } else {
            results.push(`Download: ${file.url}`);
          }
        } catch {
          results.push("(Could not load file info)");
        }
      } else if (item.html_url) {
        results.push(`Link: ${item.html_url}`);
      }
    }
  }

  return results.join("\n");
}

export async function readCourseFile(courseId: number, fileId: number): Promise<string> {
  const file = await fetchOne<CanvasFile>(
    `${BASE_URL}/courses/${courseId}/files/${fileId}`
  );

  if (file.content_type === "application/pdf") {
    const text = await parsePdfFromUrl(file.url);
    return [
      `File: ${file.display_name}`,
      `Type: PDF  |  Size: ${(file.size / 1024).toFixed(1)} KB`,
      `Updated: ${file.updated_at}`,
      ``,
      text,
    ].join("\n");
  }

  // For non-PDF files just return metadata
  return [
    `File: ${file.display_name}`,
    `Type: ${file.content_type}  |  Size: ${(file.size / 1024).toFixed(1)} KB`,
    `Updated: ${file.updated_at}`,
    `Download URL: ${file.url}`,
    `(Only PDF files can be parsed into text. This file type cannot be read directly.)`,
  ].join("\n");
}
