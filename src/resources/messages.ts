import { db, Tx } from "@app/db";
import { messages } from "@app/db/schema";
import { eq, InferSelectModel, and, asc, sum } from "drizzle-orm";
import { RunResource } from "./run";
import { Message } from "@app/models";

export class MessageResource {
  private data: InferSelectModel<typeof messages>;
  run: RunResource;

  private constructor(
    data: InferSelectModel<typeof messages>,
    run: RunResource,
  ) {
    this.data = data;
    this.run = run;
  }

  static async findById(
    run: RunResource,
    agentIndex: number,
    id: number,
  ): Promise<MessageResource | null> {
    const result = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.run, run.toJSON().id),
          eq(messages.agent, agentIndex),
          eq(messages.id, id),
        ),
      )
      .limit(1);

    return result[0] ? new MessageResource(result[0], run) : null;
  }

  static async listMessagesByAgent(
    run: RunResource,
    agentIndex: number,
  ): Promise<MessageResource[]> {
    const results = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.run, run.toJSON().id),
          eq(messages.agent, agentIndex),
        ),
      )
      .orderBy(asc(messages.position));

    return results.map((msg) => new MessageResource(msg, run));
  }

  static async listMessagesByRun(
    run: RunResource,
  ): Promise<MessageResource[]> {
    const results = await db
      .select()
      .from(messages)
      .where(eq(messages.run, run.toJSON().id))
      .orderBy(asc(messages.position));

    return results.map((msg) => new MessageResource(msg, run));
  }

  static async create(
    run: RunResource,
    agentIndex: number,
    message: Message,
    positon: number,
    totalTokens: number,
    cost: number,
    options?: { tx?: Tx },
  ): Promise<MessageResource> {
    const executor = options?.tx ?? db;
    const [created] = await executor
      .insert(messages)
      .values({
        run: run.toJSON().id,
        agent: agentIndex,
        ...message,
        position: positon,
        total_tokens: totalTokens,
        cost,
      })
      .returning();

    return new MessageResource(created, run);
  }

  id(): number {
    return this.data.id;
  }

  position(): number {
    return this.data.position;
  }

  created(): Date {
    return new Date(this.data.created);
  }

  toJSON(): Message & { id: number } {
    return {
      id: this.data.id,
      role: this.data.role,
      content: this.data.content,
    };
  }

  static async totalTokensForRun(
    run: RunResource,
  ): Promise<number> {
    const results = await db
      .select({ total: sum(messages.total_tokens) })
      .from(messages)
      .where(eq(messages.run, run.toJSON().id));

    return Number(results[0]?.total ?? 0);
  }

  static async totalCostForRun(
    run: RunResource,
  ): Promise<number> {
    const results = await db
      .select({ total: sum(messages.cost) })
      .from(messages)
      .where(eq(messages.run, run.toJSON().id));

    return Number(results[0]?.total ?? 0);
  }
}

/**
 * Helper function to get messages for a run by name.
 * Returns the Message[] array directly for easier testing.
 */
export async function getMessages(
  runName: string,
  agentIndex: number,
): Promise<{ success: true; data: Message[] } | { success: false; message: string }> {
  const { RunResource } = await import("./run");
  const runRes = await RunResource.findByName(runName);

  if (!runRes.success) {
    return { success: false, message: runRes.message };
  }

  const messageResources = await MessageResource.listMessagesByAgent(
    runRes.data,
    agentIndex,
  );

  return {
    success: true,
    data: messageResources.map((m) => {
      const json = m.toJSON();
      return {
        role: json.role,
        content: json.content,
      };
    }),
  };
}
