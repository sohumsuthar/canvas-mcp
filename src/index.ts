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
} from "./tools.js";

// Validate env vars immediately on startup
validateEnv();

// ── Server setup ─────────────────────────────────────────────────────────────

const server = new Server(
  {
    name: "canvas-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ── Tool definitions ──────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_courses",
      description:
        "Fetch all active enrolled Canvas courses including id, name, course_code, start_at, and end_at.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "get_assignments",
      description:
        "Fetch all assignments for a specific Canvas course by course_id. Returns name, due_at, points_possible, submission_types, and whether submissions exist.",
      inputSchema: {
        type: "object",
        properties: {
          course_id: {
            type: "number",
            description: "The Canvas course ID (use get_courses to find IDs).",
          },
        },
        required: ["course_id"],
      },
    },
    {
      name: "get_all_assignments",
      description:
        "Fetch every assignment across all active courses, sorted by due_at ascending. Overdue assignments are flagged. Useful for a comprehensive view of all work.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "get_upcoming_assignments",
      description:
        "Fetch assignments due within the next N days (default 7) across all active courses. Use this for weekly planning or 'what's due soon' questions.",
      inputSchema: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "Number of days to look ahead (default: 7).",
          },
        },
        required: [],
      },
    },
    {
      name: "get_calendar_events",
      description:
        "Fetch upcoming Canvas calendar events for the next 30 days including title, start_at, end_at, and description.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "get_submission_status",
      description:
        "Check submission status for all assignments in a course. Shows whether each assignment is submitted, graded, unsubmitted, or pending review. Flags overdue unsubmitted work.",
      inputSchema: {
        type: "object",
        properties: {
          course_id: {
            type: "number",
            description: "The Canvas course ID.",
          },
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
          course_id: {
            type: "number",
            description: "The Canvas course ID.",
          },
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
          course_id: {
            type: "number",
            description: "The Canvas course ID.",
          },
        },
        required: ["course_id"],
      },
    },
    {
      name: "get_announcements",
      description:
        "Fetch recent announcements from all active courses, sorted newest first.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "get_todo_items",
      description:
        "Fetch the student's Canvas to-do list including upcoming assignments, unsubmitted work, and other pending items.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
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
        if (typeof courseId !== "number") {
          throw new McpError(ErrorCode.InvalidParams, "course_id must be a number.");
        }
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
        if (typeof courseId !== "number") {
          throw new McpError(ErrorCode.InvalidParams, "course_id must be a number.");
        }
        result = await getSubmissionStatus(courseId);
        break;
      }

      case "get_grades": {
        const courseId = args?.course_id;
        if (typeof courseId !== "number") {
          throw new McpError(ErrorCode.InvalidParams, "course_id must be a number.");
        }
        result = await getGrades(courseId);
        break;
      }

      case "get_course_modules": {
        const courseId = args?.course_id;
        if (typeof courseId !== "number") {
          throw new McpError(ErrorCode.InvalidParams, "course_id must be a number.");
        }
        result = await getCourseModules(courseId);
        break;
      }

      case "get_announcements":
        result = await getAnnouncements();
        break;

      case "get_todo_items":
        result = await getTodoItems();
        break;

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }

    return {
      content: [{ type: "text", text: result }],
    };
  } catch (error) {
    if (error instanceof McpError) throw error;

    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error calling Canvas API: ${message}`,
        },
      ],
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
