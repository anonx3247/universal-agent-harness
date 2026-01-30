import { db } from "@app/db";
import { runs } from "@app/db/schema";
import { err, ok, Result } from "@app/lib/error";
import { eq, InferSelectModel, InferInsertModel } from "drizzle-orm";

type Run = InferSelectModel<typeof runs>;

export class RunResource {
  private data: Run;

  private constructor(data: Run) {
    this.data = data;
  }

  static async findByName(name: string): Promise<Result<RunResource>> {
    const result = await db
      .select()
      .from(runs)
      .where(eq(runs.name, name))
      .limit(1);

    return result[0]
      ? ok(new RunResource(result[0]))
      : err("not_found_error", `Run '${name}' not found.`);
  }

  static async findById(id: number): Promise<RunResource | null> {
    const result = await db
      .select()
      .from(runs)
      .where(eq(runs.id, id))
      .limit(1);

    return result[0] ? new RunResource(result[0]) : null;
  }

  static async create(
    data: Omit<
      InferInsertModel<typeof runs>,
      "id" | "created" | "updated"
    >,
  ): Promise<RunResource> {
    const [created] = await db.insert(runs).values(data).returning();
    return new RunResource(created);
  }

  static async all(): Promise<RunResource[]> {
    const results = await db.select().from(runs);
    return results.map((data) => new RunResource(data));
  }

  async update(
    data: Partial<Omit<InferInsertModel<typeof runs>, "id" | "created">>,
  ): Promise<RunResource> {
    const [updated] = await db
      .update(runs)
      .set({ ...data, updated: new Date() })
      .where(eq(runs.id, this.data.id))
      .returning();

    this.data = updated;
    return this;
  }

  async delete(): Promise<void> {
    await db.delete(runs).where(eq(runs.id, this.data.id));
  }

  toJSON() {
    return this.data;
  }

  getAgentIndices(): number[] {
    return Array.from({ length: this.data.agent_count }, (_, i) => i);
  }
}

/**
 * Helper function to clean up a run and all its messages.
 * Useful for tests and scripts.
 */
export async function cleanRun(runName: string): Promise<Result<void>> {
  const runRes = await RunResource.findByName(runName);
  if (!runRes.success) {
    return runRes;
  }

  const run = runRes.data;
  const runId = run.toJSON().id;

  // Delete messages first
  const { messages } = await import("@app/db/schema");
  db.delete(messages).where(eq(messages.run, runId)).run();

  // Delete run
  await run.delete();

  return ok(undefined);
}
