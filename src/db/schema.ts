import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// Users table (PostgreSQL Relational DB)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID or unique student ID
  name: text('name').notNull(),
  email: text('email').notNull(),
  avatar: text('avatar'),
  stream: text('stream').default('science').notNull(),
  targetExam: text('target_exam'),
  dailyGoalMinutes: integer('daily_goal_minutes').default(120).notNull(),
  streakDays: integer('streak_days').default(1).notNull(),
  lastActiveDate: text('last_active_date'),
  provider: text('provider').default('email').notNull(),
  subscription: text('subscription'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Study Sessions table
export const studySessions = pgTable('study_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time'),
  durationSeconds: integer('duration_seconds').notNull(),
  focusedSeconds: integer('focused_seconds').notNull(),
  focusScore: integer('focus_score').notNull(),
  stream: text('stream'),
  subject: text('subject').notNull(),
  subTopic: text('sub_topic'),
  distractionEvents: text('distraction_events'),
  timeline: text('timeline'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Spaced Repetition Revision Cards table
export const revisionCards = pgTable('revision_cards', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  stream: text('stream'),
  subject: text('subject').notNull(),
  topic: text('topic'),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  keyConcepts: text('key_concepts'),
  masteryLevel: text('mastery_level'),
  nextReviewDate: text('next_review_date'),
  repetitions: integer('repetitions').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

// Relationships
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(studySessions),
  revisions: many(revisionCards),
}));

export const studySessionsRelations = relations(studySessions, ({ one }) => ({
  user: one(users, {
    fields: [studySessions.userId],
    references: [users.uid],
  }),
}));

export const revisionCardsRelations = relations(revisionCards, ({ one }) => ({
  user: one(users, {
    fields: [revisionCards.userId],
    references: [users.uid],
  }),
}));
