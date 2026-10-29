import { createClient, SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';
import { UserProfile, StudySession, RevisionCard, StreamType } from './types';

// Read Supabase credentials from Vite environment
const rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  rawUrl && 
  rawKey && 
  !rawUrl.includes('your-project') && 
  !rawKey.includes('your-anon-key')
);

// Fallback dummy URL and Key so createClient does not crash if user hasn't added keys yet
const supabaseUrl = isSupabaseConfigured ? rawUrl : 'https://focura-mock.supabase.co';
const supabaseKey = isSupabaseConfigured ? rawKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.mock-key';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Sign in with Google using Supabase OAuth
 */
export async function signInWithSupabaseGoogle(): Promise<{ data: any; error: any }> {
  try {
    if (isSupabaseConfigured) {
      return await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
    }
    return { data: null, error: new Error('Supabase URL & Anon Key not configured in environment') };
  } catch (error) {
    console.warn('Supabase Google OAuth error:', error);
    return { data: null, error };
  }
}

/**
 * Sign in or Sign up with email via Supabase Auth
 */
export async function authenticateWithSupabaseEmail(
  email: string, 
  password?: string
): Promise<{ user: SupabaseUser | null; error: any }> {
  const cleanEmail = email.trim().toLowerCase();
  
  if (isSupabaseConfigured) {
    try {
      if (password && password.length >= 6) {
        // Try signing in
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (!signInError && signInData.user) {
          return { user: signInData.user, error: null };
        }

        // If user doesn't exist, try sign up
        if (signInError && (signInError.message.includes('Invalid login') || signInError.status === 400)) {
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: cleanEmail,
            password,
          });
          return { user: signUpData.user, error: signUpError };
        }

        return { user: null, error: signInError };
      } else {
        // Magic link / OTP email
        const { error } = await supabase.auth.signInWithOtp({ email: cleanEmail });
        return { user: null, error };
      }
    } catch (err) {
      console.warn('Supabase Auth error:', err);
      return { user: null, error: err };
    }
  }

  // Self-hosted / fallback mode
  return { user: null, error: null };
}

/**
 * Sign out from Supabase
 */
export async function signOutSupabase(): Promise<void> {
  try {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
  } catch (err) {
    console.warn('Supabase sign out error:', err);
  }
}

/**
 * Find user profile from Supabase Database or SQL API
 */
export async function findUserProfileInSupabase(emailOrId: string): Promise<UserProfile | null> {
  const clean = emailOrId.trim().toLowerCase();

  // 1. Try Supabase direct table query if configured
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .or(`email.eq.${clean},uid.eq.${clean}`)
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.uid || data.id,
          name: data.name,
          email: data.email,
          avatar: data.avatar || '',
          stream: (data.stream as StreamType) || 'science',
          targetExam: data.target_exam || undefined,
          dailyGoalMinutes: data.daily_goal_minutes || 120,
          streakDays: data.streak_days || 1,
          lastActiveDate: data.last_active_date || new Date().toISOString().split('T')[0],
          provider: (data.provider as 'google' | 'email') || 'email',
          createdAt: data.created_at || new Date().toISOString(),
          subscription: data.subscription ? (typeof data.subscription === 'string' ? JSON.parse(data.subscription) : data.subscription) : undefined,
        };
      }
    } catch (err) {
      console.warn('Supabase select user note:', err);
    }
  }

  // 2. Query through PostgreSQL server endpoint
  try {
    const res = await fetch(`/api/db/user-by-email/${encodeURIComponent(clean)}`);
    if (res.ok) {
      const result = await res.json();
      if (result?.user) {
        return {
          id: result.user.uid,
          name: result.user.name,
          email: result.user.email,
          avatar: result.user.avatar || '',
          stream: (result.user.stream as StreamType) || 'science',
          targetExam: result.user.targetExam || undefined,
          dailyGoalMinutes: result.user.dailyGoalMinutes || 120,
          streakDays: result.user.streakDays || 1,
          lastActiveDate: result.user.lastActiveDate || new Date().toISOString().split('T')[0],
          provider: (result.user.provider as 'google' | 'email') || 'email',
          createdAt: result.user.createdAt || new Date().toISOString(),
          subscription: result.user.subscription ? (typeof result.user.subscription === 'string' ? JSON.parse(result.user.subscription) : result.user.subscription) : undefined,
        };
      }
    }
  } catch {}

  return null;
}

/**
 * Sync user profile to Supabase Database
 */
export async function syncUserProfileToSupabase(profile: UserProfile): Promise<void> {
  // 1. Direct Supabase Table Upsert
  if (isSupabaseConfigured) {
    try {
      await supabase.from('users').upsert({
        uid: profile.id,
        name: profile.name,
        email: profile.email.toLowerCase(),
        avatar: profile.avatar,
        stream: profile.stream,
        target_exam: profile.targetExam,
        daily_goal_minutes: profile.dailyGoalMinutes,
        streak_days: profile.streakDays,
        last_active_date: profile.lastActiveDate,
        provider: profile.provider,
        subscription: profile.subscription ? JSON.stringify(profile.subscription) : null,
      }, { onConflict: 'uid' });
    } catch (err) {
      console.warn('Supabase user upsert note:', err);
    }
  }

  // 2. Backend PostgreSQL Relational Sync
  try {
    await fetch('/api/db/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
  } catch {}
}

/**
 * Save study session to Supabase
 */
export async function saveSessionToSupabase(userId: string, session: StudySession): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      await supabase.from('study_sessions').insert({
        id: session.id,
        user_id: userId,
        start_time: session.startTime,
        end_time: session.endTime,
        duration_seconds: session.durationSeconds,
        focused_seconds: session.focusedSeconds,
        focus_score: session.focusScore,
        stream: session.stream,
        subject: session.subject,
        sub_topic: session.subTopic,
        distraction_events: session.distractionEvents ? JSON.stringify(session.distractionEvents) : '[]',
        timeline: session.timeline ? JSON.stringify(session.timeline) : '[]',
      });
    } catch (err) {
      console.warn('Supabase session save note:', err);
    }
  }

  try {
    await fetch('/api/db/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });
  } catch {}
}

/**
 * Fetch user sessions from Supabase
 */
export async function getUserSessionsFromSupabase(userId: string): Promise<StudySession[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('study_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        return data.map((d: any) => ({
          id: d.id,
          userId: d.user_id,
          startTime: Number(d.start_time) || Date.now(),
          endTime: d.end_time ? Number(d.end_time) : (Number(d.start_time) || Date.now()) + (Number(d.duration_seconds) || 0) * 1000,
          durationSeconds: d.duration_seconds,
          focusedSeconds: d.focused_seconds,
          focusScore: d.focus_score,
          stream: (d.stream as StreamType) || 'science',
          subject: d.subject,
          subTopic: d.sub_topic,
          distractionEvents: typeof d.distraction_events === 'string' ? JSON.parse(d.distraction_events) : (d.distraction_events || []),
          timeline: typeof d.timeline === 'string' ? JSON.parse(d.timeline) : (d.timeline || []),
        }));
      }
    } catch (err) {
      console.warn('Supabase get sessions note:', err);
    }
  }

  try {
    const res = await fetch(`/api/db/sessions/${encodeURIComponent(userId)}`);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json?.sessions)) {
        return json.sessions;
      }
    }
  } catch {}

  return [];
}

/**
 * Save Revision Card to Supabase
 */
export async function saveRevisionToSupabase(userId: string, card: RevisionCard): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      await supabase.from('revision_cards').upsert({
        id: card.id,
        user_id: userId,
        stream: card.stream,
        subject: card.subject,
        topic: card.topic,
        question: card.question,
        answer: card.answer,
        key_concepts: card.keyConcepts ? JSON.stringify(card.keyConcepts) : '[]',
        mastery_level: card.masteryLevel,
        next_review_date: card.nextReviewDate,
        repetitions: card.repetitions || 0,
      });
    } catch (err) {
      console.warn('Supabase revision save note:', err);
    }
  }

  try {
    await fetch('/api/db/revision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    });
  } catch {}
}
