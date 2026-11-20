import { sql } from "drizzle-orm";
import {
  char,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    deviceId: text("device_id").notNull(),
    name: text("name").notNull().default("Student"),
    username: text("username"),
    bio: text("bio").default(""),
    avatarColor: text("avatar_color").default("#1A6BFF"),
    friendCode: char("friend_code", { length: 6 }).notNull(),
    xp: integer("xp").default(0),
    streak: integer("streak").default(0),
    studyHours: doublePrecision("study_hours").default(0),
    tasksCompleted: integer("tasks_completed").default(0),
    longestStreak: integer("longest_streak").default(0),
    updatedAt: timestamp("updated_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow(),
    email: text("email"),
    passwordHash: text("password_hash"),
    sessionToken: text("session_token"),
    resetToken: text("reset_token"),
    resetExpires: timestamp("reset_expires", { withTimezone: true }),
    studyStats: jsonb("study_stats").$type<Record<string, unknown>>().default({}),
  },
  (table) => ({
    deviceIdUnique: unique("users_device_id_key").on(table.deviceId),
    usernameUnique: unique("users_username_key").on(table.username),
    friendCodeUnique: unique("users_friend_code_key").on(table.friendCode),
    emailUnique: uniqueIndex("users_email_unique")
      .on(sql`lower(${table.email})`)
      .where(sql`${table.email} IS NOT NULL AND ${table.email} <> ''`),
  }),
);

export const friendships = pgTable(
  "friendships",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    deviceId1: text("device_id1").notNull(),
    deviceId2: text("device_id2").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    devicePairUnique: unique("friendships_device_id1_device_id2_key").on(
      table.deviceId1,
      table.deviceId2,
    ),
  }),
);

export const friendRequests = pgTable(
  "friend_requests",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    fromDeviceId: text("from_device_id").notNull(),
    toDeviceId: text("to_device_id").notNull(),
    status: text("status").default("pending"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    devicePairUnique: unique("friend_requests_from_device_id_to_device_id_key").on(
      table.fromDeviceId,
      table.toDeviceId,
    ),
  }),
);

export const userAppData = pgTable("user_app_data", {
  deviceId: text("device_id").primaryKey(),
  appState: jsonb("app_state").$type<Record<string, unknown>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Friendship = typeof friendships.$inferSelect;
export type FriendRequest = typeof friendRequests.$inferSelect;
export type UserAppData = typeof userAppData.$inferSelect;