/**
 * pi-docker — typed container ops for pi agents.
 *
 *   docker_ps      — containers (name, status, health, uptime)
 *   docker_logs    — tail a container's logs
 *   docker_stats   — one-shot cpu/mem/net per container
 *   docker_inspect — full inspect (health, restart count, ports)
 *   docker_exec    — run a command inside a container (careful)
 *
 * Uses the local docker CLI/socket — free, no API.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { Type } from "typebox";

const MAX_OUT = 12000;
const READ_ONLY_COMMANDS = new Set([
	"cat",
	"curl",
	"df",
	"du",
	"env",
	"grep",
	"head",
	"ls",
	"netstat",
	"ping",
	"printenv",
	"ps",
	"pwd",
	"ss",
	"stat",
	"tail",
	"test",
	"top",
	"uptime",
	"wc",
	"which",
]);
const WRITE_COMMAND_PATTERN = /(^|[\s;&|()])(?:apt|apt-get|apk|bash|chmod|chown|cp|dd|dnf|echo|install|mkdir|mv|npm|rm|rmdir|sed|sh|tee|touch|truncate|yum)(?:\s|$)/;
const SHELL_META_PATTERN = /[;&|`$<>]/;

function assertReadOnlyCommand(cmd: string): string | null {
	const trimmed = cmd.trim();
	const [binary] = trimmed.split(/\s+/, 1);

	if (!trimmed) {
		return "docker_exec requires a command.";
	}

	if (!READ_ONLY_COMMANDS.has(binary)) {
		return `docker_exec only allows observational commands; '${binary}' is not allowed.`;
	}

	if (SHELL_META_PATTERN.test(trimmed) || WRITE_COMMAND_PATTERN.test(trimmed)) {
		return "docker_exec rejected a command with shell metacharacters or write-capable operations.";
	}

	return null;
}

function toolResult(text: string) {
	return { content: [{ type: "text" as const, text }], details: { text } };
}

function run(args: string[], timeout = 30_000): Promise<string> {
	return new Promise((resolve) => {
		execFile("docker", args, { timeout, maxBuffer: 16 * 1024 * 1024 }, (e, o, er) => {
			const out = String(o ?? "") + (er ? `\n${er}` : "");
			resolve(
				`exit ${e ? (typeof (e as any).code === "number" ? (e as any).code : 1) : 0}\n` +
				(out.length > MAX_OUT ? out.slice(0, MAX_OUT) + "\n[truncated]" : out || "(no output)"),
			);
		});
	});
}

export default function piDocker(pi: ExtensionAPI) {
	pi.registerTool({
		name: "docker_ps",
		label: "Docker PS",
		description: "List containers — name, image, status, health, uptime.",
		parameters: Type.Object({
			all: Type.Optional(Type.Boolean({ description: "include stopped" })),
		}),
		async execute(_id, p) {
			const out = await run([
				"ps", ...(p.all ? ["-a"] : []),
				"--format", "{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.State}}",
			]);
			return toolResult(out);
		},
	});

	pi.registerTool({
		name: "docker_logs",
		label: "Docker Logs",
		description: "Tail a container's logs — errors, recent activity.",
		parameters: Type.Object({
			container: Type.String(),
			lines: Type.Optional(Type.Number({ description: "default 80" })),
			since: Type.Optional(Type.String({ description: "e.g. 30m, 2h" })),
		}),
		async execute(_id, p) {
			const args = ["logs", "--tail", String(p.lines ?? 80)];
			if (p.since) args.push("--since", p.since);
			args.push(p.container);
			return toolResult(await run(args));
		},
	});

	pi.registerTool({
		name: "docker_stats",
		label: "Docker Stats",
		description: "One-shot CPU/mem/net usage per container.",
		parameters: Type.Object({
			container: Type.Optional(Type.String({ description: "default: all" })),
		}),
		async execute(_id, p) {
			const args = ["stats", "--no-stream",
				"--format", "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.PIDs}}"];
			if (p.container) args.push(p.container);
			return toolResult(await run(args));
		},
	});

	pi.registerTool({
		name: "docker_inspect",
		label: "Docker Inspect",
		description: "Container detail — health, restarts, ports, env.",
		parameters: Type.Object({ container: Type.String() }),
		async execute(_id, p) {
			const out = await run([
				"inspect", "--format",
				"{{.Name}} image={{.Config.Image}}\nstatus={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restarts={{.RestartCount}}\nstarted={{.State.StartedAt}}\nports={{json .NetworkSettings.Ports}}",
				p.container,
			]);
			return toolResult(out);
		},
	});

	pi.registerTool({
		name: "docker_exec",
		label: "Docker Exec",
		description: "Run an allowlisted observational command inside a container; write-capable shell commands are rejected.",
		parameters: Type.Object({
			container: Type.String(),
			cmd: Type.String({ description: "observational command to run inside" }),
		}),
		async execute(_id, p) {
			const rejection = assertReadOnlyCommand(p.cmd);

			if (rejection) {
				return toolResult(`rejected: ${rejection}`);
			}

			const out = await run(["exec", p.container, "sh", "-c", p.cmd], 60_000);
			return toolResult(out);
		},
	});
}
