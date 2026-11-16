"""A minimal MCP stdio server over jobs.csv. It exposes one read-only tool."""
import argparse
import json
import sys

from jobs_query import query_jobs, read_jobs

PROTOCOL_VERSION = "2024-11-05"
SERVER_INFO = {"name": "jobspy-jobs", "version": "0.1.0"}

SEARCH_JOBS_SCHEMA = {
    "type": "object",
    "properties": {
        "query": {"type": "string", "description": "Text to find in the title, company, location or description."},
        "status": {
            "type": "string",
            "description": 'Stored status, for example "applied". Use "untriaged" for an empty status.',
        },
        "city": {"type": "string"},
        "country": {"type": "string"},
        "site": {"type": "string"},
        "work_mode": {"type": "string"},
        "seniority": {"type": "string"},
        "employment_type": {"type": "string"},
        "include_archived": {"type": "boolean", "description": "Include skipped rows."},
        "limit": {"type": "integer", "minimum": 1},
    },
    "additionalProperties": False,
}

FILTER_KEYS = (
    "query",
    "status",
    "city",
    "country",
    "site",
    "work_mode",
    "seniority",
    "employment_type",
)


def _result(message_id, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": message_id, "result": result}


def _error(message_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": message_id, "error": {"code": code, "message": message}}


class JobServer:
    def __init__(self, jobs: list[dict]):
        self.jobs = jobs

    def handle(self, message):
        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0" or "method" not in message:
            return _error(None, -32600, "Invalid Request")
        message_id = message.get("id")
        if message_id is None:
            return None

        method = message["method"]
        if method == "initialize":
            return _result(
                message_id,
                {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {"tools": {}},
                    "serverInfo": SERVER_INFO,
                },
            )
        if method == "tools/list":
            return _result(
                message_id,
                {
                    "tools": [
                        {
                            "name": "search_jobs",
                            "description": "Search the saved jobs. Returns a JSON list. Read-only.",
                            "inputSchema": SEARCH_JOBS_SCHEMA,
                        }
                    ]
                },
            )
        if method == "tools/call":
            return self._call_tool(message_id, message.get("params") or {})
        return _error(message_id, -32601, "Method not found")

    def _call_tool(self, message_id, params):
        if not isinstance(params, dict) or params.get("name") != "search_jobs":
            return _error(message_id, -32602, "Unknown tool")
        arguments = params.get("arguments") or {}
        if not isinstance(arguments, dict):
            return _error(message_id, -32602, "Invalid arguments")
        unknown = set(arguments) - set(SEARCH_JOBS_SCHEMA["properties"])
        if unknown:
            return _error(message_id, -32602, "Invalid arguments")

        limit = arguments.get("limit")
        if limit is not None and (isinstance(limit, bool) or not isinstance(limit, int) or limit < 1):
            return _error(message_id, -32602, "Invalid arguments")
        include_archived = arguments.get("include_archived", False)
        if not isinstance(include_archived, bool):
            return _error(message_id, -32602, "Invalid arguments")
        for key in FILTER_KEYS:
            value = arguments.get(key)
            if value is not None and not isinstance(value, str):
                return _error(message_id, -32602, "Invalid arguments")

        jobs = query_jobs(
            self.jobs,
            **{key: arguments[key] for key in FILTER_KEYS if key in arguments},
            include_archived=include_archived,
            limit=limit,
        )
        return _result(
            message_id,
            {
                "content": [{"type": "text", "text": json.dumps(jobs, ensure_ascii=False)}],
                "isError": False,
            },
        )


def run(stdin, stdout, jobs: list[dict]) -> None:
    server = JobServer(jobs)
    for line in stdin:
        if not line.strip():
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            reply = _error(None, -32700, "Parse error")
        else:
            reply = server.handle(message)
        if reply is not None:
            stdout.write(json.dumps(reply, ensure_ascii=False) + "\n")
            stdout.flush()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--save_path", required=True, help="Path to the jobs.csv file.")
    args = parser.parse_args(argv)
    try:
        jobs = read_jobs(args.save_path)
    except FileNotFoundError:
        print(f"File not found: {args.save_path}", file=sys.stderr)
        return 2
    run(sys.stdin, sys.stdout, jobs)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
