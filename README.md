# Differton

A beautiful, native Git client built with [Wails](https://wails.io) (Go + React).

## Features

- **Repository management** — add/remove local Git repos, persist across sessions
- **Working changes** — view staged/unstaged files, stage/unstage individually or all at once, commit
- **Diff viewer** — unified and split diff modes for working changes, staged changes, and untracked files
- **History** — browse commit log, inspect per-commit file changes and diffs
- **Branches** — list local and remote branches, checkout, create new branches
- **Remote operations** — fetch, pull (merge/rebase/ff-only), push, set remotes
- **Quick actions** — open repo in Finder/Explorer or Terminal

## Tech stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Shell    | Go 1.23 + Wails v2                |
| Frontend | React 18, TypeScript, Tailwind CSS |
| Bundler  | Vite                              |
| Icons    | Lucide React                      |

## Requirements

- [Go 1.21+](https://go.dev/dl/)
- [Node.js 18+](https://nodejs.org/)
- [Wails CLI v2](https://wails.io/docs/gettingstarted/installation)

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

## Development

```bash
wails dev
```

Starts the app with hot-reload. A browser dev server is also available at `http://localhost:34115`.

## Build

```bash
wails build
```

Produces a native binary in `build/bin/`.

## Data storage

User data (repositories list, preferences) is stored in:

| OS      | Path                                            |
|---------|-------------------------------------------------|
| macOS   | `~/Library/Application Support/Differton/`     |
| Windows | `%APPDATA%\Differton\`                          |
| Linux   | `~/.config/differton/`                          |
