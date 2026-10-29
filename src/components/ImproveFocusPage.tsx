import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Lightbulb, 
  Smartphone, 
  Clock, 
  Eye, 
  Droplets, 
  CheckCircle2, 
  CheckSquare, 
  Square, 
  ArrowRight, 
  BrainCircuit, 
  Moon, 
  Compass, 
  ShieldAlert, 
  Activity, 
  Plus, 
  Trash2,
  Play,
  RotateCcw
} from 'lucide-react';
import { UserProfile, StudySession, DistractionEvent } from '../types';
import { 
  getUserSessions, 
  FocusActionPlanItem, 
  getFocusActionPlan, 
  saveFocusActionPlan 
} from '../utils/storage';

interface ImproveFocusPageProps {
  user: UserProfile;
  onStartStudying: () => void;
}

interface HabitTopic {
  id: string;
  category: 'phone' | 'gaze' | 'body' | 'routine' | 'environment';
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  whyItHappens: string;
  howToFix: string[];
  tryThisNextSession: string;
}

const HABIT_TOPICS: HabitTopic[] = [
  {
    id: 'phone-barriers',
    category: 'phone',
    title: '1. Keep Your Phone Out of Arm’s Reach',
    subtitle: 'Stop subconscious phone pickups and notification checking',
    icon: Smartphone,
    whyItHappens:
      'Brain research shows that merely having your smartphone visible on your study desk drains cognitive bandwidth. When your mind hits a difficult formula or dry paragraph, your brain reflexively reaches for your phone for a quick dopamine hit.',
    howToFix: [
      'Place your phone in a drawer, school bag, or another room before opening your book.',
      'Turn on "Do Not Disturb" mode or airplane mode during your focus block.',
      'If you need your phone for lectures, place it face-up on a stand 2 feet away so your hands don’t mindlessly scroll.',
    ],
    tryThisNextSession: 'Put your phone in your bag behind your chair before pressing "Start Studying". Notice how many times you reflexively look for it and catch yourself!',
  },
  {
    id: 'ultradian-rhythm',
    category: 'routine',
    title: '2. Use 50-Minute Study Cycles with 10-Minute Breaks',
    subtitle: 'Align your study periods with your brain’s natural energy waves',
    icon: Clock,
    whyItHappens:
      'Human cognitive stamina naturally peaks and troughs every 90 to 120 minutes (ultradian rhythms). Studying for 3 hours straight without breaks creates brain fog, slowing your learning rate by up to 50%.',
    howToFix: [
      'Choose the 50m study + 10m break or 25m + 5m preset in your study settings.',
      'When your break timer rings, actually step away from your desk. Do not switch tabs to YouTube or social media.',
      'Use your break to stretch your spine, drink cool water, and look out a window.',
    ],
    tryThisNextSession: 'Set a 50m target timer today and take a full 10-minute walk away from all screens when it rings.',
  },
  {
    id: 'desk-sightline',
    category: 'environment',
    title: '3. Set Your Screen & Book at Eye Level',
    subtitle: 'Prevent neck fatigue that causes gaze drift and restlessness',
    icon: Compass,
    whyItHappens:
      'Tilting your head forward at a 45° angle places 40+ lbs of strain on your neck muscles. After 20 minutes, your neck stiffens, triggering unconscious head turns and fidgeting.',
    howToFix: [
      'Elevate your laptop or monitor using books or a stand so the top 1/3 of the screen aligns with your eyes.',
      'Use a book stand or slant board when reading thick textbooks or NCERTs.',
      'Keep your feet flat on the floor with knees at a 90° angle.',
    ],
    tryThisNextSession: 'Prop your laptop up on 2 thick textbooks so you look straight ahead instead of slouching downward.',
  },
  {
    id: 'hydration-oxygen',
    category: 'body',
    title: '4. Hydrate & Breathe Deeply Before Starting',
    subtitle: 'Boost mental alertness and prevent sudden midday drowsiness',
    icon: Droplets,
    whyItHappens:
      'A drop of just 1.5% in body water causes measurable decreases in short-term memory, reaction time, and alertness. Shallow breathing while concentrating reduces oxygen delivery to prefrontal brain tissue.',
    howToFix: [
      'Keep a filled water bottle on your checklist and drink half a glass before every study block.',
      'Take 3 slow "box breaths" (inhale 4s, hold 4s, exhale 4s) right before launching your timer.',
      'Open a window or door to refresh room air and eliminate carbon dioxide buildup.',
    ],
    tryThisNextSession: 'Drink one full glass of water and take 3 deep belly breaths right before you click "Start Studying".',
  },
  {
    id: 'pre-study-ritual',
    category: 'routine',
    title: '5. The 5-Minute Entry Ritual',
    subtitle: 'Clear physical desk clutter to eliminate visual micro-distractions',
    icon: CheckSquare,
    whyItHappens:
      'Visual clutter in your peripheral vision competes for neural attention. Piles of unrelated papers, old cups, and loose chargers constantly pull your peripheral gaze away from your core subject.',
    howToFix: [
      'Use the Focura Study Checklist to lay out only the textbook, notebook, and pen you need.',
      'Put all other books away in your bag until their scheduled study slot.',
      'Write down your exact goal for the session on a sticky note: "Complete Physics Chapter 3 PYQs 1–15".',
    ],
    tryThisNextSession: 'Spend 2 minutes clearing everything off your desk except your target material before checking off your checklist.',
  },
  {
    id: 'eye-fatigue-reset',
    category: 'gaze',
    title: '6. The 20-20-20 Rule for Eye Fatigue',
    subtitle: 'Prevent eye dryness, blinking strain, and gaze wander',
    icon: Eye,
    whyItHappens:
      'When staring at close text or digital screens, your blink rate drops by over 60%. This causes cornea dryness, leading to frequent looking away or rubbing your eyes.',
    howToFix: [
      'Every 20 minutes, look at an object 20 feet away for 20 seconds.',
      'Blink deliberately 5 times to restore moisture to your tear film.',
      'Adjust room lighting so your desk is brighter than your monitor screen to eliminate glare.',
    ],
    tryThisNextSession: 'During your 5 or 10-minute break, look through a window at the furthest tree or cloud you can spot.',
  },
  {
    id: 'active-recall',
    category: 'routine',
    title: '7. Active Recall Over Passive Re-reading',
    subtitle: 'Engage your brain actively so it doesn’t wander out of boredom',
    icon: BrainCircuit,
    whyItHappens:
      'Passive re-reading gives an illusion of competence while allowing your thoughts to drift to memories or daydreams. Without active struggle, the brain seeks entertainment.',
    howToFix: [
      'Read one page, close the book, and explain the core concept out loud in simple words.',
      'Solve practice questions or past year papers (PYQs) rather than just highlighting text.',
      'Use the Focura Revision Support deck to test yourself on spaced flashcards.',
    ],
    tryThisNextSession: 'After finishing a topic, close your notes and write a 3-bullet summary from memory on a blank sheet of paper.',
  },
  {
    id: 'restlessness-management',
    category: 'body',
    title: '8. Channeling Restless Physical Energy',
    subtitle: 'Soothe physical fidgeting without breaking your cognitive flow',
    icon: Activity,
    whyItHappens:
      'High stress, caffeine, or long sitting generates physical motor tension. Students often mistake physical restlessness for lack of study motivation.',
    howToFix: [
      'Do 15 quick squats or jumping jacks right before sitting down to study.',
      'Keep your hands occupied with a smooth pen or stress ball if you tend to touch your face or hair.',
      'Try the "Book Reading Mode" in Focura if you prefer taking active handwritten notes while studying.',
    ],
    tryThisNextSession: 'Do 10 calf raises or stretches during your 5-minute break to clear physical jitters.',
  },
  {
    id: 'sleep-consistency',
    category: 'routine',
    title: '9. Sleep Consistency for Focus Retention',
    subtitle: 'Consolidate memory traces and eliminate heavy eyelids during study',
    icon: Moon,
    whyItHappens:
      'During slow-wave and REM sleep, the hippocampus replays study memories and transfers them to the neocortex. Losing just 1 hour of sleep drops daytime focus stability by 30%.',
    howToFix: [
      'Keep a consistent bedtime within a 30-minute window, even on weekends.',
      'Stop using backlit phones or tablets 45 minutes before sleep.',
      'If you feel drowsy during study, wash your face with cool water or stand up and read notes while walking.',
    ],
    tryThisNextSession: 'Aim for a consistent bedtime tonight and notice how much easier it is to hold focus in tomorrow’s first session.',
  },
  {
    id: 'gaze-wander-discipline',
    category: 'gaze',
    title: '10. Resetting After a Focus Slip',
    subtitle: 'Don’t judge yourself when your mind wanders — just gently bring it back',
    icon: Compass,
    whyItHappens:
      'The human mind naturally generates wandering thoughts (the default mode network). Frustration over getting distracted creates an emotional loop that ruins the rest of your session.',
    howToFix: [
      'Treat distraction detection as a helpful tap on the shoulder, not a punishment.',
      'When the alert chimes, say "I noticed my focus drifted" and take one deep breath.',
      'Immediately read the very next sentence out loud to snap your attention back to your book.',
    ],
    tryThisNextSession: 'Next time your gaze wanders, immediately read one paragraph out loud to snap your voice and eyes into alignment.',
  },
];

export const ImproveFocusPage: React.FC<ImproveFocusPageProps> = ({
  user,
  onStartStudying,
}) => {
  const [sessions, setSessions] = useState<StudySession[]>(() => getUserSessions(user.id));
  const [actionPlan, setActionPlan] = useState<FocusActionPlanItem[]>(() => getFocusActionPlan(user.id));
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [newActionText, setNewActionText] = useState<string>('');

  useEffect(() => {
    setSessions(getUserSessions(user.id));
  }, [user.id]);

  const recentSession = sessions[0] || null;

  // Determine customized tip based on recent distraction patterns
  const getDynamicTip = () => {
    if (!recentSession || recentSession.distractionEvents.length === 0) {
      return {
        title: 'Build Consistent Focus Habits',
        reason: 'Start a session in the Study Room with your camera on to track your focus rhythms and receive custom advice.',
        highlightTopicId: 'pre-study-ritual',
        action: 'Lay out your study materials and try a 25-minute Pomodoro study block today.',
        badge: 'GET STARTED',
      };
    }

    const events = recentSession.distractionEvents;
    const phoneCount = events.filter((e) => e.type === 'phone_posture').length;
    const lookingAwayCount = events.filter((e) => e.type === 'looking_away').length;
    const absentCount = events.filter((e) => e.type === 'absent').length;
    const drowsyCount = events.filter((e) => e.type === 'drowsy').length;

    if (phoneCount > 0) {
      return {
        title: 'Top Tip: Put Your Phone Out of Sight',
        reason: `Your last study session logged ${phoneCount} phone-related interruption(s). Keep your phone in another room or inside your bag.`,
        highlightTopicId: 'phone-barriers',
        action: 'Put your phone in your school bag before launching your next study block.',
        badge: 'BASED ON LAST SESSION',
      };
    }

    if (drowsyCount > 0) {
      return {
        title: 'Top Tip: Hydrate & Reset Room Air',
        reason: 'Drowsiness or prolonged eye closures were detected during your study time.',
        highlightTopicId: 'hydration-oxygen',
        action: 'Drink half a glass of cool water and open a window for fresh oxygen.',
        badge: 'ENERGY RECOVERY',
      };
    }

    if (lookingAwayCount >= 3) {
      return {
        title: 'Top Tip: Align Your Screen & Clear Sightline',
        reason: `Your gaze wandered away ${lookingAwayCount} times during your last session. Desk clutter or poor screen angle may be pulling your eyes away.`,
        highlightTopicId: 'desk-sightline',
        action: 'Elevate your book or laptop to eye level and clear visual distractions from your desk.',
        badge: 'GAZE STABILITY',
      };
    }

    if (absentCount > 0) {
      return {
        title: 'Top Tip: Complete Your Desk Preparation First',
        reason: 'You had to leave your study seat during your session to fetch items.',
        highlightTopicId: 'pre-study-ritual',
        action: 'Use "My Study Checklist" to get all pens, notes, and water ready before clicking start.',
        badge: 'PREPARATION TIP',
      };
    }

    return {
      title: 'Top Tip: Keep Up Your High Focus Flow',
      reason: `Awesome work! You scored ${recentSession.focusScore}% focus in your last session. Now maintain this streak with active recall.`,
      highlightTopicId: 'active-recall',
      action: 'Test yourself on flashcards or solve practice problems to lock in what you learned.',
      badge: 'MAINTAIN MOMENTUM',
    };
  };

  const dynamicTip = getDynamicTip();

  const handleToggleActionItem = (id: string) => {
    const next = actionPlan.map((item) =>
      item.id === id ? { ...item, isCompleted: !item.isCompleted } : item
    );
    setActionPlan(next);
    saveFocusActionPlan(user.id, next);
  };

  const handleAddHabitToActionPlan = (topic: HabitTopic) => {
    if (actionPlan.some((a) => a.topicId === topic.id)) return;
    const newItem: FocusActionPlanItem = {
      id: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      topicId: topic.id,
      title: topic.title,
      actionText: topic.tryThisNextSession,
      category: topic.category,
      isCompleted: false,
      addedAt: Date.now(),
    };
    const next = [...actionPlan, newItem];
    setActionPlan(next);
    saveFocusActionPlan(user.id, next);
  };

  const handleAddCustomAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActionText.trim()) return;
    const newItem: FocusActionPlanItem = {
      id: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      topicId: 'custom',
      title: 'Custom Focus Goal',
      actionText: newActionText.trim(),
      category: 'routine',
      isCompleted: false,
      addedAt: Date.now(),
    };
    const next = [...actionPlan, newItem];
    setActionPlan(next);
    saveFocusActionPlan(user.id, next);
    setNewActionText('');
  };

  const handleDeleteActionItem = (id: string) => {
    const next = actionPlan.filter((item) => item.id !== id);
    setActionPlan(next);
    saveFocusActionPlan(user.id, next);
  };

  const filteredTopics = selectedCategory === 'all'
    ? HABIT_TOPICS
    : HABIT_TOPICS.filter((t) => t.category === selectedCategory);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-zinc-800 bg-zinc-950">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono uppercase tracking-widest text-zinc-400">
              FOCURA · FOCUS HABITS & REMEDIES
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold border border-zinc-700 bg-zinc-900 text-zinc-300">
              STUDY TIPS
            </span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white mt-1">
            Improve My Focus
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Practical study habits and techniques to eliminate distractions, protect your eyes, and build deep focus.
          </p>
        </div>

        <button
          onClick={onStartStudying}
          className="py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-200 text-black font-extrabold text-xs shadow-md transition-all flex items-center gap-2 self-start sm:self-auto"
        >
          <Play className="h-3.5 w-3.5 fill-black" />
          <span>Start Studying</span>
        </button>
      </div>

      {/* Dynamic Recommendation Banner Grounded in Real Data */}
      <div className="p-5 rounded-2xl border border-white/20 bg-gradient-to-r from-zinc-900 via-zinc-950 to-black shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-black font-extrabold shadow-md shrink-0 mt-0.5">
              <Lightbulb className="h-6 w-6 stroke-[2.2]" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  A Tip for Your Next Session
                </span>
                <span className="text-[10px] font-mono font-extrabold px-2 py-0.5 rounded bg-white text-black">
                  {dynamicTip.badge}
                </span>
              </div>
              <h2 className="text-base font-bold text-white">{dynamicTip.title}</h2>
              <p className="text-xs text-zinc-300 leading-relaxed max-w-2xl">
                {dynamicTip.reason}
              </p>
              <div className="text-xs text-zinc-200 font-medium pt-1 flex items-center gap-1.5">
                <span className="text-white font-bold">Action:</span>
                <span>{dynamicTip.action}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start md:self-auto">
            <button
              onClick={() => {
                const targetTopic = HABIT_TOPICS.find((t) => t.id === dynamicTip.highlightTopicId);
                if (targetTopic) handleAddHabitToActionPlan(targetTopic);
              }}
              className="py-2 px-3.5 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add to My Action Plan</span>
            </button>
          </div>
        </div>
      </div>

      {/* My Focus Action Plan Section */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-black font-extrabold shadow-sm">
              <CheckSquare className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">My Focus Action Plan</h3>
              <p className="text-xs text-zinc-400">Habits you have committed to trying in your next study sessions</p>
            </div>
          </div>

          <div className="text-xs font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-xl">
            {actionPlan.filter((a) => a.isCompleted).length} of {actionPlan.length} completed
          </div>
        </div>

        {actionPlan.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-zinc-800 text-center space-y-2">
            <p className="text-xs text-zinc-400">
              No habits added yet. Browse the 10 topics below and click <span className="text-white font-bold">"Add to Action Plan"</span> to track remedies you want to practice!
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {actionPlan.map((item) => (
              <div
                key={item.id}
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                  item.isCompleted
                    ? 'border-zinc-800 bg-zinc-900/40 text-zinc-400'
                    : 'border-zinc-700 bg-zinc-900/80 text-white'
                }`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => handleToggleActionItem(item.id)}
                    className="shrink-0"
                    aria-label={item.isCompleted ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {item.isCompleted ? (
                      <div className="flex h-5 w-5 items-center justify-center rounded bg-white text-black">
                        <CheckCircle2 className="h-4 w-4 stroke-[2.5]" />
                      </div>
                    ) : (
                      <div className="h-5 w-5 rounded border border-zinc-500 hover:border-white transition-colors" />
                    )}
                  </button>

                  <div className="min-w-0">
                    <div className={`text-xs font-bold truncate ${item.isCompleted ? 'line-through text-zinc-500' : 'text-white'}`}>
                      {item.title}
                    </div>
                    <div className={`text-xs ${item.isCompleted ? 'text-zinc-600 line-through' : 'text-zinc-300'}`}>
                      {item.actionText}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteActionItem(item.id)}
                  className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors shrink-0"
                  title="Remove from plan"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add custom goal form */}
        <form onSubmit={handleAddCustomAction} className="flex gap-2 pt-2 border-t border-zinc-800">
          <input
            type="text"
            value={newActionText}
            onChange={(e) => setNewActionText(e.target.value)}
            placeholder="Write your own focus commitment (e.g. Leave phone in drawing room)..."
            className="flex-1 rounded-xl border border-zinc-800 bg-black px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:border-white focus:outline-none"
          />
          <button
            type="submit"
            disabled={!newActionText.trim()}
            className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs border border-zinc-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Goal</span>
          </button>
        </form>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { id: 'all', label: 'All 10 Habits' },
          { id: 'phone', label: 'Phone & Digital' },
          { id: 'gaze', label: 'Eyes & Gaze' },
          { id: 'routine', label: 'Timing & Breaks' },
          { id: 'body', label: 'Body & Hydration' },
          { id: 'environment', label: 'Desk Setup' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSelectedCategory(tab.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors border ${
              selectedCategory === tab.id
                ? 'bg-white text-black border-white'
                : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 10 Habit Topic Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredTopics.map((topic) => {
          const IconComp = topic.icon;
          const isAdded = actionPlan.some((a) => a.topicId === topic.id);

          return (
            <div
              key={topic.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-lg flex flex-col justify-between space-y-4 hover:border-zinc-700 transition-colors"
            >
              <div className="space-y-3">
                {/* Topic Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 text-white shrink-0 mt-0.5">
                      <IconComp className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white leading-snug">{topic.title}</h3>
                      <div className="text-xs text-zinc-400 mt-0.5">{topic.subtitle}</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAddHabitToActionPlan(topic)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 border transition-colors shrink-0 ${
                      isAdded
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-400'
                        : 'bg-white text-black border-white hover:bg-zinc-200'
                    }`}
                  >
                    {isAdded ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Added</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-3 w-3" />
                        <span>Add</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Why It Happens */}
                <div className="p-3 rounded-xl border border-zinc-850 bg-zinc-900/50 space-y-1">
                  <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                    Why This Happens
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {topic.whyItHappens}
                  </p>
                </div>

                {/* Practical Action Steps */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                    Practical Steps
                  </div>
                  <ul className="space-y-1">
                    {topic.howToFix.map((step, idx) => (
                      <li key={idx} className="text-xs text-zinc-300 flex items-start gap-2">
                        <span className="text-white font-mono font-bold">•</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Try This Next Session Tip */}
              <div className="p-3 rounded-xl border border-zinc-800 bg-black flex items-start gap-2 text-xs">
                <Sparkles className="h-4 w-4 text-white shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white">Try This Next Session: </span>
                  <span className="text-zinc-300">{topic.tryThisNextSession}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
