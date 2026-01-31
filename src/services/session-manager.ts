/**
 * Session Manager
 *
 * Handles persistent session storage for resuming conversations.
 */

import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";

// Store sessions in user's home directory, not in the project
const SESSIONS_DIR = path.join(os.homedir(), ".support-agent");
const SESSIONS_FILE = path.join(SESSIONS_DIR, "sessions.json");

/**
 * Session metadata
 */
export interface SessionInfo {
  name: string;
  sessionId: string;
  repoPath?: string;
  repoName?: string;
  createdAt: string;
  lastAccessedAt: string;
}

/**
 * Sessions storage structure
 */
interface SessionsStore {
  sessions: Record<string, SessionInfo>;
}

/**
 * Loads the sessions store from disk
 */
async function loadStore(): Promise<SessionsStore> {
  try {
    await fs.ensureDir(SESSIONS_DIR);
    if (await fs.pathExists(SESSIONS_FILE)) {
      const content = await fs.readFile(SESSIONS_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    console.error("Failed to load sessions store:", error);
  }

  return { sessions: {} };
}

/**
 * Saves the sessions store to disk
 */
async function saveStore(store: SessionsStore): Promise<void> {
  await fs.ensureDir(SESSIONS_DIR);
  await fs.writeFile(SESSIONS_FILE, JSON.stringify(store, null, 2));
}

/**
 * Saves a session with the given name
 */
export async function saveSession(
  name: string,
  sessionId: string,
  repoPath?: string,
  repoName?: string
): Promise<void> {
  const store = await loadStore();

  const now = new Date().toISOString();

  store.sessions[name] = {
    name,
    sessionId,
    repoPath,
    repoName,
    createdAt: store.sessions[name]?.createdAt || now,
    lastAccessedAt: now,
  };

  await saveStore(store);
  console.log(`✓ Session saved as "${name}"`);
}

/**
 * Loads a session by name
 */
export async function loadSession(name: string): Promise<SessionInfo | null> {
  const store = await loadStore();
  const session = store.sessions[name];

  if (!session) {
    return null;
  }

  // Update last accessed time
  session.lastAccessedAt = new Date().toISOString();
  await saveStore(store);

  return session;
}

/**
 * Lists all saved sessions
 */
export async function listSessions(): Promise<SessionInfo[]> {
  const store = await loadStore();
  return Object.values(store.sessions).sort(
    (a, b) =>
      new Date(b.lastAccessedAt).getTime() -
      new Date(a.lastAccessedAt).getTime()
  );
}

/**
 * Deletes a session by name
 */
export async function deleteSession(name: string): Promise<boolean> {
  const store = await loadStore();

  if (!store.sessions[name]) {
    return false;
  }

  delete store.sessions[name];
  await saveStore(store);
  console.log(`✓ Session "${name}" deleted`);
  return true;
}

/**
 * Formats session info for display
 */
export function formatSessionInfo(session: SessionInfo): string {
  const repoInfo = session.repoName ? ` (repo: ${session.repoName})` : "";
  const lastAccessed = new Date(session.lastAccessedAt).toLocaleString();
  return `${session.name}${repoInfo} - Last used: ${lastAccessed}`;
}
