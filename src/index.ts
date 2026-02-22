import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { validateEnv } from "./canvas-client.js";
import {
  getCourses,
  getAssignments,
  getAllAssignments,
  getUpcomingAssignments,
  getCalendarEvents,
  getSubmissionStatus,
  getGrades,
  getCourseModules,
  getAnnouncements,
  getTodoItems,
  getCourseFiles,
  getCoursePages,
  getPageContent,
  getModuleItemContent,
  readCourseFile,
} from "./tools.js";

// Validate env vars immediately on startup
validateEnv();

const server = new Server(
  { name: "canvas-mcp", version: "1.1.0" },
  { capabilities: { tools: {} } }
);

// ── Tool definitions ──────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_courses",
      description:
        "Fetch all active enrolled Canvas courses including id, name, course_code, start_at, and end_at.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "get_assignments",
      description:
        "Fetch all assignments for a specific Canvas course. Returns name, due_at, points_possible, submission_types, and the student's personal submission status (submitted/graded/unsubmitted).",
      inputSchema: {
        type: "object",
        properties: {
          course_id: { type: "number", description: "The Canvas course ID." },
        },
        required: ["course_id"],
      },
    },
    {
      name: "get_all_assignments",
      description:
        "Fetch every assignment across all active courses sorted by due_at ascending. Shows each student's personal submission status. Overdue unsubmitted assignments are flagged.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "get_upcoming_assignments",
      description:
        "Fetch assignments due within the next N days (default 7) across all active courses. Shows accurate per-student submission status.",
      inputSchema: {
        type: "object",
        properties: {
          days: { type: "number", description: "Number of days to look ahead (default: 7)." },
        },
        required: [],
      },
    },
    {
      name: "get_calendar_events",
      description: "Fetch upcoming Canvas calendar events for the next 30 days.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "get_submission_status",
      description:
        "Check personal submission status for all assignments in a course. Shows submitted/graded/unsubmitted state per assignment and flags overdue missing work.",
      inputSchema: {
        type: "object",
        properties: {
          course_id: { type: "number", description: "The Canvas course ID." },
        },
        required: ["course_id"],
      },
    },
    {
      name: "get_grades",
      description:
        "Fetch current grade, final grade, and per-assignment scores for a specific course.",
      inputSchema: {
        type: "object",
        properties: {
          course_id: { type: "number", description: "The Canvas course ID." },
        },
        required: ["course_id"],
      },
    },
    {
      name: "get_course_modules",
      description:
        "Fetch all modules and their items for a course, including completion status for each item.",
      inputSchema: {
        type: "object",
        properties: {
          course_id: { type: "number", description: "The Canvas course ID." },
        },
        required: ["course_id"],
      },
    },
    {
      name: "get_announcements",
      description: "Fetch recent announcements from all active courses, sorted newest first.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "get_todo_items",
      description: "Fetch the student's Canvas to-do list.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "get_course_files",
      description:
        "Fetch all files uploaded to a course (lecture slides, PDFs, resources, etc.) sorted by most recently updated. Returns file name, type, size, and download URL.",
      inputSchema: {
        type: "object",
        properties: {
          course_id: { type: "number", description: "The Canvas course ID." },
        },
        required: ["course_id"],
      },
    },
    {
      name: "get_course_pages",
      description:
        "List all pages (wiki pages, course content pages) in a course. Use get_page_content to read a specific page's full text.",
      inputSchema: {
        type: "object",
        properties: {
          course_id: { type: "number", description: "The Canvas course ID." },
        },
        required: ["course_id"],
      },
    },
    {
      name: "get_page_content",
      description:
        "Fetch the full text content of a specific Canvas page. Use get_course_pages first to find the page URL slug.",
      inputSchema: {
        type: "object",
        properties: {
          course_id: { type: "number", description: "The Canvas course ID." },
          page_url: {
            type: "string",
            description: "The page URL slug (e.g. 'syllabus' or 'week-1-overview').",
          },
        },
        required: ["course_id", "page_url"],
      },
    },
    {
      name: "read_course_file",
      description:
        "Download and parse a Canvas file by file ID. PDFs are fully extracted into readable text. Use get_course_files to find file IDs. Use this to read lecture slides, syllabi, or any PDF posted to a course.",
      inputSchema: {
        type: "object",
        properties: {
          course_id: { type: "number", description: "The Canvas course ID." },
          file_id: { type: "number", description: "The Canvas file ID (from get_course_files)." },
        },
        required: ["course_id", "file_id"],
      },
    },
    {
      name: "get_module_item_content",
      description:
        "Read the full content of all items inside a Canvas module by name — including the text of lecture pages and file info. Use this to get what was covered in a specific lecture or week. Example: module_name='Week 6' or module_name='L15'.",
      inputSchema: {
        type: "object",
        properties: {
          course_id: { type: "number", description: "The Canvas course ID." },
          module_name: {
            type: "string",
            description: "Partial module name to search for (e.g. 'Week 6', 'Lecture 3', 'L15').",
          },
        },
        required: ["course_id", "module_name"],
      },
    },
  ],
}));

// ── Tool dispatch ─────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: string;

    switch (name) {
      case "get_courses":
        result = await getCourses();
        break;

      case "get_assignments": {
        const courseId = args?.course_id;
        if (typeof courseId !== "number")
          throw new McpError(ErrorCode.InvalidParams, "course_id must be a number.");
        result = await getAssignments(courseId);
        break;
      }

      case "get_all_assignments":
        result = await getAllAssignments();
        break;

      case "get_upcoming_assignments": {
        const days = typeof args?.days === "number" ? args.days : 7;
        result = await getUpcomingAssignments(days);
        break;
      }

      case "get_calendar_events":
        result = await getCalendarEvents();
        break;

      case "get_submission_status": {
        const courseId = args?.course_id;
        if (typeof courseId !== "number")
          throw new McpError(ErrorCode.InvalidParams, "course_id must be a number.");
        result = await getSubmissionStatus(courseId);
        break;
      }

      case "get_grades": {
        const courseId = args?.course_id;
        if (typeof courseId !== "number")
          throw new McpError(ErrorCode.InvalidParams, "course_id must be a number.");
        result = await getGrades(courseId);
        break;
      }

      case "get_course_modules": {
        const courseId = args?.course_id;
        if (typeof courseId !== "number")
          throw new McpError(ErrorCode.InvalidParams, "course_id must be a number.");
        result = await getCourseModules(courseId);
        break;
      }

      case "get_announcements":
        result = await getAnnouncements();
        break;

      case "get_todo_items":
        result = await getTodoItems();
        break;

      case "get_course_files": {
        const courseId = args?.course_id;
        if (typeof courseId !== "number")
          throw new McpError(ErrorCode.InvalidParams, "course_id must be a number.");
        result = await getCourseFiles(courseId);
        break;
      }

      case "get_course_pages": {
        const courseId = args?.course_id;
        if (typeof courseId !== "number")
          throw new McpError(ErrorCode.InvalidParams, "course_id must be a number.");
        result = await getCoursePages(courseId);
        break;
      }

      case "get_page_content": {
        const courseId = args?.course_id;
        const pageUrl = args?.page_url;
        if (typeof courseId !== "number")
          throw new McpError(ErrorCode.InvalidParams, "course_id must be a number.");
        if (typeof pageUrl !== "string")
          throw new McpError(ErrorCode.InvalidParams, "page_url must be a string.");
        result = await getPageContent(courseId, pageUrl);
        break;
      }

      case "read_course_file": {
        const courseId = args?.course_id;
        const fileId = args?.file_id;
        if (typeof courseId !== "number")
          throw new McpError(ErrorCode.InvalidParams, "course_id must be a number.");
        if (typeof fileId !== "number")
          throw new McpError(ErrorCode.InvalidParams, "file_id must be a number.");
        result = await readCourseFile(courseId, fileId);
        break;
      }

      case "get_module_item_content": {
        const courseId = args?.course_id;
        const moduleName = args?.module_name;
        if (typeof courseId !== "number")
          throw new McpError(ErrorCode.InvalidParams, "course_id must be a number.");
        if (typeof moduleName !== "string")
          throw new McpError(ErrorCode.InvalidParams, "module_name must be a string.");
        result = await getModuleItemContent(courseId, moduleName);
        break;
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }

    return { content: [{ type: "text", text: result }] };
  } catch (error) {
    if (error instanceof McpError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error calling Canvas API: ${message}` }],
      isError: true,
    };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Canvas MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
