export interface Repository {
  path: string;
  name: string;
}

export interface FileStatus {
  path: string;
  status: string; // M, A, D, R, ?
  staged: boolean;
  oldPath: string;
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface Branch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
}

export interface DiffResult {
  content: string;
  error: string;
}

export type ViewType = 'changes' | 'history' | 'branches';

export interface Preferences {
  activeRepoPath: string;
  diffMode: 'unified' | 'split';
  lastView: ViewType;
  sidebarWidth: number;
  panelWidth: number;
}
