import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTaskStore } from '../../stores';
import type { ScheduledTask } from '../../types/task';

interface TaskDetailModalProps {
  task: ScheduledTask;
  onClose: () => void;
}

export function TaskDetailModal({ task, onClose }: TaskDetailModalProps) {
  const { t } = useTranslation();
  const { fetchOutput } = useTaskStore();
  const [runs, setRuns] = useState<{ timestamp: string; content: string; file?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchOutput(task.id).then((data) => {
      setRuns(data);
      setSelectedIndex(0);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [task.id]);

  const selectedRun = runs[selectedIndex];

  const handleCopy = () => {
    if (!selectedRun?.content) return;
    navigator.clipboard.writeText(selectedRun.content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] bg-white dark:bg-surface rounded-2xl shadow-2xl animate-fade-in-up overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-border-light">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-text truncate">{task.name}</h2>
            <p className="text-[11px] text-text-tertiary mt-0.5">{task.schedule.display}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-secondary text-text-tertiary hover:text-text transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex">
          {/* Run list sidebar */}
          <div className="w-48 shrink-0 border-r border-border-light overflow-y-auto p-3 space-y-1">
            {loading ? (
              <p className="text-[11px] text-text-tertiary px-2">{t('common.loading')}</p>
            ) : runs.length === 0 ? (
              <p className="text-[11px] text-text-tertiary px-2">{t('tasks.noHistory')}</p>
            ) : (
              runs.map((run, i) => (
                <button
                  key={run.file || run.timestamp}
                  onClick={() => setSelectedIndex(i)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-[12px] transition-colors ${
                    i === selectedIndex
                      ? 'bg-accent/10 text-accent font-semibold'
                      : 'text-text-tertiary hover:bg-surface-secondary hover:text-text'
                  }`}
                >
                  {new Date(run.timestamp).toLocaleString()}
                </button>
              ))
            )}
          </div>

          {/* Output panel */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center justify-between px-5 py-2 border-b border-border-light shrink-0">
              <span className="text-[11px] font-semibold text-text-tertiary">
                {selectedRun ? new Date(selectedRun.timestamp).toLocaleString() : t('tasks.noHistory')}
              </span>
              {selectedRun?.content && (
                <button onClick={handleCopy}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-text-tertiary hover:text-text hover:bg-surface-secondary transition-colors">
                  {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {selectedRun ? (
                <div className="prose prose-sm max-w-none dark:prose-invert text-[13px] leading-relaxed text-text-secondary">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selectedRun.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-[13px] text-text-tertiary">{loading ? t('common.loading') : t('tasks.noHistory')}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
