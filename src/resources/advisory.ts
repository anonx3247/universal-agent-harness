import { db } from "@app/db";
import { advisories } from "@app/db/schema";
import { eq, and, or, isNull, InferSelectModel, InferInsertModel } from "drizzle-orm";

type Advisory = InferSelectModel<typeof advisories>;

export class AdvisoryResource {
  private data: Advisory;

  private constructor(data: Advisory) {
    this.data = data;
  }

  static async create(
    data: Omit<InferInsertModel<typeof advisories>, "id" | "created" | "delivered">
  ): Promise<AdvisoryResource> {
    const [created] = await db.insert(advisories).values(data).returning();
    return new AdvisoryResource(created);
  }

  static async listPending(
    runId: number,
    agentIndex: number
  ): Promise<AdvisoryResource[]> {
    const results = await db
      .select()
      .from(advisories)
      .where(
        and(
          eq(advisories.run_id, runId),
          eq(advisories.delivered, false),
          or(
            eq(advisories.agent_index, agentIndex),
            isNull(advisories.agent_index)
          )
        )
      );

    return results.map((data) => new AdvisoryResource(data));
  }

  async markDelivered(): Promise<void> {
    const [updated] = await db
      .update(advisories)
      .set({ delivered: true })
      .where(eq(advisories.id, this.data.id))
      .returning();

    this.data = updated;
  }

  toJSON(): Advisory {
    return this.data;
  }
}
