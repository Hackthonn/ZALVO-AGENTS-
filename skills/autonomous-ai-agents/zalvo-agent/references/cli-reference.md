# ZALVO CLI Reference

Live sources when anything looks stale: `zalvo --help`, `zalvo <command> --help`,
https://hermes-agent.nousresearch.com/docs/reference/cli-commands

### Global Flags

```
zalvo [flags] [command]        (no subcommand = interactive chat)

  --version, -V             Show version
  -z, --oneshot PROMPT      One-shot: print ONLY the final response (for scripts/pipes)
  -m MODEL  --provider P    Model/provider override for this invocation
  -t, --toolsets LIST       Comma-separated toolsets for this invocation
  --resume, -r SESSION      Resume session by ID or title
  --continue, -c [NAME]     Resume by name, or most recent session
  --worktree, -w            Isolated git worktree mode (parallel agents)
  --skills, -s SKILL        Preload skills (comma-separate or repeat)
  --profile, -p NAME        Use a named profile
  --yolo                    Skip dangerous command approval
  --tui / --cli             Force the Ink TUI / classic REPL
  --ignore-rules            Skip AGENTS.md/SOUL.md/memory/skill injection
  --safe-mode               Disable ALL customizations (troubleshooting)
  --pass-session-id         Include session ID in system prompt
```

### Chat

```
zalvo chat [flags]
  -q, --query TEXT          Single query, non-interactive
  --image PATH              Attach a local image to a single query
  -Q, --quiet               Suppress banner, spinner, tool previews
  --checkpoints             Enable filesystem checkpoints (/rollback)
  --max-turns N             Cap tool-calling iterations
  --source TAG              Session source tag (default: cli)
```
(plus the global flags above)

### Configuration

```
zalvo setup [section]      Wizard (model|tts|terminal|gateway|tools|agent)
zalvo model                Interactive model/provider picker
zalvo fallback [add|remove|list]  Fallback provider chain
zalvo config [show|edit|get|set|unset|path|env-path|check|migrate]
zalvo login / logout       OAuth sign-in / clear stored auth
zalvo doctor [--fix]       Check dependencies and config
zalvo status [--full]      Component summary (--full: every section)
```

### Tools & Skills

```
zalvo tools [list|enable NAME|disable NAME]   Per-platform toolsets (curses UI with no args)

zalvo skills list|browse|search QUERY|inspect ID
zalvo skills install ID    Hub identifier OR a direct https://…/SKILL.md URL
zalvo skills config        Enable/disable skills per platform
zalvo skills check|update|uninstall|publish PATH
zalvo skills tap add REPO  Add a GitHub repo as a skill source
zalvo bundles              Skill bundles (one /<name> alias loads several skills)
```

### MCP Servers

```
zalvo mcp add NAME (--url or --command) | remove | list | test NAME
zalvo mcp catalog | install NAME     Curated catalog install
zalvo mcp configure NAME             Toggle tool selection
zalvo mcp-serve                      Run ZALVO as an MCP server (mcp-serve plugin)
```
Details (transport, tool discovery, catalog): `references/native-mcp.md`.

### Gateway (Messaging Platforms)

```
zalvo gateway run|install|start|stop|restart|status|setup
```

20+ platforms: Telegram, Discord, Slack, WhatsApp (Baileys + Business Cloud API), iMessage (Photon — `zalvo photon setup`), Signal, Email, SMS, Matrix, Mattermost, Teams, LINE, SimpleX, ntfy, Google Chat, Home Assistant, DingTalk, Feishu, WeCom, Weixin, API Server, Webhooks. Open WebUI connects via the API Server adapter. Most adapters ship under `plugins/platforms/`.
Docs: https://hermes-agent.nousresearch.com/docs/user-guide/messaging/

### Sessions

```
zalvo sessions list|browse|rename ID TITLE|delete ID|export OUT|prune|stats
```

### Cron / Webhooks

```
zalvo cron list|create SCHED|edit ID|pause|resume|run ID|remove|status
    Schedules: '30m', 'every 2h', '0 9 * * *', ISO timestamp
zalvo webhook subscribe NAME|list|remove NAME|test NAME
```
Webhook payloads/routes: `references/webhooks.md`.

### Profiles

```
zalvo profile list|create NAME (--clone|--clone-all|--clone-from)|use|show|delete
zalvo profile rename A B | alias NAME | export NAME | import FILE
zalvo profile migrate-identity A B   Retry a completed rename's session/routing identity migration
```

### Credentials & Pools

```
zalvo auth                 Interactive credential manager
zalvo auth add [PROVIDER]  Add OAuth or API-key credential (nous, openai-codex, qwen-oauth, …)
zalvo auth list|remove P IDX|reset PROVIDER|status
```
Multiple credentials per provider form a pool that rotates automatically and skips exhausted keys.

### Other

```
zalvo desktop / gui        Native desktop app
zalvo dashboard            Web admin panel + embedded chat (--stop / --status)
zalvo proxy                OpenAI-compatible local proxy backed by an OAuth provider
zalvo portal               Quick setup / sign in via Nous Portal
zalvo kanban <verb>        Multi-agent work-queue board
zalvo project              Named multi-folder workspaces (see references/projects-and-folders.md)
zalvo skin list|use|set    Switch/tweak skins (see references/themes.md)
zalvo pets <verb>          Pet mascots (see references/petdex.md)
zalvo memory setup|status|off|reset   Memory provider
zalvo secrets bitwarden|onepassword   External secret stores
zalvo moa                  Mixture-of-Agents slots
zalvo hooks / security / backup / import / checkpoints / console
zalvo logs [-f] [errors]   View agent/error logs
zalvo send                 One-off message through a gateway platform
zalvo pairing / plugins / insights / journey / computer-use
zalvo acp                  ACP server (IDE integration)
zalvo completion bash|zsh|fish
zalvo update / uninstall
```

Plugin- and provider-supplied subcommands (e.g. `zalvo photon setup`) only appear once their plugin is installed/active. Importing from OpenClaw, Claude Code, Codex CLI or Cursor (`zalvo import-agent <agent>`, plus the older `zalvo claw migrate|cleanup`) comes from the `agent-importers` plugin; a fresh `zalvo setup` that finds one of those agents offers to install it.

### Where to Find Things

| Looking for... | Location |
|---|---|
| Config options | `zalvo config edit` · [Configuration docs](https://hermes-agent.nousresearch.com/docs/user-guide/configuration) |
| Tools / toolsets | `zalvo tools list` · [Tools reference](https://hermes-agent.nousresearch.com/docs/reference/tools-reference) |
| Skills catalog | `zalvo skills browse` · [Skills catalog](https://hermes-agent.nousresearch.com/docs/reference/skills-catalog) |
| Provider setup | `zalvo model` · [Providers guide](https://hermes-agent.nousresearch.com/docs/integrations/providers) |
| Env variables | `zalvo config env-path` · [Env vars reference](https://hermes-agent.nousresearch.com/docs/reference/environment-variables) |
| Gateway logs | `~/.zalvo/logs/gateway.log` (or `zalvo logs`) |
| Sessions | `zalvo sessions browse` (reads state.db) |
