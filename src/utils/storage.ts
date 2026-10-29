import { UserProfile, StudySession, RevisionCard, SubjectItem, StreamType } from '../types';
import { DEFAULT_SUBJECTS } from '../data/streams';
import { 
  syncUserProfileToSupabase, 
  saveSessionToSupabase, 
  saveRevisionToSupabase,
  getUserSessionsFromSupabase 
} from '../supabase';
import { recordServerLogin, recordServerSession } from './serverTelemetry';

const STORAGE_KEYS = {
  CURRENT_USER_ID: 'focura_current_user_id',
  USERS: 'focura_users_db',
  USER_PREFIX: 'focura_user_',
  SESSIONS_PREFIX: 'focura_sessions_',
  REVISION_PREFIX: 'focura_revision_',
  SUBJECTS_PREFIX: 'focura_subjects_',
};

/**
 * Returns currently logged-in user, or null if no user is signed in.
 */
export function getCurrentUser(): UserProfile | null {
  try {
    const currentId = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
    if (!currentId) return null;

    const raw = localStorage.getItem(`${STORAGE_KEYS.USER_PREFIX}${currentId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Returns user profile by ID from local cache if present
 */
export function getUserProfileById(userId: string): UserProfile | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.USER_PREFIX}${userId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Saves or updates a user profile both locally and to Firestore
 */
export function saveUserProfile(user: UserProfile): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, user.id);
    localStorage.setItem(`${STORAGE_KEYS.USER_PREFIX}${user.id}`, JSON.stringify(user));

    // Register in users index
    const allUsers = getAllRegisteredUsers();
    if (!allUsers.find((u) => u.id === user.id)) {
      allUsers.push({ id: user.id, email: user.email, name: user.name, avatar: user.avatar });
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(allUsers));
    }

    // Persist to Supabase Database
    syncUserProfileToSupabase(user).catch(() => {});

    // Persist to Cloud SQL Relational Database
    fetch('/api/db/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    }).catch(() => {});

    // Record login on backend server
    recordServerLogin(user).catch(() => {});
  } catch {
    // Storage quota
  }
}

/**
 * Signs out current user
 */
export function logoutUser(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
  } catch {
    //
  }
}

export function getAllRegisteredUsers(): Array<{ id: string; email: string; name: string; avatar: string }> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USERS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Get sessions for specific user. Brand new users will have [] (0 pre-existing data).
 */
export function getUserSessions(userId: string): StudySession[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.SESSIONS_PREFIX}${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveUserSession(userId: string, session: StudySession): void {
  try {
    const sessions = getUserSessions(userId);
    sessions.unshift(session);
    localStorage.setItem(`${STORAGE_KEYS.SESSIONS_PREFIX}${userId}`, JSON.stringify(sessions));

    // Persist session to Supabase Database
    saveSessionToSupabase(userId, session).catch(() => {});

    // Persist session to Cloud SQL Relational Database
    fetch('/api/db/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    }).catch(() => {});

    // Record session & focus score on backend server
    recordServerSession(userId, session).catch(() => {});

    // Update user streak & active day
    const user = getCurrentUser();
    if (user && user.id === userId) {
      const today = new Date().toISOString().split('T')[0];
      if (user.lastActiveDate !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = yesterday.toISOString().split('T')[0];

        if (user.lastActiveDate === yStr) {
          user.streakDays = (user.streakDays || 0) + 1;
        } else {
          user.streakDays = 1; // Started new consecutive streak
        }
        user.lastActiveDate = today;
        saveUserProfile(user);
      }
    }
  } catch {
    //
  }
}

/**
 * Get revision cards for specific user
 */
export function getUserRevisionCards(userId: string): RevisionCard[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.REVISION_PREFIX}${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveUserRevisionCard(userId: string, card: RevisionCard): void {
  try {
    const cards = getUserRevisionCards(userId);
    const existingIndex = cards.findIndex((c) => c.id === card.id);
    if (existingIndex >= 0) {
      cards[existingIndex] = card;
    } else {
      cards.unshift(card);
    }
    localStorage.setItem(`${STORAGE_KEYS.REVISION_PREFIX}${userId}`, JSON.stringify(cards));

    // Persist revision to Supabase Database
    saveRevisionToSupabase(userId, card).catch(() => {});

    // Persist revision to Cloud SQL Relational Database
    fetch('/api/db/revision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    }).catch(() => {});
  } catch {
    //
  }
}

export const saveRevisionCard = (card: RevisionCard): void => {
  if (card && card.userId) {
    saveUserRevisionCard(card.userId, card);
  }
};

export function deleteUserRevisionCard(userId: string, cardId: string): void {
  try {
    const cards = getUserRevisionCards(userId).filter((c) => c.id !== cardId);
    localStorage.setItem(`${STORAGE_KEYS.REVISION_PREFIX}${userId}`, JSON.stringify(cards));
  } catch {
    //
  }
}

/**
 * Get subjects customized for this user (defaults combined with user additions)
 */
export function getUserSubjects(userId: string, stream: StreamType): SubjectItem[] {
  try {
    const defaultStreamSubjects = DEFAULT_SUBJECTS.filter((s) => s.stream === stream);
    const raw = localStorage.getItem(`${STORAGE_KEYS.SUBJECTS_PREFIX}${userId}`);
    if (!raw) return defaultStreamSubjects;

    const custom: SubjectItem[] = JSON.parse(raw);
    const customForStream = custom.filter((s) => s.stream === stream);

    return [...defaultStreamSubjects, ...customForStream];
  } catch {
    return DEFAULT_SUBJECTS.filter((s) => s.stream === stream);
  }
}

export function addCustomSubject(userId: string, subject: SubjectItem): void {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.SUBJECTS_PREFIX}${userId}`);
    const list: SubjectItem[] = raw ? JSON.parse(raw) : [];
    list.push(subject);
    localStorage.setItem(`${STORAGE_KEYS.SUBJECTS_PREFIX}${userId}`, JSON.stringify(list));
  } catch {
    //
  }
}

const STARRY_BG_KEY = 'focura_starry_bg_enabled';

export function getStarryBackgroundEnabled(): boolean {
  try {
    const stored = localStorage.getItem(STARRY_BG_KEY);
    if (stored === null) return true; // Default to true
    return stored === 'true';
  } catch {
    return true;
  }
}

export function setStarryBackgroundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STARRY_BG_KEY, String(enabled));
    window.dispatchEvent(new CustomEvent('focura_starry_bg_changed', { detail: { enabled } }));
  } catch {
    //
  }
}

// ==========================================
// Study Session Settings Storage
// ==========================================
export interface StudySettingsConfig {
  studyMinutes: number;
  breakMinutes: number;
  autoBreaksEnabled: boolean;
}

const DEFAULT_STUDY_SETTINGS: StudySettingsConfig = {
  studyMinutes: 25,
  breakMinutes: 5,
  autoBreaksEnabled: true,
};

export function getStudySessionSettings(userId: string): StudySettingsConfig {
  try {
    const raw = localStorage.getItem(`focura_study_settings_${userId}`);
    if (!raw) return DEFAULT_STUDY_SETTINGS;
    return { ...DEFAULT_STUDY_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STUDY_SETTINGS;
  }
}

export function saveStudySessionSettings(userId: string, settings: StudySettingsConfig): void {
  try {
    localStorage.setItem(`focura_study_settings_${userId}`, JSON.stringify(settings));
  } catch {
    //
  }
}

// ==========================================
// Study Material Checklist Storage
// ==========================================
export interface StudyChecklistItem {
  id: string;
  text: string;
  isReady: boolean;
  isDefault?: boolean;
}

export const DEFAULT_CHECKLIST_ITEMS: Omit<StudyChecklistItem, 'id'>[] = [
  { text: 'Textbook / NCERT', isReady: false, isDefault: true },
  { text: 'Notebook', isReady: false, isDefault: true },
  { text: 'Pen and pencil', isReady: false, isDefault: true },
  { text: 'Study notes', isReady: false, isDefault: true },
  { text: 'Practice questions / PYQs', isReady: false, isDefault: true },
  { text: 'Water bottle', isReady: false, isDefault: true },
  { text: 'Calculator, if required', isReady: false, isDefault: true },
];

export function getStudyChecklist(userId: string): StudyChecklistItem[] {
  try {
    const raw = localStorage.getItem(`focura_checklist_${userId}`);
    if (!raw) {
      return DEFAULT_CHECKLIST_ITEMS.map((item, idx) => ({
        ...item,
        id: `default_${idx}`,
      }));
    }
    const parsed: StudyChecklistItem[] = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_CHECKLIST_ITEMS.map((item, idx) => ({
        ...item,
        id: `default_${idx}`,
      }));
    }
    return parsed;
  } catch {
    return DEFAULT_CHECKLIST_ITEMS.map((item, idx) => ({
      ...item,
      id: `default_${idx}`,
    }));
  }
}

export function saveStudyChecklist(userId: string, items: StudyChecklistItem[]): void {
  try {
    localStorage.setItem(`focura_checklist_${userId}`, JSON.stringify(items));
  } catch {
    //
  }
}

// ==========================================
// Focus Improvement Action Plan Storage
// ==========================================
export interface FocusActionPlanItem {
  id: string;
  topicId: string;
  title: string;
  actionText: string;
  category: string;
  isCompleted: boolean;
  addedAt: number;
}

export function getFocusActionPlan(userId: string): FocusActionPlanItem[] {
  try {
    const raw = localStorage.getItem(`focura_action_plan_${userId}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveFocusActionPlan(userId: string, items: FocusActionPlanItem[]): void {
  try {
    localStorage.setItem(`focura_action_plan_${userId}`, JSON.stringify(items));
  } catch {
    //
  }
}


