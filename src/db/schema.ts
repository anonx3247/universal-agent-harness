import {
  sqliteTable,
  text,
  integer,
  real,
  unique,
} from "drizzle-orm/sqlite-core";
import { Message } from "@app/models";
import { Model } from "@app/models/provider";

export const runs = sqliteTable(
  "runs",
  {
    id: integer("id").primaryKey(),
    created: integer("created", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updated: integer("updated", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),

    name: text("name").notNull(),
    problem_id: text("problem_id").notNull(),

    profile: text("profile").notNull().default("example"),
    model: text("model").$type<Model>().notNull(),
    agent_count: integer("agent_count").notNull().default(0),
  },
  (t) => [unique().on(t.name)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey(),
    created: integer("created", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updated: integer("updated", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),

    run: integer("run")
      .notNull()
      .references(() => runs.id),
    agent: integer("agent").notNull(),

    position: integer("position").notNull(),

    role: text("role", { enum: ["user", "agent"] as const })
      .$type<Message["role"]>()
      .notNull(),
    content: text("content", { mode: "json" })
      .$type<Message["content"]>()
      .notNull(),

    // Token tracking
    total_tokens: integer("total_tokens").notNull().default(0),
    cost: real("cost").notNull().default(0),
  },
  (t) => [unique().on(t.run, t.agent, t.position)],
);

export const advisories = sqliteTable("advisories", {
  id: integer("id").primaryKey(),
  created: integer("created", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  run_id: integer("run_id")
    .notNull()
    .references(() => runs.id),
  agent_index: integer("agent_index"), // null means broadcast
  content: text("content").notNull(),
  delivered: integer("delivered", { mode: "boolean" })
    .notNull()
    .default(false),
});
