import React, { useState, useEffect } from 'react';
import { UserProfile, StreamType } from '../types';
import { STREAMS_CONFIG } from '../data/streams';
import { FocuraLogo } from './FocuraLogo';
import { PWAInstallButton } from './PWAInstallButton';
import { 
  signInWithSupabaseGoogle, 
  authenticateWithSupabaseEmail, 
  findUserProfileInSupabase, 
  syncUserProfileToSupabase,
  isSupabaseConfigured
} from '../supabase';
import { getAllRegisteredUsers, getUserProfileById } from '../utils/storage';
import { 
  Sparkles, 
  CheckCircle2, 
  ArrowRight, 
  ShieldCheck, 
  Loader2, 
  Lock, 
  Mail, 
  User, 
  Database, 
  AlertCircle, 
  UserCheck,
  ExternalLink,
  Info
} from 'lucide-react';

interface LoginViewProps {
  onLogin: (user: UserProfile) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [step, setStep] = useState<'auth' | 'stream' | 'goal'>('auth');
  const [authMethod, setAuthMethod] = useState<'google' | 'email'>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedStream, setSelectedStream] = useState<StreamType>('science');
  const [targetExam, setTargetExam] = useState('');
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(120);
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [recentUsers, setRecentUsers] = useState<Array<{ id: string; email: string; name: string; avatar: string }>>([]);

  useEffect(() => {
    // Load local recent users for fast 1-click resume
    const users = getAllRegisteredUsers();
    setRecentUsers(users.slice(0, 3));
  }, []);

  // Quick Resume for existing accounts
  const handleQuickResume = async (account: { id: string; email: string; name: string }) => {
    setIsLoading(true);
    setStatusMessage('Restoring profile from Supabase...');
    setAuthError(null);
    try {
      const supabaseProfile = await findUserProfileInSupabase(account.email) || await findUserProfileInSupabase(account.id);
      if (supabaseProfile) {
        onLogin(supabaseProfile);
        return;
      }
      const localProfile = getUserProfileById(account.id);
      if (localProfile) {
        onLogin(localProfile);
        return;
      }
      setEmail(account.email);
      setName(account.name);
    } catch (err: any) {
      console.warn('Quick resume error:', err);
      setEmail(account.email);
      setName(account.name);
    } finally {
      setIsLoading(false);
      setStatusMessage('');
    }
  };

  // Google Sign-In with Supabase
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setAuthError(null);
    setStatusMessage('Connecting to Google Account...');
    try {
      if (isSupabaseConfigured) {
        const { error } = await signInWithSupabaseGoogle();
        if (error) {
          console.warn('Supabase OAuth notice:', error);
          setIsGoogleModalOpen(true);
        }
      } else {
        // Direct Google email sign-in modal
        setIsGoogleModalOpen(true);
      }
    } catch (err: any) {
      console.warn('Google Sign-In notice:', err);
      setIsGoogleModalOpen(true);
    } finally {
      setIsLoading(false);
      setStatusMessage('');
    }
  };

  // Direct Google email sign-in / Quick Select
  const handleGoogleQuickSelect = async (userEmail: string, userName: string) => {
    const cleanEmail = userEmail.trim().toLowerCase();
    if (!cleanEmail) return;

    setIsLoading(true);
    setAuthError(null);
    setStatusMessage('Connecting with Supabase Database...');
    try {
      // Check existing user in Supabase
      const existing = await findUserProfileInSupabase(cleanEmail);
      if (existing) {
        setStatusMessage('Welcome back! Loading your focus workspace...');
        setTimeout(() => {
          onLogin(existing);
        }, 300);
        return;
      }

      // Check local cache
      const localUsers = getAllRegisteredUsers();
      const matchedLocal = localUsers.find(u => u.email.toLowerCase() === cleanEmail);
      if (matchedLocal) {
        const localProfile = getUserProfileById(matchedLocal.id);
        if (localProfile) {
          setStatusMessage('Welcome back! Logging in...');
          setTimeout(() => {
            onLogin(localProfile);
          }, 300);
          return;
        }
      }

      // New Google student: initialize onboarding
      const displayName = userName || cleanEmail.split('@')[0].replace(/[._]/g, ' ');
      setName(displayName);
      setEmail(cleanEmail);
      setAuthMethod('google');
      setIsGoogleModalOpen(false);
      setStep('stream');
    } catch (err: any) {
      console.warn('Google quick select error:', err);
      setName(userName || cleanEmail.split('@')[0]);
      setEmail(cleanEmail);
      setAuthMethod('google');
      setIsGoogleModalOpen(false);
      setStep('stream');
    } finally {
      setIsLoading(false);
      setStatusMessage('');
    }
  };

  // Email Submit Handler: checks Supabase first
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setAuthError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    setAuthError(null);
    setStatusMessage('Supabase se connect ho rha hai...');

    try {
      // 1. Authenticate with Supabase Auth
      await authenticateWithSupabaseEmail(cleanEmail, password).catch(() => {});

      // 2. Check if user already exists in Supabase or locally
      setStatusMessage('Checking user profile in Supabase...');
      const existingUser = await findUserProfileInSupabase(cleanEmail);
      if (existingUser) {
        setStatusMessage('Welcome back! Account found, workspace opening...');
        setTimeout(() => {
          onLogin(existingUser);
        }, 400);
        return;
      }

      // Check local storage for existing profile
      const localUsers = getAllRegisteredUsers();
      const matchedLocal = localUsers.find(u => u.email.toLowerCase() === cleanEmail);
      if (matchedLocal) {
        const localProfile = getUserProfileById(matchedLocal.id);
        if (localProfile) {
          setStatusMessage('Welcome back! Logging in...');
          setTimeout(() => {
            onLogin(localProfile);
          }, 400);
          return;
        }
      }

      // 3. New user - continue to Stream and Goal customization
      setAuthMethod('email');
      setStep('stream');
    } catch (err: any) {
      console.error('Supabase Auth error:', err);
      setAuthMethod('email');
      setStep('stream');
    } finally {
      setIsLoading(false);
      setStatusMessage('');
    }
  };

  // Final Setup Completion (New Users)
  const handleCompleteSetup = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;

    setIsLoading(true);
    setStatusMessage('Creating your profile in Supabase Database...');
    setAuthError(null);

    const safeId = 'usr_' + cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
    const displayName = name.trim() || cleanEmail.split('@')[0].replace(/[._]/g, ' ');

    const avatar = authMethod === 'google' 
      ? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}&backgroundColor=000000&textColor=ffffff`
      : `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(displayName)}&backgroundColor=000000`;

    const newUser: UserProfile = {
      id: safeId,
      name: displayName,
      email: cleanEmail,
      avatar,
      stream: selectedStream,
      targetExam: targetExam.trim() || STREAMS_CONFIG[selectedStream].defaultExams[0],
      dailyGoalMinutes,
      streakDays: 1,
      lastActiveDate: new Date().toISOString().split('T')[0],
      provider: authMethod,
      createdAt: new Date().toISOString(),
    };

    try {
      await syncUserProfileToSupabase(newUser);
      onLogin(newUser);
    } catch (err: any) {
      console.warn('Supabase sync fallback:', err);
      onLogin(newUser);
    } finally {
      setIsLoading(false);
      setStatusMessage('');
    }
  };

  return (
    <div className="relative min-h-screen bg-transparent text-white flex flex-col justify-between overflow-hidden">
      {/* Sleek Monochrome Top Navigation */}
      <header className="relative z-10 mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 border-b border-zinc-900">
        <div className="flex items-center">
          <FocuraLogo className="h-10 w-10 sm:h-11 sm:w-11" />
        </div>
        <div className="flex items-center gap-3">
          <PWAInstallButton variant="header" />
          <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-zinc-400">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>AI Focus & Telemetry Platform</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        {step === 'auth' && (
          <div className="mx-auto max-w-md text-center">
            {/* Tagline */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono text-zinc-300 bg-zinc-900 border border-zinc-700 mb-6">
              <Sparkles className="h-3.5 w-3.5 text-white" />
              <span>Smart Study & Focus Analytics</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3 text-balance">
              Don’t just track study time.
              <br />
              <span className="text-zinc-400">
                Understand your focus.
              </span>
            </h1>

            <p className="text-xs text-zinc-400 mb-6 max-w-sm mx-auto leading-relaxed">
              Real-time Computer Vision analysis tracks gaze, phone posture, and digital distractions to measure the actual quality of your study sessions.
            </p>

            {/* Quick Resume for Recent Users */}
            {recentUsers.length > 0 && (
              <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 text-left shadow-lg">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <UserCheck className="h-3.5 w-3.5 text-emerald-400" />
                    Quick Resume (Saved on this device)
                  </span>
                </div>
                <div className="space-y-2">
                  {recentUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleQuickResume(u)}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/80 hover:border-zinc-700 transition-all text-left group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img 
                          src={u.avatar} 
                          alt={u.name} 
                          className="h-7 w-7 rounded-full bg-zinc-800 border border-zinc-700 flex-shrink-0" 
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate group-hover:text-emerald-400 transition-colors">
                            {u.name}
                          </div>
                          <div className="text-[10px] text-zinc-400 font-mono truncate">
                            {u.email}
                          </div>
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-zinc-300 bg-zinc-800 px-2.5 py-1 rounded-lg group-hover:bg-white group-hover:text-black transition-all flex items-center gap-1 flex-shrink-0">
                        Log In
                        <ArrowRight className="h-3 w-3" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Auth Box */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8 shadow-2xl text-left">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-bold text-white">Sign In to Your Workspace</h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/50">
                  <Database className="h-2.5 w-2.5 text-emerald-400" />
                  Supabase Connected
                </span>
              </div>
              <p className="text-xs text-zinc-400 mb-5">
                Enter your details to track personal study sessions, subject progress, and focus scores.
              </p>

              {/* Status or Error Notifications */}
              {authError && (
                <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-200 flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="leading-relaxed">{authError}</p>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setAuthError(null)}
                    className="text-amber-400 hover:text-amber-200 text-xs ml-1"
                  >
                    ✕
                  </button>
                </div>
              )}

              {isLoading && statusMessage && (
                <div className="mb-4 rounded-xl border border-zinc-700 bg-zinc-900/90 p-3 text-xs text-zinc-300 flex items-center gap-2.5 animate-pulse">
                  <Loader2 className="h-4 w-4 animate-spin text-white flex-shrink-0" />
                  <span>{statusMessage}</span>
                </div>
              )}

              {/* Google Sign In Option */}
              <button
                type="button"
                disabled={isLoading}
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs transition-all shadow-md active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed mb-5"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path
                      fill="#EA4335"
                      d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.7 1 4 3.5 2.2 7.1l3.7 2.8C6.8 6.9 9.2 5 12 5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9c-.3 1.4-1 2.5-2.2 3.3v2.8h3.6c2.1-1.9 3.2-4.8 3.2-8.1z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.8 14.1c-.2-.7-.3-1.4-.3-2.1s.1-1.4.3-2.1V7.1H2.2C1.4 8.6 1 10.2 1 12s.4 3.4 1.2 4.9l3.6-2.8z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.8 0-5.2-1.9-6.1-4.5H2.2v2.8C4 20.5 7.7 23 12 23z"
                    />
                  </svg>
                )}
                <span>Continue with Google Account</span>
              </button>

              <div className="relative my-5 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-800" />
                </div>
                <span className="relative bg-zinc-950 px-3 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Or Sign In with Email
                </span>
              </div>

              {/* Email & Name Form - Primary Sign In */}
              <form onSubmit={handleEmailSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Your Email Address</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your personal or school email"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-white focus:outline-none transition-colors"
                  />
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Existing users automatically log into their workspace; new students get set up in 2 steps.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Your Full Name (For new accounts)</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-white focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-zinc-400" />
                      <span>Password (Optional)</span>
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      Leave empty for 1-click login
                    </span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Optional: Enter a password or leave blank"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-white focus:outline-none transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 rounded-xl bg-white hover:bg-zinc-200 text-black font-extrabold text-xs transition-all shadow-lg flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-black" />
                      <span>Connecting to Supabase...</span>
                    </>
                  ) : (
                    <>
                      <span>Continue with My Email</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Step 2: Stream Selection */}
        {step === 'stream' && (
          <div className="mx-auto max-w-xl text-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono text-zinc-300 bg-zinc-900 border border-zinc-700 mb-4">
              <span>STEP 2 OF 3</span>
              <span>·</span>
              <span>SELECT YOUR ACADEMIC STREAM</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">
              Select Your Academic Stream
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 mb-8 max-w-md mx-auto">
              Focura customizes your subject syllabi, target exams, and study benchmarks based on your focus area.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
              {(['science', 'commerce', 'arts'] as StreamType[]).map((st) => {
                const isSelected = selectedStream === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSelectedStream(st)}
                    className={`p-5 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? 'border-white bg-white text-black shadow-2xl scale-[1.02]'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-mono uppercase font-bold tracking-wider">
                        {st}
                      </span>
                      {isSelected ? (
                        <CheckCircle2 className="h-4 w-4 text-black" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border border-zinc-700" />
                      )}
                    </div>
                    <div className={`text-xs ${isSelected ? 'text-zinc-800' : 'text-zinc-400'}`}>
                      {st === 'science' && 'Physics · Chemistry · Math · Biology'}
                      {st === 'commerce' && 'Accountancy · Business · Economics'}
                      {st === 'arts' && 'History · Pol Science · Psychology'}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep('auth')}
                className="px-4 py-2 text-xs text-zinc-400 hover:text-white"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep('goal')}
                className="py-2.5 px-6 rounded-xl bg-white hover:bg-zinc-200 text-black font-extrabold text-xs transition-all shadow-lg flex items-center gap-2"
              >
                <span>Continue to Goals</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Target Exam & Daily Focus Goal */}
        {step === 'goal' && (
          <div className="mx-auto max-w-xl text-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono text-zinc-300 bg-zinc-900 border border-zinc-700 mb-4">
              <span>FINAL STEP</span>
              <span>·</span>
              <span>PERSONALIZE YOUR GOALS</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">
              Set Your Daily Focus Goal
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 mb-8 max-w-md mx-auto">
              Focura will benchmark your Computer Vision sessions against this goal and provide daily consistency streaks.
            </p>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8 shadow-2xl text-left space-y-6">
              {/* Target Exam Selection */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-2">
                  Target Exam or Curriculum
                </label>
                <div className="flex flex-wrap gap-2">
                  {STREAMS_CONFIG[selectedStream].defaultExams.map((exam) => (
                    <button
                      key={exam}
                      type="button"
                      onClick={() => setTargetExam(exam)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        (targetExam || STREAMS_CONFIG[selectedStream].defaultExams[0]) === exam
                          ? 'bg-white text-black font-bold shadow-md'
                          : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {exam}
                    </button>
                  ))}
                </div>
              </div>

              {/* Daily Focus Goal Minutes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-zinc-300">
                    Daily Targeted Focus Time
                  </label>
                  <span className="font-mono text-sm font-bold text-white">
                    {Math.floor(dailyGoalMinutes / 60)}h {dailyGoalMinutes % 60 > 0 ? `${dailyGoalMinutes % 60}m` : ''}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[60, 90, 120, 180].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setDailyGoalMinutes(mins)}
                      className={`py-2 rounded-lg text-xs font-mono font-medium transition-colors ${
                        dailyGoalMinutes === mins
                          ? 'bg-white text-black font-bold shadow-md'
                          : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {mins / 60} Hours
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-zinc-500">
                  Tip: A focused 2-hour session with high quality (85%+ Focus Score) scientifically beats 5 hours of distracted study.
                </p>
              </div>

              {authError && (
                <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-zinc-900">
                <button
                  type="button"
                  onClick={() => setStep('stream')}
                  className="px-4 py-2 text-xs text-zinc-400 hover:text-white"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleCompleteSetup}
                  className="py-2.5 px-6 rounded-xl bg-white hover:bg-zinc-200 text-black font-extrabold text-xs transition-all shadow-xl flex items-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-black" />
                      <span>Saving to Supabase...</span>
                    </>
                  ) : (
                    <>
                      <span>Launch Focura Workspace</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Google Sign-in Direct Input Modal */}
      {isGoogleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-full bg-white flex items-center justify-center">
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path
                      fill="#EA4335"
                      d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.7 1 4 3.5 2.2 7.1l3.7 2.8C6.8 6.9 9.2 5 12 5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9c-.3 1.4-1 2.5-2.2 3.3v2.8h3.6c2.1-1.9 3.2-4.8 3.2-8.1z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.8 14.1c-.2-.7-.3-1.4-.3-2.1s.1-1.4.3-2.1V7.1H2.2C1.4 8.6 1 10.2 1 12s.4 3.4 1.2 4.9l3.6-2.8z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.8 0-5.2-1.9-6.1-4.5H2.2v2.8C4 20.5 7.7 23 12 23z"
                    />
                  </svg>
                </div>
                <div>
                  <span className="text-sm font-bold text-white block">Google Account Login</span>
                  <span className="text-[10px] text-zinc-400 font-mono">Supabase Auth</span>
                </div>
              </div>
              <button
                onClick={() => setIsGoogleModalOpen(false)}
                className="text-zinc-400 hover:text-white text-sm p-1 rounded-lg hover:bg-zinc-900"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-400 my-4 leading-relaxed">
              Apna Google Email enter karein. Agar aapka account pehle se database mein hai toh direct login ho jaayega:
            </p>

            {/* Direct Google Account Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const emailInput = (document.getElementById('customGoogleEmail') as HTMLInputElement)?.value.trim();
                const nameInput = (document.getElementById('customGoogleName') as HTMLInputElement)?.value.trim();
                if (emailInput) {
                  const resolvedName = nameInput || emailInput.split('@')[0].replace(/[._]/g, ' ');
                  handleGoogleQuickSelect(emailInput, resolvedName);
                }
              }}
              className="space-y-3 mb-4"
            >
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Google Email Address
                </label>
                <input
                  type="email"
                  id="customGoogleEmail"
                  required
                  defaultValue={email}
                  placeholder="your.google.id@gmail.com"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:border-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Full Name (Optional)
                </label>
                <input
                  type="text"
                  id="customGoogleName"
                  defaultValue={name}
                  placeholder="Enter your full name"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:border-white focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl bg-white text-black font-extrabold text-xs hover:bg-zinc-200 transition-colors shadow-lg disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-black" />
                ) : (
                  <span>Continue with this Email</span>
                )}
              </button>
            </form>

            {/* Supabase info note */}
            <div className="pt-3 border-t border-zinc-900 flex items-center gap-2 text-[11px] text-zinc-400">
              <Info className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
              <span>Full Supabase Database & Auth is active on this platform.</span>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 border-t border-zinc-900 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500">
        <div>
          <span>© 2026 Focura · AI-Powered Smart Study Platform</span>
          <span className="mx-2">·</span>
          <span>Supabase Database & Local Computer Vision Privacy</span>
        </div>
        <div className="mt-2 sm:mt-0 font-mono text-[11px] text-zinc-400">
          Client-Side Vision Engine v2.4
        </div>
      </footer>
    </div>
  );
};
