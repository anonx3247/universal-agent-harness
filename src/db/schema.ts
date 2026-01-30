import {
  sqliteTable,
  text,
  integer,
  real,
  unique,
} from "drizzle-orm/sqlite-core";
import { Message } from "@app/models";
import { Model } from "@app/models/provider";

export const experiments = sqliteTable(
  "experiments",
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

    experiment: integer("experiment")
      .notNull()
      .references(() => experiments.id),
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
  (t) => [unique().on(t.experiment, t.agent, t.position)],
);
