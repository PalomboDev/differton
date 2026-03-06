package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// --- Data types ---

type Repository struct {
	Path string `json:"path"`
	Name string `json:"name"`
}

type Preferences struct {
	ActiveRepoPath string `json:"activeRepoPath"`
	DiffMode       string `json:"diffMode"`     // "unified" | "split"
	LastView       string `json:"lastView"`     // "changes" | "history" | "branches"
	SidebarWidth   int    `json:"sidebarWidth"` // repo sidebar px
	PanelWidth     int    `json:"panelWidth"`   // left file-list panel px
}

type FileStatus struct {
	Path    string `json:"path"`
	Status  string `json:"status"` // M, A, D, R, ?
	Staged  bool   `json:"staged"`
	OldPath string `json:"oldPath"` // for renames
}

type CommitInfo struct {
	Hash    string `json:"hash"`
	Message string `json:"message"`
	Author  string `json:"author"`
	Date    string `json:"date"`
}

type Branch struct {
	Name      string `json:"name"`
	IsCurrent bool   `json:"isCurrent"`
	IsRemote  bool   `json:"isRemote"`
}

type DiffResult struct {
	Content string `json:"content"`
	Error   string `json:"error"`
}

// --- App data path ---

func getAppDataPath() string {
	var base string
	switch runtime.GOOS {
	case "darwin":
		home, _ := os.UserHomeDir()
		base = filepath.Join(home, "Library", "Application Support", "Differton")
	case "windows":
		base = filepath.Join(os.Getenv("APPDATA"), "Differton")
	default:
		home, _ := os.UserHomeDir()
		base = filepath.Join(home, ".config", "differton")
	}
	os.MkdirAll(base, 0755)
	return base
}

func getReposFilePath() string {
	return filepath.Join(getAppDataPath(), "repositories.json")
}

func getPrefsFilePath() string {
	return filepath.Join(getAppDataPath(), "preferences.json")
}

func (a *App) LoadPreferences() Preferences {
	data, err := os.ReadFile(getPrefsFilePath())
	if err != nil {
		return Preferences{DiffMode: "unified", LastView: "changes"}
	}
	var prefs Preferences
	if err := json.Unmarshal(data, &prefs); err != nil {
		return Preferences{DiffMode: "unified", LastView: "changes"}
	}
	if prefs.DiffMode == "" {
		prefs.DiffMode = "unified"
	}
	if prefs.LastView == "" {
		prefs.LastView = "changes"
	}
	return prefs
}

func (a *App) SavePreferences(prefs Preferences) error {
	data, err := json.MarshalIndent(prefs, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(getPrefsFilePath(), data, 0644)
}

// --- Repository management ---

func (a *App) LoadRepositories() []Repository {
	data, err := os.ReadFile(getReposFilePath())
	if err != nil {
		return []Repository{}
	}
	var repos []Repository
	if err := json.Unmarshal(data, &repos); err != nil {
		return []Repository{}
	}
	return repos
}

func (a *App) SaveRepositories(repos []Repository) error {
	data, err := json.MarshalIndent(repos, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(getReposFilePath(), data, 0644)
}

func (a *App) AddRepository(path string) (*Repository, error) {
	// Validate it's a git repo
	cmd := exec.Command("git", "-C", path, "rev-parse", "--show-toplevel")
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("not a git repository: %s", path)
	}
	repoRoot := strings.TrimSpace(string(out))
	name := filepath.Base(repoRoot)

	repos := a.LoadRepositories()
	for _, r := range repos {
		if r.Path == repoRoot {
			return &r, nil // already exists
		}
	}

	repo := Repository{Path: repoRoot, Name: name}
	repos = append(repos, repo)
	if err := a.SaveRepositories(repos); err != nil {
		return nil, err
	}
	return &repo, nil
}

func (a *App) RemoveRepository(path string) error {
	repos := a.LoadRepositories()
	newRepos := make([]Repository, 0)
	for _, r := range repos {
		if r.Path != path {
			newRepos = append(newRepos, r)
		}
	}
	return a.SaveRepositories(newRepos)
}

// --- Git status ---

func (a *App) GetStatus(repoPath string) ([]FileStatus, error) {
	cmd := exec.Command("git", "-C", repoPath, "status", "--porcelain", "-u")
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git status failed: %v", err)
	}

	// Use a map to deduplicate: one entry per path, staged takes priority.
	seen := map[string]*FileStatus{}

	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		line := scanner.Text()
		if len(line) < 4 {
			continue
		}
		indexStatus := string(line[0])
		workStatus := string(line[1])
		namePart := line[3:]

		// Parse renames
		oldPath := ""
		newPath := namePart
		if strings.Contains(namePart, " -> ") {
			parts := strings.SplitN(namePart, " -> ", 2)
			oldPath = strings.TrimSpace(parts[0])
			newPath = strings.TrimSpace(parts[1])
		}

		if indexStatus != " " && indexStatus != "?" {
			// Staged change — always wins over any unstaged entry for same path
			seen[newPath] = &FileStatus{
				Path:    newPath,
				Status:  indexStatus,
				Staged:  true,
				OldPath: oldPath,
			}
		} else if workStatus != " " && workStatus != "?" {
			// Unstaged change — only add if no staged entry exists for this path
			if _, exists := seen[newPath]; !exists {
				seen[newPath] = &FileStatus{
					Path:   newPath,
					Status: workStatus,
					Staged: false,
				}
			}
		} else if workStatus == "?" && indexStatus == "?" {
			// Untracked file
			if _, exists := seen[newPath]; !exists {
				seen[newPath] = &FileStatus{
					Path:   newPath,
					Status: "A",
					Staged: false,
				}
			}
		}
	}

	var files []FileStatus
	for _, f := range seen {
		files = append(files, *f)
	}
	return files, nil
}

// --- Stage / Unstage ---

func (a *App) StageFile(repoPath, filePath string) error {
	cmd := exec.Command("git", "-C", repoPath, "add", filePath)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git add failed: %s", string(out))
	}
	return nil
}

func (a *App) UnstageFile(repoPath, filePath string) error {
	// Try `git restore --staged` first (git 2.23+)
	cmd := exec.Command("git", "-C", repoPath, "restore", "--staged", "--", filePath)
	out, err := cmd.CombinedOutput()
	if err == nil {
		return nil
	}
	// Fall back to `git reset HEAD` for older git or repos with no commits
	cmd2 := exec.Command("git", "-C", repoPath, "reset", "HEAD", "--", filePath)
	out2, err2 := cmd2.CombinedOutput()
	if err2 != nil {
		// For brand-new repos with no commits, use rm --cached
		cmd3 := exec.Command("git", "-C", repoPath, "rm", "--cached", "--", filePath)
		out3, err3 := cmd3.CombinedOutput()
		if err3 != nil {
			return fmt.Errorf("unstage failed: %s / %s / %s", string(out), string(out2), string(out3))
		}
	}
	return nil
}

func (a *App) StageAll(repoPath string) error {
	cmd := exec.Command("git", "-C", repoPath, "add", "-A")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git add -A failed: %s", string(out))
	}
	return nil
}

func (a *App) UnstageAll(repoPath string) error {
	// Try `git reset HEAD` first
	cmd := exec.Command("git", "-C", repoPath, "reset", "HEAD")
	out, err := cmd.CombinedOutput()
	if err == nil {
		return nil
	}
	// For repos with no commits, rm --cached everything
	cmd2 := exec.Command("git", "-C", repoPath, "rm", "-r", "--cached", ".")
	out2, err2 := cmd2.CombinedOutput()
	if err2 != nil {
		return fmt.Errorf("unstage all failed: %s / %s", string(out), string(out2))
	}
	return nil
}

// --- Commit ---

func (a *App) Commit(repoPath, message string) error {
	if strings.TrimSpace(message) == "" {
		return fmt.Errorf("commit message cannot be empty")
	}
	cmd := exec.Command("git", "-C", repoPath, "commit", "-m", message)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git commit failed: %s", string(out))
	}
	return nil
}

// --- Diff ---

func (a *App) GetDiff(repoPath, filePath string, staged bool) DiffResult {
	var cmd *exec.Cmd
	if staged {
		cmd = exec.Command("git", "-C", repoPath, "diff", "--cached", "--", filePath)
	} else {
		cmd = exec.Command("git", "-C", repoPath, "diff", "--", filePath)
	}
	out, err := cmd.CombinedOutput()
	if err != nil {
		return DiffResult{Error: string(out)}
	}
	return DiffResult{Content: string(out)}
}

func (a *App) GetCommitDiff(repoPath, hash, filePath string) DiffResult {
	// git show <hash> -- <file> diffs the commit against its parent by default
	cmd := exec.Command("git", "-C", repoPath, "show", hash, "--", filePath)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return DiffResult{Error: string(out)}
	}
	return DiffResult{Content: string(out)}
}

func (a *App) GetUntrackedDiff(repoPath, filePath string) DiffResult {
	// For untracked files, show the file content as all-additions
	fullPath := filepath.Join(repoPath, filePath)
	data, err := os.ReadFile(fullPath)
	if err != nil {
		return DiffResult{Error: err.Error()}
	}
	// Build a pseudo-diff
	lines := strings.Split(string(data), "\n")
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("--- /dev/null\n+++ b/%s\n@@ -0,0 +1,%d @@\n", filePath, len(lines)))
	for _, l := range lines {
		sb.WriteString("+" + l + "\n")
	}
	return DiffResult{Content: sb.String()}
}

// --- History ---

func (a *App) GetLog(repoPath string, limit int) ([]CommitInfo, error) {
	if limit <= 0 {
		limit = 100
	}
	format := "%H|%s|%an|%ad"
	cmd := exec.Command("git", "-C", repoPath, "log",
		fmt.Sprintf("--max-count=%d", limit),
		fmt.Sprintf("--format=%s", format),
		"--date=format:%Y-%m-%d %H:%M",
	)
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git log failed: %v", err)
	}

	var commits []CommitInfo
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.SplitN(line, "|", 4)
		if len(parts) < 4 {
			continue
		}
		commits = append(commits, CommitInfo{
			Hash:    parts[0],
			Message: parts[1],
			Author:  parts[2],
			Date:    parts[3],
		})
	}
	return commits, nil
}

func (a *App) GetCommitFiles(repoPath, hash string) ([]FileStatus, error) {
	// Use git show --name-status which works for all commits including the first
	cmd := exec.Command("git", "-C", repoPath, "show", "--name-status", "--format=", hash)
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git show --name-status failed: %v", err)
	}

	var files []FileStatus
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}
		statusCode := parts[0]
		status := string(statusCode[0]) // first char: M, A, D, R, C, etc.
		path := parts[1]
		oldPath := ""
		if (status == "R" || status == "C") && len(parts) >= 3 {
			oldPath = parts[1]
			path = parts[2]
		}
		files = append(files, FileStatus{
			Path:    path,
			Status:  status,
			Staged:  true,
			OldPath: oldPath,
		})
	}
	return files, nil
}

// --- Branches ---

func (a *App) GetBranches(repoPath string) ([]Branch, error) {
	cmd := exec.Command("git", "-C", repoPath, "branch", "-a", "--format=%(refname:short)|%(HEAD)")
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git branch failed: %v", err)
	}

	var branches []Branch
	seen := map[string]bool{}
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.SplitN(line, "|", 2)
		if len(parts) < 2 {
			continue
		}
		name := strings.TrimSpace(parts[0])
		isCurrent := strings.TrimSpace(parts[1]) == "*"
		isRemote := strings.HasPrefix(name, "remotes/") || strings.HasPrefix(name, "origin/")

		// Normalize remote refs
		if strings.HasPrefix(name, "remotes/") {
			name = name[len("remotes/"):]
		}

		if seen[name] {
			continue
		}
		seen[name] = true

		// Skip HEAD pointer
		if strings.HasSuffix(name, "/HEAD") {
			continue
		}

		branches = append(branches, Branch{
			Name:      name,
			IsCurrent: isCurrent,
			IsRemote:  isRemote,
		})
	}
	return branches, nil
}

func (a *App) GetCurrentBranch(repoPath string) (string, error) {
	cmd := exec.Command("git", "-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD")
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("git rev-parse failed: %v", err)
	}
	return strings.TrimSpace(string(out)), nil
}

func (a *App) CreateBranch(repoPath, branchName string) error {
	cmd := exec.Command("git", "-C", repoPath, "checkout", "-b", branchName)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git checkout -b failed: %s", string(out))
	}
	return nil
}

func (a *App) CheckoutBranch(repoPath, branchName string) error {
	// Strip remote prefix for checkout
	name := branchName
	if strings.HasPrefix(name, "origin/") {
		name = name[len("origin/"):]
	}
	cmd := exec.Command("git", "-C", repoPath, "checkout", name)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git checkout failed: %s", string(out))
	}
	return nil
}

// --- Remote operations ---

func (a *App) Fetch(repoPath string) error {
	cmd := exec.Command("git", "-C", repoPath, "fetch", "--all")
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git fetch failed: %s", string(out))
	}
	return nil
}

func (a *App) Push(repoPath string) error {
	cmd := exec.Command("git", "-C", repoPath, "push")
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	out, err := cmd.CombinedOutput()
	if err != nil {
		msg := string(out)
		if strings.Contains(msg, "No configured push destination") ||
			strings.Contains(msg, "no remote") ||
			strings.Contains(msg, "does not appear to be a git repository") {
			return fmt.Errorf("no-remote")
		}
		return fmt.Errorf("git push failed: %s", msg)
	}
	return nil
}

func (a *App) Pull(repoPath string, remoteName string, branchName string) error {
	args := []string{"-C", repoPath, "pull"}
	if remoteName != "" && branchName != "" {
		args = append(args, remoteName, branchName)
	}
	cmd := exec.Command("git", args...)
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	out, err := cmd.CombinedOutput()
	if err != nil {
		msg := string(out)
		if strings.Contains(msg, "no remote") ||
			strings.Contains(msg, "does not appear to be a git repository") ||
			strings.Contains(msg, "No remote configured") {
			return fmt.Errorf("no-remote")
		}
		if strings.Contains(msg, "divergent branches") || strings.Contains(msg, "Need to specify how to reconcile") {
			return fmt.Errorf("divergent-branches")
		}
		return fmt.Errorf("git pull failed: %s", msg)
	}
	return nil
}

// PullWithStrategy pulls using a specific reconcile strategy: "merge", "rebase", or "ff-only"
func (a *App) PullWithStrategy(repoPath string, strategy string) error {
	var flag string
	switch strategy {
	case "rebase":
		flag = "--rebase"
	case "ff-only":
		flag = "--ff-only"
	default:
		flag = "--no-rebase"
	}
	cmd := exec.Command("git", "-C", repoPath, "pull", flag)
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git pull failed: %s", string(out))
	}
	return nil
}

func (a *App) GetRemotes(repoPath string) []string {
	cmd := exec.Command("git", "-C", repoPath, "remote")
	out, err := cmd.Output()
	if err != nil {
		return []string{}
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	result := []string{}
	for _, l := range lines {
		if l != "" {
			result = append(result, l)
		}
	}
	return result
}

func (a *App) SetRemote(repoPath string, remoteName string, remoteURL string) error {
	// Check if remote already exists
	remotes := a.GetRemotes(repoPath)
	exists := false
	for _, r := range remotes {
		if r == remoteName {
			exists = true
			break
		}
	}
	var cmd *exec.Cmd
	if exists {
		cmd = exec.Command("git", "-C", repoPath, "remote", "set-url", remoteName, remoteURL)
	} else {
		cmd = exec.Command("git", "-C", repoPath, "remote", "add", remoteName, remoteURL)
	}
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to set remote: %s", string(out))
	}
	return nil
}

func (a *App) PushToRemote(repoPath string, remoteName string, branchName string) error {
	cmd := exec.Command("git", "-C", repoPath, "push", "-u", remoteName, branchName)
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git push failed: %s", string(out))
	}
	return nil
}

// --- Developer extras ---

func (a *App) OpenInExplorer(repoPath string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", repoPath)
	case "windows":
		cmd = exec.Command("explorer", repoPath)
	default:
		cmd = exec.Command("xdg-open", repoPath)
	}
	return cmd.Start()
}

func (a *App) OpenInTerminal(repoPath string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		script := fmt.Sprintf(`tell application "Terminal" to do script "cd %s"`, repoPath)
		cmd = exec.Command("osascript", "-e", script)
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", "cmd", "/K", fmt.Sprintf("cd /d %s", repoPath))
	default:
		// Try common terminals
		for _, term := range []string{"gnome-terminal", "xterm", "konsole"} {
			if _, err := exec.LookPath(term); err == nil {
				cmd = exec.Command(term, "--working-directory="+repoPath)
				break
			}
		}
	}
	if cmd == nil {
		return fmt.Errorf("no terminal found")
	}
	return cmd.Start()
}

// --- Folder picker ---

func (a *App) OpenFolderDialog() (string, error) {
	path, err := wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Select a Git Repository",
	})
	if err != nil {
		return "", err
	}
	return path, nil
}

// GetRepoInfo returns basic info about a repository
func (a *App) GetRepoInfo(repoPath string) (map[string]string, error) {
	info := map[string]string{}

	branch, err := a.GetCurrentBranch(repoPath)
	if err == nil {
		info["branch"] = branch
	}

	// Get ahead/behind — try upstream first, fall back to origin/<branch>
	cmd := exec.Command("git", "-C", repoPath, "rev-list", "--left-right", "--count", "HEAD...@{u}")
	out, err2 := cmd.Output()
	if err2 == nil {
		parts := strings.Fields(strings.TrimSpace(string(out)))
		if len(parts) == 2 {
			info["ahead"] = parts[0]
			info["behind"] = parts[1]
		}
	} else if err == nil {
		// No upstream set — count commits on HEAD not reachable from origin/<branch>
		remote := "origin/" + branch
		cmd2 := exec.Command("git", "-C", repoPath, "rev-list", "--count", remote+"..HEAD")
		out2, err3 := cmd2.Output()
		if err3 == nil {
			n := strings.TrimSpace(string(out2))
			if n != "" && n != "0" {
				info["ahead"] = n
			}
		}
	}

	return info, nil
}
