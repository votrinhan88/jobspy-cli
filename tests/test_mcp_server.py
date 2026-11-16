import io
import json

from mcp_server import JobServer, run


def row(**overrides):
    base = {
        "job_id": "acme-ai-1",
        "title": "AI Engineer",
        "company": "Acme",
        "location": "Sydney, Australia",
        "city": "Sydney",
        "country": "Australia",
        "site": "linkedin",
        "status": "",
        "work_mode": "hybrid",
        "seniority": "mid",
        "employment_type": "fulltime",
        "date_posted": "2026-09-01",
        "last_seen_at": "2026-11-01T00:00:00Z",
        "description": "Build models.",
    }
    base.update(overrides)
    return base


ROWS = [
    row(),
    row(
        job_id="beta-ml-2",
        title="ML Engineer",
        company="Beta",
        site="indeed",
        status="applied",
        date_posted="2026-10-01",
    ),
]


def request(server, method, params=None, id=1):
    return server.handle({"jsonrpc": "2.0", "id": id, "method": method, "params": params or {}})


class TestJobServer:
    def test_initialize_announces_the_tools_capability(self):
        reply = request(JobServer(ROWS), "initialize", {"protocolVersion": "2024-11-05"})
        assert reply["result"]["protocolVersion"] == "2024-11-05"
        assert "tools" in reply["result"]["capabilities"]
        assert reply["result"]["serverInfo"]["name"] == "jobspy-jobs"

    def test_a_notification_gets_no_reply(self):
        assert JobServer(ROWS).handle({"jsonrpc": "2.0", "method": "notifications/initialized"}) is None

    def test_tools_list_describes_search_jobs(self):
        reply = request(JobServer(ROWS), "tools/list")
        tools = reply["result"]["tools"]
        assert [tool["name"] for tool in tools] == ["search_jobs"]
        schema = tools[0]["inputSchema"]
        assert schema["type"] == "object"
        assert "query" in schema["properties"]
        assert "limit" in schema["properties"]

    def test_tools_call_returns_json_text(self):
        reply = request(
            JobServer(ROWS),
            "tools/call",
            {"name": "search_jobs", "arguments": {"query": "ml"}},
        )
        content = reply["result"]["content"]
        assert content[0]["type"] == "text"
        jobs = json.loads(content[0]["text"])
        assert [job["job_id"] for job in jobs] == ["beta-ml-2"]
        assert reply["result"]["isError"] is False

    def test_tools_call_passes_filters(self):
        reply = request(
            JobServer(ROWS),
            "tools/call",
            {"name": "search_jobs", "arguments": {"status": "untriaged"}},
        )
        jobs = json.loads(reply["result"]["content"][0]["text"])
        assert [job["job_id"] for job in jobs] == ["acme-ai-1"]

    def test_an_unknown_tool_is_an_error(self):
        reply = request(JobServer(ROWS), "tools/call", {"name": "ghost", "arguments": {}})
        assert reply["error"]["code"] == -32602

    def test_an_unknown_method_is_an_error(self):
        reply = request(JobServer(ROWS), "ghost/method")
        assert reply["error"]["code"] == -32601

    def test_bad_arguments_are_an_error(self):
        reply = request(
            JobServer(ROWS),
            "tools/call",
            {"name": "search_jobs", "arguments": {"limit": "many"}},
        )
        assert reply["error"]["code"] == -32602


class TestRun:
    def test_answers_one_request_per_line_and_ignores_bad_json(self):
        lines = [
            json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}),
            "not json",
            json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}),
        ]
        stdin = io.StringIO("\n".join(lines) + "\n")
        stdout = io.StringIO()

        run(stdin, stdout, ROWS)

        replies = [json.loads(line) for line in stdout.getvalue().splitlines() if line.strip()]
        assert replies[0]["id"] == 1
        assert replies[1]["error"]["code"] == -32700
        assert replies[2]["id"] == 2
