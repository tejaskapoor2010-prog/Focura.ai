import React, { useState, useEffect } from 'react';
import { Clock, Coffee, Sparkles, Sliders, Check } from 'lucide-react';
import { StudySettingsConfig, getStudySessionSettings, saveStudySessionSettings } from '../utils/storage';

export interface StudySessionSettingsProps {
  userId: string;
  onSettingsChange: (settings: StudySettingsConfig) => void;
  disabled?: boolean;
}

const PRESETS: Array<{ study: number; breakMins: number; label: string; desc: string }> = [
  { study: 25, breakMins: 5, label: '25m + 5m', desc: 'Classic Pomodoro — Great for high intensity & quick resets' },
  { study: 45, breakMins: 10, label: '45m + 10m', desc: 'School Period — Matches standard class lecture rhythms' },
  { study: 50, breakMins: 10, label: '50m + 10m', desc: 'Deep Flow (Recommended) — Ideal for complex problem solving' },
  { study: 90, breakMins: 15, label: '90m + 15m', desc: 'Ultradian Cycle — Full cognitive focus block for mock tests' },
];

export const StudySessionSettings: React.FC<StudySessionSettingsProps> = ({
  userId,
  onSettingsChange,
  disabled = false,
}) => {
  const [settings, setSettings] = useState<StudySettingsConfig>(() => getStudySessionSettings(userId));
  const [isCustom, setIsCustom] = useState<boolean>(() => {
    const s = getStudySessionSettings(userId);
    return !PRESETS.some((p) => p.study === s.studyMinutes && p.breakMins === s.breakMinutes);
  });
  const [customStudy, setCustomStudy] = useState<string>(() => String(settings.studyMinutes));
  const [customBreak, setCustomBreak] = useState<string>(() => String(settings.breakMinutes));

  useEffect(() => {
    onSettingsChange(settings);
  }, [settings, onSettingsChange]);

  const handleSelectPreset = (study: number, breakMins: number) => {
    if (disabled) return;
    setIsCustom(false);
    const updated: StudySettingsConfig = {
      ...settings,
      studyMinutes: study,
      breakMinutes: breakMins,
    };
    setSettings(updated);
    saveStudySessionSettings(userId, updated);
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    const s = Math.max(5, Math.min(180, parseInt(customStudy, 10) || 25));
    const b = Math.max(1, Math.min(60, parseInt(customBreak, 10) || 5));
    const updated: StudySettingsConfig = {
      ...settings,
      studyMinutes: s,
      breakMinutes: b,
    };
    setSettings(updated);
    saveStudySessionSettings(userId, updated);
  };

  const handleToggleAutoBreaks = () => {
    if (disabled) return;
    const updated: StudySettingsConfig = {
      ...settings,
      autoBreaksEnabled: !settings.autoBreaksEnabled,
    };
    setSettings(updated);
    saveStudySessionSettings(userId, updated);
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl space-y-4">
      {/* Title & Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-black font-extrabold shadow-sm">
            <Clock className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Study Session Settings</h3>
            <p className="text-xs text-zinc-400">Choose your study duration and scheduled break time</p>
          </div>
        </div>

        {/* Selected Duration Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-xl">
          <span className="text-[11px] text-zinc-400">Selected:</span>
          <span className="font-mono text-xs font-bold text-white">
            {settings.studyMinutes}m study + {settings.breakMinutes}m break
          </span>
        </div>
      </div>

      {/* Preset Buttons */}
      <div>
        <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-2">
          Recommended Timings
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {PRESETS.map((preset) => {
            const isSelected = !isCustom && settings.studyMinutes === preset.study && settings.breakMinutes === preset.breakMins;
            return (
              <button
                key={preset.label}
                type="button"
                disabled={disabled}
                onClick={() => handleSelectPreset(preset.study, preset.breakMins)}
                className={`p-3 rounded-xl border text-left transition-all relative ${
                  isSelected
                    ? 'border-white bg-zinc-900 text-white shadow-md'
                    : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                } disabled:opacity-50`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold font-mono ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                    {preset.label}
                  </span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                </div>
                <div className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed">
                  {preset.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Duration Toggle & Form */}
      <div className="pt-1 border-t border-zinc-800/80">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-zinc-300">Custom Duration</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setIsCustom(!isCustom)}
            className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
              isCustom
                ? 'bg-white text-black border-white font-bold'
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
            }`}
          >
            {isCustom ? 'Using Custom' : 'Set Custom'}
          </button>
        </div>

        {isCustom && (
          <form onSubmit={handleApplyCustom} className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/70 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                  Study Duration (minutes):
                </label>
                <input
                  type="number"
                  min="5"
                  max="180"
                  value={customStudy}
                  onChange={(e) => setCustomStudy(e.target.value)}
                  disabled={disabled}
                  className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-1.5 text-xs text-white font-mono focus:border-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                  Break Duration (minutes):
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={customBreak}
                  onChange={(e) => setCustomBreak(e.target.value)}
                  disabled={disabled}
                  className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-1.5 text-xs text-white font-mono focus:border-white focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={disabled}
              className="py-1.5 px-3 rounded-lg bg-white hover:bg-zinc-200 text-black font-bold text-xs shadow transition-all"
            >
              Save Custom Settings
            </button>
          </form>
        )}
      </div>

      {/* Auto Breaks Toggle Control */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <Coffee className="h-4 w-4 text-zinc-400" />
          <div>
            <div className="text-xs font-semibold text-white">Automatic Break Screen</div>
            <div className="text-[11px] text-zinc-400">
              When study time finishes, smoothly transition to a relaxing break countdown
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={handleToggleAutoBreaks}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
            settings.autoBreaksEnabled ? 'bg-white' : 'bg-zinc-800'
          }`}
          aria-label="Toggle automatic breaks"
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
              settings.autoBreaksEnabled ? 'translate-x-6 bg-black' : 'translate-x-1 bg-zinc-400'
            }`}
          />
        </button>
      </div>
    </div>
  );
};
