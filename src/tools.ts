import {
  BASE_URL,
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
} from "./canvas-client.js";

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
    `${BASE_URL}/courses/${courseId}/assignments?per_page=100&order_by=due_at`
  );

  if (assignments.length === 0) {
    return `No assignments found for course ${courseId}.`;
  }

  const lines = assignments.map((a) => {
    const overdue = isOverdue(a.due_at) ? " ⚠ OVERDUE" : "";
    return [
      `• [${a.id}] ${a.name}${overdue}`,
      `  Due: ${a.due_at ?? "No due date"}`,
      `  Points: ${a.points_possible ?? "N/A"}`,
      `  Types: ${a.submission_types.join(", ")}`,
      `  Submitted: ${a.has_submitted_submissions ? "Yes" : "No"}`,
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
          `${BASE_URL}/courses/${course.id}/assignments?per_page=100`
        );
        for (const a of assignments) {
          allAssignments.push({ ...a, course_name: course.name });
        }
      } catch {
        // Skip courses we can't access
      }
    })
  );

  // Sort by due_at ascending (null due dates go to the end)
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
    return [
      `• [Course: ${a.course_name}] ${a.name}${overdue}`,
      `  Due: ${a.due_at ?? "No due date"}`,
      `  Points: ${a.points_possible ?? "N/A"}  |  Submitted: ${a.has_submitted_submissions ? "Yes" : "No"}`,
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
          `${BASE_URL}/courses/${course.id}/assignments?per_page=100`
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

  const lines = upcoming.map((a) =>
    [
      `• [${a.course_name}] ${a.name}`,
      `  Due: ${a.due_at}`,
      `  Points: ${a.points_possible ?? "N/A"}  |  Submitted: ${a.has_submitted_submissions ? "Yes" : "No"}`,
    ].join("\n")
  );

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
  const [assignments, submissions] = await Promise.all([
    fetchAllPages<CanvasAssignment>(
      `${BASE_URL}/courses/${courseId}/assignments?per_page=100`
    ),
    fetchAllPages<CanvasSubmission>(
      `${BASE_URL}/courses/${courseId}/submissions?per_page=100&student_ids[]=self`
    ),
  ]);

  if (assignments.length === 0) {
    return `No assignments found for course ${courseId}.`;
  }

  const submissionMap = new Map<number, CanvasSubmission>();
  for (const s of submissions) {
    submissionMap.set(s.assignment_id, s);
  }

  const lines = assignments.map((a) => {
    const sub = submissionMap.get(a.id);
    const state = sub?.workflow_state ?? "unsubmitted";
    const stateEmoji =
      state === "graded"
        ? "✅"
        : state === "submitted" || state === "pending_review"
          ? "📤"
          : "❌";
    const overdue = isOverdue(a.due_at) && state === "unsubmitted" ? " ⚠ OVERDUE" : "";

    return [
      `${stateEmoji} ${a.name}${overdue}`,
      `   Status: ${state}  |  Due: ${a.due_at ?? "N/A"}`,
      sub?.score != null ? `   Score: ${sub.score}/${a.points_possible ?? "?"}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return `Submission Status for Course ${courseId} (${assignments.length} assignments):\n\n${lines.join("\n\n")}`;
}

export async function getGrades(courseId: number): Promise<string> {
  // Get enrollment for overall grade
  const enrollments = await fetchAllPages<CanvasEnrollment>(
    `${BASE_URL}/courses/${courseId}/enrollments?type[]=StudentEnrollment&user_id=self&per_page=100`
  );

  const enrollment = enrollments[0];

  // Get per-assignment submissions with grades
  const submissions = await fetchAllPages<CanvasSubmission>(
    `${BASE_URL}/courses/${courseId}/submissions?per_page=100&student_ids[]=self&include[]=assignment`
  );

  const graded = submissions.filter((s) => s.score != null);

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

  const lines = graded.map((s) => {
    const name = s.assignment?.name ?? `Assignment ${s.assignment_id}`;
    const possible = s.assignment?.points_possible;
    return `• ${name}: ${s.grade ?? s.score} ${possible != null ? `/ ${possible} pts` : ""}`;
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
      [`${stateIcon} Module: ${mod.name} (${mod.items_count} items)`, ...itemLines].join(
        "\n"
      )
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

  // Sort newest first
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
