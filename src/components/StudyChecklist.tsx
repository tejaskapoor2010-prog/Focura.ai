import React, { useState } from 'react';
import { 
  CheckSquare, 
  Square, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  RotateCcw, 
  Sparkles,
  BookOpen
} from 'lucide-react';
import { StudyChecklistItem, getStudyChecklist, saveStudyChecklist } from '../utils/storage';

export interface StudyChecklistProps {
  userId: string;
  onReadyClick?: () => void;
  disabled?: boolean;
}

export const StudyChecklist: React.FC<StudyChecklistProps> = ({
  userId,
  onReadyClick,
  disabled = false,
}) => {
  const [items, setItems] = useState<StudyChecklistItem[]>(() => getStudyChecklist(userId));
  const [newItemText, setNewItemText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const readyCount = items.filter((i) => i.isReady).length;
  const totalCount = items.length;
  const progressPct = totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0;
  const allReady = totalCount > 0 && readyCount === totalCount;

  const updateItems = (newItems: StudyChecklistItem[]) => {
    setItems(newItems);
    saveStudyChecklist(userId, newItems);
  };

  const handleToggle = (id: string) => {
    if (disabled) return;
    const next = items.map((item) =>
      item.id === id ? { ...item, isReady: !item.isReady } : item
    );
    updateItems(next);
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemText.trim() || disabled) return;
    const newItem: StudyChecklistItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text: newItemText.trim(),
      isReady: false,
      isDefault: false,
    };
    updateItems([...items, newItem]);
    setNewItemText('');
  };

  const handleDeleteItem = (id: string) => {
    if (disabled) return;
    const next = items.filter((item) => item.id !== id);
    updateItems(next);
  };

  const startEdit = (item: StudyChecklistItem) => {
    if (disabled) return;
    setEditingId(item.id);
    setEditText(item.text);
  };

  const saveEdit = (id: string) => {
    if (!editText.trim() || disabled) {
      setEditingId(null);
      return;
    }
    const next = items.map((item) =>
      item.id === id ? { ...item, text: editText.trim() } : item
    );
    updateItems(next);
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleUncheckAll = () => {
    if (disabled) return;
    const next = items.map((item) => ({ ...item, isReady: false }));
    updateItems(next);
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-black font-extrabold shadow-sm">
            <CheckSquare className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">My Study Checklist</h3>
            <p className="text-xs text-zinc-400">Get everything ready on your desk before you begin studying</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {readyCount > 0 && (
            <button
              type="button"
              disabled={disabled}
              onClick={handleUncheckAll}
              className="text-xs font-mono text-zinc-400 hover:text-white px-2 py-1 rounded border border-zinc-800 bg-zinc-900 transition-colors flex items-center gap-1"
              title="Uncheck all items to prepare for another study session"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Uncheck All</span>
            </button>
          )}

          {/* Progress Indicator */}
          <div className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-xl flex items-center gap-2">
            <span className="text-[11px] text-zinc-400">Preparation:</span>
            <span className="font-mono text-xs font-bold text-white">
              {readyCount} of {totalCount} ready
            </span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-white transition-all duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {allReady && (
          <div className="flex items-center gap-1.5 text-xs text-white font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Desk is fully prepared! You are ready for uninterrupted focus.</span>
          </div>
        )}
      </div>

      {/* Checklist items list */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {items.map((item) => {
          const isEditing = editingId === item.id;
          return (
            <div
              key={item.id}
              className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                item.isReady
                  ? 'border-zinc-700 bg-zinc-900/90 text-white'
                  : 'border-zinc-800/80 bg-zinc-900/40 text-zinc-300 hover:border-zinc-700'
              }`}
            >
              {/* Checkbox & text */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleToggle(item.id)}
                  className="text-white hover:text-zinc-300 transition-colors shrink-0"
                  aria-label={item.isReady ? 'Mark as not ready' : 'Mark as ready'}
                >
                  {item.isReady ? (
                    <div className="flex h-5 w-5 items-center justify-center rounded bg-white text-black">
                      <Check className="h-3.5 w-3.5 stroke-[3]" />
                    </div>
                  ) : (
                    <div className="h-5 w-5 rounded border border-zinc-600 hover:border-white transition-colors" />
                  )}
                </button>

                {isEditing ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <input
                      type="text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="flex-1 rounded border border-zinc-600 bg-black px-2 py-1 text-xs text-white focus:border-white focus:outline-none font-sans"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => saveEdit(item.id)}
                      className="p-1 rounded bg-white text-black hover:bg-zinc-200"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="p-1 rounded text-zinc-400 hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <span
                    onClick={() => handleToggle(item.id)}
                    className={`text-xs cursor-pointer select-none truncate ${
                      item.isReady ? 'line-through text-zinc-400' : 'text-zinc-200 font-medium'
                    }`}
                  >
                    {item.text}
                  </span>
                )}
              </div>

              {/* Edit / Delete actions */}
              {!isEditing && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => startEdit(item)}
                    className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                    title="Edit item label"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                    title="Delete item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Custom Checklist Item */}
      <form onSubmit={handleAddItem} className="flex gap-2 pt-1 border-t border-zinc-800/80">
        <input
          type="text"
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          placeholder="Add custom item (e.g. Formula sheet, Graph paper)..."
          disabled={disabled}
          className="flex-1 rounded-xl border border-zinc-800 bg-black px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:border-white focus:outline-none font-sans"
        />
        <button
          type="submit"
          disabled={!newItemText.trim() || disabled}
          className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs border border-zinc-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add</span>
        </button>
      </form>

      {/* Ready to Study Action Button */}
      {onReadyClick && (
        <div className="pt-2">
          <button
            type="button"
            disabled={disabled}
            onClick={onReadyClick}
            className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-200 text-black font-extrabold text-xs shadow-lg transition-all flex items-center justify-center gap-2"
          >
            <Check className="h-4 w-4 stroke-[3]" />
            <span>Ready to Study</span>
          </button>
        </div>
      )}
    </div>
  );
};
