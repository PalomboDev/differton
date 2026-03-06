/**
 * Wails API wrapper with nice TypeScript types.
 */
import * as App from '../wailsjs/go/main/App';
import type { Repository, FileStatus, CommitInfo, Branch, DiffResult, Preferences } from './types';

export async function loadPreferences(): Promise<Preferences> {
  try {
    const result = (await App.LoadPreferences()) as Preferences;
    console.log('[loadPreferences] result:', JSON.stringify(result));
    return result;
  } catch (e) {
    console.error('[loadPreferences] error:', e);
    return { activeRepoPath: '', diffMode: 'unified', lastView: 'changes', sidebarWidth: 220, panelWidth: 260 };
  }
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  try {
    await App.SavePreferences(prefs);
  } catch {
    // best-effort
  }
}

export async function loadRepositories(): Promise<Repository[]> {
  try {
    return (await App.LoadRepositories()) as Repository[];
  } catch {
    return [];
  }
}

export async function addRepository(path: string): Promise<Repository> {
  return (await App.AddRepository(path)) as Repository;
}

export async function removeRepository(path: string): Promise<void> {
  await App.RemoveRepository(path);
}

export async function getStatus(repoPath: string): Promise<FileStatus[]> {
  return (await App.GetStatus(repoPath)) as FileStatus[];
}

export async function stageFile(repoPath: string, filePath: string): Promise<void> {
  await App.StageFile(repoPath, filePath);
}

export async function unstageFile(repoPath: string, filePath: string): Promise<void> {
  await App.UnstageFile(repoPath, filePath);
}

export async function stageAll(repoPath: string): Promise<void> {
  await App.StageAll(repoPath);
}

export async function unstageAll(repoPath: string): Promise<void> {
  await App.UnstageAll(repoPath);
}

export async function commit(repoPath: string, message: string): Promise<void> {
  await App.Commit(repoPath, message);
}

export async function getDiff(repoPath: string, filePath: string, staged: boolean): Promise<DiffResult> {
  return (await App.GetDiff(repoPath, filePath, staged)) as DiffResult;
}

export async function getCommitDiff(repoPath: string, hash: string, filePath: string): Promise<DiffResult> {
  return (await App.GetCommitDiff(repoPath, hash, filePath)) as DiffResult;
}

export async function getUntrackedDiff(repoPath: string, filePath: string): Promise<DiffResult> {
  return (await App.GetUntrackedDiff(repoPath, filePath)) as DiffResult;
}

export async function getLog(repoPath: string, limit = 100): Promise<CommitInfo[]> {
  return (await App.GetLog(repoPath, limit)) as CommitInfo[];
}

export async function getCommitFiles(repoPath: string, hash: string): Promise<FileStatus[]> {
  return (await App.GetCommitFiles(repoPath, hash)) as FileStatus[];
}

export async function getBranches(repoPath: string): Promise<Branch[]> {
  return (await App.GetBranches(repoPath)) as Branch[];
}

export async function getCurrentBranch(repoPath: string): Promise<string> {
  return await App.GetCurrentBranch(repoPath);
}

export async function createBranch(repoPath: string, name: string): Promise<void> {
  await App.CreateBranch(repoPath, name);
}

export async function checkoutBranch(repoPath: string, name: string): Promise<void> {
  await App.CheckoutBranch(repoPath, name);
}

export async function fetch(repoPath: string): Promise<void> {
  await App.Fetch(repoPath);
}

export async function pull(repoPath: string, remoteName = '', branchName = ''): Promise<void> {
  await App.Pull(repoPath, remoteName, branchName);
}

export async function pullWithStrategy(repoPath: string, strategy: 'merge' | 'rebase' | 'ff-only'): Promise<void> {
  await App.PullWithStrategy(repoPath, strategy);
}

export async function push(repoPath: string): Promise<void> {
  await App.Push(repoPath);
}

export async function pushToRemote(repoPath: string, remoteName: string, branchName: string): Promise<void> {
  await App.PushToRemote(repoPath, remoteName, branchName);
}

export async function getRemotes(repoPath: string): Promise<string[]> {
  try {
    return (await App.GetRemotes(repoPath)) as string[];
  } catch {
    return [];
  }
}

export async function setRemote(repoPath: string, remoteName: string, remoteURL: string): Promise<void> {
  await App.SetRemote(repoPath, remoteName, remoteURL);
}

export async function openInExplorer(repoPath: string): Promise<void> {
  await App.OpenInExplorer(repoPath);
}

export async function openInTerminal(repoPath: string): Promise<void> {
  await App.OpenInTerminal(repoPath);
}

export async function openFolderDialog(): Promise<string> {
  try {
    return await App.OpenFolderDialog();
  } catch {
    return '';
  }
}

export async function getRepoInfo(repoPath: string): Promise<Record<string, string>> {
  try {
    return (await App.GetRepoInfo(repoPath)) as Record<string, string>;
  } catch {
    return {};
  }
}
