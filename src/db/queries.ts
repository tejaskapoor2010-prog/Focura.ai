import { eq, desc } from 'drizzle-orm';
import { db } from './index.ts';
import { users, studySessions, revisionCards } from './schema.ts';

export interface UserInput {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  stream?: string;
  targetExam?: string;
  dailyGoalMinutes?: number;
  streakDays?: number;
  lastActiveDate?: string;
  provider?: string;
  subscription?: any;
}

export interface SessionInput {
  id: string;
  userId: string;
  startTime: number | string;
  endTime?: number | string | null;
  durationSeconds: number;
  focusedSeconds: number;
  focusScore: number;
  stream?: string;
  subject: string;
  subTopic?: string;
  distractionEvents?: any[];
  timeline?: any[];
}

export interface RevisionCardInput {
  id: string;
  userId: string;
  stream?: string;
  subject: string;
  topic?: string;
  question: string;
  answer: string;
  keyConcepts?: string[];
  masteryLevel?: string;
  nextReviewDate?: string;
  repetitions?: number;
}

// 1. Get or Upsert User in PostgreSQL
export async function upsertSqlUser(userData: UserInput) {
  try {
    const cleanUid = userData.id.trim();
    const cleanEmail = userData.email.trim().toLowerCase();
    const subStr = userData.subscription ? JSON.stringify(userData.subscription) : null;

    const existing = await db.select().from(users).where(eq(users.uid, cleanUid));
    if (existing.length > 0) {
      const updated = await db.update(users)
        .set({
          name: userData.name || existing[0].name,
          email: cleanEmail,
          avatar: userData.avatar ?? existing[0].avatar,
          stream: userData.stream ?? existing[0].stream,
          targetExam: userData.targetExam ?? existing[0].targetExam,
          dailyGoalMinutes: userData.dailyGoalMinutes ?? existing[0].dailyGoalMinutes,
          streakDays: userData.streakDays ?? existing[0].streakDays,
          lastActiveDate: userData.lastActiveDate ?? existing[0].lastActiveDate,
          provider: userData.provider ?? existing[0].provider,
          subscription: subStr ?? existing[0].subscription,
        })
        .where(eq(users.uid, cleanUid))
        .returning();
      return updated[0];
    } else {
      const inserted = await db.insert(users)
        .values({
          uid: cleanUid,
          name: userData.name || 'Student',
          email: cleanEmail,
          avatar: userData.avatar || '',
          stream: userData.stream || 'science',
          targetExam: userData.targetExam || '',
          dailyGoalMinutes: userData.dailyGoalMinutes || 120,
          streakDays: userData.streakDays || 1,
          lastActiveDate: userData.lastActiveDate || new Date().toISOString().split('T')[0],
          provider: userData.provider || 'email',
          subscription: subStr,
        })
        .returning();
      return inserted[0];
    }
  } catch (error) {
    console.error('Database user upsert failed:', error);
    throw new Error('Database query failed for user upsert.', { cause: error });
  }
}

// 2. Get User from PostgreSQL
export async function getSqlUserByUid(uid: string) {
  try {
    const result = await db.select().from(users).where(eq(users.uid, uid.trim()));
    return result[0] || null;
  } catch (error) {
    console.error('Database get user failed:', error);
    throw new Error('Database query failed for get user.', { cause: error });
  }
}

export async function getSqlUserByEmail(email: string) {
  try {
    const result = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
    return result[0] || null;
  } catch (error) {
    console.error('Database get user by email failed:', error);
    throw new Error('Database query failed for get user by email.', { cause: error });
  }
}

// 3. Save Study Session in PostgreSQL
export async function saveSqlStudySession(session: SessionInput) {
  try {
    const inserted = await db.insert(studySessions)
      .values({
        id: session.id,
        userId: session.userId,
        startTime: String(session.startTime),
        endTime: session.endTime ? String(session.endTime) : null,
        durationSeconds: session.durationSeconds,
        focusedSeconds: session.focusedSeconds,
        focusScore: session.focusScore,
        stream: session.stream || 'science',
        subject: session.subject,
        subTopic: session.subTopic || '',
        distractionEvents: session.distractionEvents ? JSON.stringify(session.distractionEvents) : '[]',
        timeline: session.timeline ? JSON.stringify(session.timeline) : '[]',
      })
      .onConflictDoNothing()
      .returning();
    return inserted[0] || null;
  } catch (error) {
    console.error('Database session save failed:', error);
    throw new Error('Database query failed for session save.', { cause: error });
  }
}

// 4. Get Study Sessions for User from PostgreSQL
export async function getSqlStudySessions(userId: string) {
  try {
    const results = await db.select()
      .from(studySessions)
      .where(eq(studySessions.userId, userId.trim()))
      .orderBy(desc(studySessions.createdAt));

    return results.map(row => ({
      ...row,
      distractionEvents: row.distractionEvents ? JSON.parse(row.distractionEvents) : [],
      timeline: row.timeline ? JSON.parse(row.timeline) : [],
    }));
  } catch (error) {
    console.error('Database get sessions failed:', error);
    throw new Error('Database query failed for get sessions.', { cause: error });
  }
}

// 5. Save Revision Card in PostgreSQL
export async function saveSqlRevisionCard(card: RevisionCardInput) {
  try {
    const inserted = await db.insert(revisionCards)
      .values({
        id: card.id,
        userId: card.userId,
        stream: card.stream || 'science',
        subject: card.subject,
        topic: card.topic || '',
        question: card.question,
        answer: card.answer,
        keyConcepts: card.keyConcepts ? JSON.stringify(card.keyConcepts) : '[]',
        masteryLevel: card.masteryLevel || 'learning',
        nextReviewDate: card.nextReviewDate || '',
        repetitions: card.repetitions || 0,
      })
      .onConflictDoNothing()
      .returning();
    return inserted[0] || null;
  } catch (error) {
    console.error('Database save revision card failed:', error);
    throw new Error('Database query failed for revision card.', { cause: error });
  }
}

// 6. Get Revision Cards for User
export async function getSqlRevisionCards(userId: string) {
  try {
    const results = await db.select()
      .from(revisionCards)
      .where(eq(revisionCards.userId, userId.trim()));

    return results.map(row => ({
      ...row,
      keyConcepts: row.keyConcepts ? JSON.parse(row.keyConcepts) : [],
    }));
  } catch (error) {
    console.error('Database get revision cards failed:', error);
    throw new Error('Database query failed for get revision cards.', { cause: error });
  }
}
