import { readdirSync, existsSync, statSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Result, ok, err } from "./error";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the problems directory path
 * Can be configured via PROBLEMS_DIR environment variable
 */
export function getProblemsDir(): string {
  return process.env.PROBLEMS_DIR || join(__dirname, "../../problems");
}

/**
 * List all available problems by reading the problems directory
 * A problem is valid if it's a directory containing a problem.md file
 */
export function listProblems(): Result<string[]> {
  const problemsDir = getProblemsDir();

  if (!existsSync(problemsDir)) {
    return err(
      "problems_dir_not_found",
      `Problems directory not found: ${problemsDir}`
    );
  }

  try {
    const entries = readdirSync(problemsDir);
    const problems = entries.filter((entry) => {
      const entryPath = join(problemsDir, entry);
      const problemFile = join(entryPath, "problem.md");

      // Must be a directory and contain problem.md
      return (
        statSync(entryPath).isDirectory() && existsSync(problemFile)
      );
    });

    if (problems.length === 0) {
      return err(
        "no_problems_found",
        `No valid problems found in ${problemsDir}. Each problem directory must contain a problem.md file.`
      );
    }

    return ok(problems.sort());
  } catch (error) {
    return err("read_problems_error", "Failed to read problems directory", error);
  }
}

/**
 * Check if a problem exists and is valid
 */
export function problemExists(problemId: string): boolean {
  const problemsDir = getProblemsDir();
  const problemPath = join(problemsDir, problemId);
  const problemFile = join(problemPath, "problem.md");

  return (
    existsSync(problemPath) &&
    statSync(problemPath).isDirectory() &&
    existsSync(problemFile)
  );
}

/**
 * Get the problem content from problem.md
 */
export function getProblemContent(problemId: string): Result<string> {
  if (!problemExists(problemId)) {
    return err(
      "problem_not_found",
      `Problem '${problemId}' not found or invalid`
    );
  }

  try {
    const problemFile = join(getProblemsDir(), problemId, "problem.md");
    const content = readFileSync(problemFile, "utf-8");
    return ok(content);
  } catch (error) {
    return err("read_problem_error", `Failed to read problem '${problemId}'`, error);
  }
}

/**
 * Get the absolute path to a problem directory
 */
export function getProblemDir(problemId: string): string {
  const problemsDir = getProblemsDir();
  return join(problemsDir, problemId);
}

/**
 * Get the absolute path to a file within a problem directory
 *
 * @param problemId - Problem ID (directory name)
 * @param relativePath - Path relative to problem directory (e.g., "data.json", "files/input.txt")
 * @returns Absolute path to the file
 *
 * @example
 * ```typescript
 * // Get path to data.json in problem1
 * const dataPath = getProblemPath("problem1", "data.json");
 * // Returns: /path/to/problems/problem1/data.json
 *
 * // Get path to nested file
 * const inputPath = getProblemPath("problem1", "files/input.txt");
 * // Returns: /path/to/problems/problem1/files/input.txt
 * ```
 */
export function getProblemPath(problemId: string, relativePath: string): string {
  const problemDir = getProblemDir(problemId);
  return join(problemDir, relativePath);
}
