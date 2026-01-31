/**
 * Repository Manager
 *
 * READ-ONLY service for loading and analyzing repositories.
 * This service explicitly does NOT provide any write, delete, or modify operations.
 */

import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { glob } from "glob";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";

// Store repos in user's home directory, not in the project
const SUPPORT_AGENT_HOME = path.join(os.homedir(), ".support-agent");
const TEMP_REPOS_DIR = path.join(SUPPORT_AGENT_HOME, "repos");
const MAX_FILE_SIZE = 100 * 1024; // 100KB max file size to read
const BINARY_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".svg",
  ".woff", ".woff2", ".ttf", ".eot",
  ".zip", ".tar", ".gz", ".rar",
  ".exe", ".dll", ".so", ".dylib",
  ".pdf", ".doc", ".docx",
  ".mp3", ".mp4", ".wav", ".avi",
];

/**
 * Result of loading a repository
 */
export interface RepoLoadResult {
  path: string;
  name: string;
  fileCount: number;
  repoMap: string;
}

/**
 * Validates that a path exists and is a directory
 */
export async function validateLocalPath(repoPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(repoPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Clones a git repository to a temporary workspace
 * READ-ONLY: Only clones, never modifies remote
 */
export async function cloneRepo(url: string): Promise<string> {
  await fs.ensureDir(TEMP_REPOS_DIR);

  // Generate a unique folder name from the URL
  const repoName = url
    .replace(/^https?:\/\//, "")
    .replace(/\.git$/, "")
    .replace(/[^a-zA-Z0-9-_]/g, "_");

  const targetDir = path.join(TEMP_REPOS_DIR, repoName);

  // If already cloned, return existing path
  if (await fs.pathExists(targetDir)) {
    console.log(`Repository already cached at ${targetDir}`);
    return targetDir;
  }

  console.log(`Cloning ${url}...`);

  await git.clone({
    fs,
    http,
    dir: targetDir,
    url,
    depth: 1, // Shallow clone for speed
    singleBranch: true,
  });

  console.log(`Cloned to ${targetDir}`);
  return targetDir;
}

/**
 * Loads .gitignore patterns from a repository
 */
async function loadGitignorePatterns(repoPath: string): Promise<string[]> {
  const gitignorePath = path.join(repoPath, ".gitignore");
  const defaultIgnores = [
    "node_modules/**",
    ".git/**",
    "dist/**",
    "build/**",
    "coverage/**",
    "*.lock",
    "bun.lock",
    "package-lock.json",
    ".env*",
  ];

  try {
    const content = await fs.readFile(gitignorePath, "utf-8");
    const patterns = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((pattern) => {
        // Convert gitignore patterns to glob patterns
        if (pattern.endsWith("/")) {
          return pattern + "**";
        }
        return pattern;
      });
    return [...defaultIgnores, ...patterns];
  } catch {
    return defaultIgnores;
  }
}

/**
 * Checks if a file is likely binary based on extension
 */
function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.includes(ext);
}

/**
 * Generates a repository map (file tree structure)
 * READ-ONLY: Only reads file system, never modifies
 */
export async function generateRepoMap(repoPath: string): Promise<string> {
  const ignorePatterns = await loadGitignorePatterns(repoPath);

  // Find all files
  const files = await glob("**/*", {
    cwd: repoPath,
    nodir: true,
    ignore: ignorePatterns,
    dot: false,
  });

  // Sort files for consistent output
  files.sort();

  // Build tree structure
  const tree: Record<string, any> = {};

  for (const file of files) {
    const parts = file.split("/");
    let current = tree;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      if (i === parts.length - 1) {
        // It's a file
        current[part] = null;
      } else {
        // It's a directory
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }
    }
  }

  // Convert tree to string representation
  function treeToString(node: Record<string, any>, indent: string = ""): string {
    let result = "";
    const entries = Object.entries(node);

    for (let i = 0; i < entries.length; i++) {
      const [name, value] = entries[i]!;
      const isLast = i === entries.length - 1;
      const prefix = isLast ? "└── " : "├── ";
      const childIndent = isLast ? "    " : "│   ";

      if (value === null) {
        // File
        result += indent + prefix + name + "\n";
      } else {
        // Directory
        result += indent + prefix + name + "/\n";
        result += treeToString(value, indent + childIndent);
      }
    }

    return result;
  }

  const repoName = path.basename(repoPath);
  let map = `Repository: ${repoName}\n`;
  map += `Total files: ${files.length}\n`;
  map += `\nFile structure:\n`;
  map += treeToString(tree);

  return map;
}

/**
 * Reads file content safely
 * READ-ONLY: Only reads, never modifies
 */
export async function getFileContent(
  repoPath: string,
  relativePath: string
): Promise<string | null> {
  const fullPath = path.join(repoPath, relativePath);

  // Security: Ensure the path is within the repo
  const resolvedPath = path.resolve(fullPath);
  const resolvedRepo = path.resolve(repoPath);

  if (!resolvedPath.startsWith(resolvedRepo)) {
    throw new Error("Path traversal attack detected");
  }

  try {
    const stat = await fs.stat(fullPath);

    if (stat.size > MAX_FILE_SIZE) {
      return `[File too large: ${(stat.size / 1024).toFixed(1)}KB, max ${MAX_FILE_SIZE / 1024}KB]`;
    }

    if (isBinaryFile(fullPath)) {
      return `[Binary file: ${relativePath}]`;
    }

    return await fs.readFile(fullPath, "utf-8");
  } catch (error) {
    return null;
  }
}

/**
 * Loads a repository (local or remote) and generates its map
 * READ-ONLY: All operations are read-only
 */
export async function loadRepository(source: string): Promise<RepoLoadResult> {
  let repoPath: string;

  // Check if it's a URL or local path
  if (source.startsWith("http://") || source.startsWith("https://")) {
    repoPath = await cloneRepo(source);
  } else {
    // Resolve relative paths
    repoPath = path.resolve(source);

    if (!(await validateLocalPath(repoPath))) {
      throw new Error(`Invalid path: ${source}`);
    }
  }

  // Generate the repository map
  const repoMap = await generateRepoMap(repoPath);

  // Count files
  const ignorePatterns = await loadGitignorePatterns(repoPath);
  const files = await glob("**/*", {
    cwd: repoPath,
    nodir: true,
    ignore: ignorePatterns,
    dot: false,
  });

  return {
    path: repoPath,
    name: path.basename(repoPath),
    fileCount: files.length,
    repoMap,
  };
}

/**
 * Reads multiple key files from a repository for context
 * READ-ONLY: Only reads files
 */
export async function readKeyFiles(
  repoPath: string,
  maxFiles: number = 5
): Promise<Map<string, string>> {
  const keyFilePatterns = [
    "README.md",
    "readme.md",
    "package.json",
    "tsconfig.json",
    "Cargo.toml",
    "go.mod",
    "requirements.txt",
    "pyproject.toml",
  ];

  const result = new Map<string, string>();

  for (const pattern of keyFilePatterns) {
    if (result.size >= maxFiles) break;

    const content = await getFileContent(repoPath, pattern);
    if (content) {
      result.set(pattern, content);
    }
  }

  return result;
}

/**
 * Reads ALL source files from a repository for full context
 * This is used when the AI doesn't have direct file access
 * READ-ONLY: Only reads files
 */
export async function readAllSourceFiles(
  repoPath: string,
  maxTotalSize: number = 500 * 1024 // 500KB total limit
): Promise<Map<string, string>> {
  const ignorePatterns = await loadGitignorePatterns(repoPath);

  // Source file extensions we want to include
  const sourceExtensions = [
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".py", ".pyw",
    ".go",
    ".rs",
    ".java", ".kt", ".scala",
    ".c", ".cpp", ".h", ".hpp",
    ".cs",
    ".rb",
    ".php",
    ".swift",
    ".vue", ".svelte",
    ".json", ".yaml", ".yml", ".toml",
    ".md", ".txt", ".rst",
    ".sql",
    ".sh", ".bash", ".zsh", ".ps1",
    ".css", ".scss", ".sass", ".less",
    ".html", ".htm",
    ".xml",
    ".env.example",
    ".gitignore",
    "Dockerfile",
    "Makefile",
  ];

  // Find all files
  const files = await glob("**/*", {
    cwd: repoPath,
    nodir: true,
    ignore: ignorePatterns,
    dot: false,
  });

  const result = new Map<string, string>();
  let totalSize = 0;

  // Sort files to prioritize important ones
  const priorityFiles = ["README.md", "package.json", "pyproject.toml", "Cargo.toml", "go.mod"];
  files.sort((a, b) => {
    const aName = path.basename(a);
    const bName = path.basename(b);
    const aPriority = priorityFiles.indexOf(aName);
    const bPriority = priorityFiles.indexOf(bName);

    if (aPriority !== -1 && bPriority === -1) return -1;
    if (bPriority !== -1 && aPriority === -1) return 1;
    if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
    return a.localeCompare(b);
  });

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const basename = path.basename(file);

    // Check if it's a source file or special file
    const isSource = sourceExtensions.includes(ext) ||
      sourceExtensions.includes(basename) ||
      basename === "Dockerfile" ||
      basename === "Makefile";

    if (!isSource) continue;

    const content = await getFileContent(repoPath, file);
    if (content && !content.startsWith("[")) { // Skip binary/too large markers
      const contentSize = Buffer.byteLength(content, "utf-8");

      if (totalSize + contentSize > maxTotalSize) {
        console.log(`  Reached size limit, skipping remaining files...`);
        break;
      }

      result.set(file, content);
      totalSize += contentSize;
    }
  }

  console.log(`  Loaded ${result.size} source files (${(totalSize / 1024).toFixed(1)}KB)`);
  return result;
}

