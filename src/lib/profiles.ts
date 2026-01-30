import { readdirSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Result, ok, err } from "./error";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the profiles directory path
 * Can be configured via PROFILES_DIR environment variable
 */
export function getProfilesDir(): string {
  return process.env.PROFILES_DIR || join(__dirname, "../../profiles");
}

/**
 * List all available profiles by reading the profiles directory
 * A profile is valid if it's a directory containing a prompt.md file
 */
export function listProfiles(): Result<string[]> {
  const profilesDir = getProfilesDir();

  if (!existsSync(profilesDir)) {
    return err(
      "profiles_dir_not_found",
      `Profiles directory not found: ${profilesDir}`
    );
  }

  try {
    const entries = readdirSync(profilesDir);
    const profiles = entries.filter((entry) => {
      const entryPath = join(profilesDir, entry);
      const promptPath = join(entryPath, "prompt.md");

      // Must be a directory and contain prompt.md
      return (
        statSync(entryPath).isDirectory() && existsSync(promptPath)
      );
    });

    if (profiles.length === 0) {
      return err(
        "no_profiles_found",
        `No valid profiles found in ${profilesDir}. Each profile directory must contain a prompt.md file.`
      );
    }

    return ok(profiles.sort());
  } catch (error) {
    return err("read_profiles_error", "Failed to read profiles directory", error);
  }
}

/**
 * Check if a profile exists and is valid
 */
export function profileExists(profile: string): boolean {
  const profilesDir = getProfilesDir();
  const profilePath = join(profilesDir, profile);
  const promptPath = join(profilePath, "prompt.md");

  return (
    existsSync(profilePath) &&
    statSync(profilePath).isDirectory() &&
    existsSync(promptPath)
  );
}

/**
 * Get the default profile
 * Returns the first alphabetically if "example" doesn't exist
 */
export function getDefaultProfile(): Result<string> {
  const profilesResult = listProfiles();
  if (profilesResult.isErr()) {
    return profilesResult;
  }

  const profiles = profilesResult.value;

  // Prefer "example" if it exists
  if (profiles.includes("example")) {
    return ok("example");
  }

  // Otherwise return the first one alphabetically
  return ok(profiles[0]);
}

/**
 * Get the absolute path to a profile directory
 */
export function getProfileDir(profile: string): string {
  const profilesDir = getProfilesDir();
  return join(profilesDir, profile);
}

/**
 * Get the absolute path to a file within a profile directory
 *
 * @param profile - Profile name
 * @param relativePath - Path relative to profile directory (e.g., "cookies.json", "data/config.json")
 * @returns Absolute path to the file
 *
 * @example
 * ```typescript
 * // Get path to cookies.json in example profile
 * const cookiesPath = getProfilePath("example", "cookies.json");
 * // Returns: /path/to/profiles/example/cookies.json
 *
 * // Get path to nested file
 * const dataPath = getProfilePath("example", "data/config.json");
 * // Returns: /path/to/profiles/example/data/config.json
 * ```
 */
export function getProfilePath(profile: string, relativePath: string): string {
  const profileDir = getProfileDir(profile);
  return join(profileDir, relativePath);
}
