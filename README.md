# canvas-mcp

A production-ready **Model Context Protocol (MCP) server** that connects your **Canvas LMS** account to **Claude Desktop**. Ask Claude natural-language questions about your courses, assignments, grades, and more — all powered by the Canvas REST API.

---

## Features

| Tool | Description |
|---|---|
| `get_courses` | All active enrolled courses |
| `get_assignments` | Assignments for a specific course |
| `get_all_assignments` | Every assignment across all courses, sorted by due date |
| `get_upcoming_assignments` | Assignments due in the next N days (default 7) |
| `get_calendar_events` | Upcoming calendar events (next 30 days) |
| `get_submission_status` | Submission state per assignment (submitted / graded / unsubmitted) |
| `get_grades` | Current & final grade + per-assignment scores |
| `get_course_modules` | Course modules with item completion status |
| `get_announcements` | Recent announcements across all courses |
| `get_todo_items` | Your Canvas to-do list |

---

## File Structure

```
canvas-mcp/
├── src/
│   ├── index.ts          # MCP server entry point & tool dispatch
│   ├── tools.ts          # Tool implementations
│   └── canvas-client.ts  # Fetch helpers, pagination, Canvas types
├── dist/                 # Compiled output (after build)
├── .env                  # Your credentials (never commit this)
├── .env.example          # Template
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## Getting a Canvas API Token

1. Log in to your Canvas instance (e.g. `https://yourschool.instructure.com`)
2. Go to **Account → Settings**
3. Scroll to **Approved Integrations**
4. Click **+ New Access Token**
5. Give it a name (e.g. "Claude MCP") and optionally set an expiry
6. Copy the token — **you won't see it again**

---

## Setup & Installation

### 1. Clone and enter the repo

```bash
git clone https://github.com/YOUR_USERNAME/canvas-mcp.git
cd canvas-mcp
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure credentials

```bash
cp .env.example .env
```

Edit `.env`:

```env
CANVAS_TOKEN=your_token_here
CANVAS_DOMAIN=yourschool.instructure.com
```

> **Note:** `CANVAS_DOMAIN` should be just the hostname, e.g. `canvas.university.edu` — no `https://` prefix.

### 4. Build

```bash
npm run build
```

This compiles TypeScript to `dist/`.

### 5. Test it (optional)

```bash
node dist/index.js
```

The server speaks MCP over stdio — it will just wait. Use Ctrl+C to exit. If your `.env` is missing variables, you'll see a clear error immediately.

---

## Connecting to Claude Desktop

### macOS

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "canvas": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/canvas-mcp/dist/index.js"],
      "env": {
        "CANVAS_TOKEN": "your_canvas_token_here",
        "CANVAS_DOMAIN": "yourschool.instructure.com"
      }
    }
  }
}
```

### Windows

Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "canvas": {
      "command": "node",
      "args": ["C:\\Users\\YOU\\path\\to\\canvas-mcp\\dist\\index.js"],
      "env": {
        "CANVAS_TOKEN": "your_canvas_token_here",
        "CANVAS_DOMAIN": "yourschool.instructure.com"
      }
    }
  }
}
```

> Replace the path with the **absolute path** to your `dist/index.js`.
> After saving, **restart Claude Desktop**.

---

## Example Prompts

Once connected, try these in Claude Desktop:

**Assignment planning**
- "What assignments do I have due this week?"
- "Show me everything due in the next 14 days."
- "What's due tomorrow across all my courses?"
- "Build me a study schedule for the next two weeks based on my due dates."

**Submission tracking**
- "Am I missing any submissions?"
- "Which assignments haven't I submitted yet in course 12345?"
- "Show me all overdue assignments."

**Grades**
- "What's my current grade in my Biology course?"
- "Show me all my graded assignments and scores."
- "Which course am I doing worst in?"

**Course overview**
- "What courses am I enrolled in this semester?"
- "What modules have I completed in course 12345?"
- "Are there any announcements I should know about?"

**Comprehensive**
- "Give me a full academic status report — courses, grades, upcoming work, and missing submissions."
- "I have a free weekend. What should I prioritize studying based on upcoming deadlines and my current grades?"

---

## Development

```bash
# Run without building (uses ts-node)
npm run dev

# Rebuild after changes
npm run build
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Missing required environment variables` | Check your `.env` file or the `env` block in claude_desktop_config.json |
| `Canvas API error 401` | Your token is invalid or expired — generate a new one |
| `Canvas API error 403` | You don't have permission to access that resource |
| `No active courses found` | Your enrollment state may differ — check Canvas directly |
| Claude doesn't see the server | Verify the absolute path in config and restart Claude Desktop |
