import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, Copy, Check, Clock, FileText } from 'lucide-react';
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
      <div className="w-full max-w-3xl max-h-[85vh] bg-white dark:bg-surface rounded-2xl shadow-2xl animate-fade-in-up overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border-light">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-text truncate">{task.name}</h2>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="inline-flex items-center gap-1 text-[11px] text-text-tertiary bg-surface-secondary/70 px-2 py-0.5 rounded-md">
                  <Clock size={10} />{task.schedule.display}
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase ${
                  task.lastStatus === 'completed' ? 'bg-green-500/10 text-green-500' :
                  task.lastStatus === 'failed' ? 'bg-red-500/10 text-red-500' :
                  task.lastStatus === 'running' ? 'bg-accent/10 text-accent' :
                  'bg-surface-secondary text-text-tertiary'
                }`}>
                  {t(`tasks.${task.lastStatus || 'pending'}`)}
                </span>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-secondary text-text-tertiary hover:text-text transition-colors shrink-0">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex">
          {/* Run list sidebar */}
          <div className="w-52 shrink-0 border-r border-border-light flex flex-col bg-surface-secondary/20">
            <div className="px-4 py-2.5 border-b border-border-light">
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
                {t('tasks.history')}{runs.length > 0 ? ` · ${runs.length}` : ''}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {loading ? (
                <p className="text-[11px] text-text-tertiary px-3 py-2">{t('common.loading')}</p>
              ) : runs.length === 0 ? (
                <p className="text-[11px] text-text-tertiary px-3 py-2">{t('tasks.noHistory')}</p>
              ) : (
                runs.map((run, i) => (
                  <button
                    key={run.file || run.timestamp}
                    onClick={() => setSelectedIndex(i)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                      i === selectedIndex
                        ? 'bg-accent/10 text-accent ring-1 ring-accent/10'
                        : 'text-text-tertiary hover:bg-surface hover:text-text'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold ${
                        i === selectedIndex ? 'bg-accent text-white' : 'bg-surface-secondary/60 text-text-quaternary'
                      }`}>
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium truncate">
                          {new Date(run.timestamp).toLocaleDateString()}
                        </p>
                        <p className="text-[10px] text-text-quaternary">
                          {new Date(run.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Output panel */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center justify-between px-5 py-2.5 border-b border-border-light shrink-0 bg-surface-secondary/10">
              <div className="flex items-center gap-2">
                <FileText size={13} className="text-text-quaternary" />
                <span className="text-[11px] font-semibold text-text-tertiary">
                  {selectedRun ? `#${selectedIndex + 1} · ${new Date(selectedRun.timestamp).toLocaleString()}` : ''}
                </span>
              </div>
              {selectedRun?.content && (
                <button onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border-light text-text-tertiary hover:text-text hover:bg-surface hover:border-accent/30 transition-all">
                  {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                  {copied ? t('chat.copy.copied') : t('chat.copy.copy')}
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {selectedRun ? (
                <div className="prose prose-sm max-w-none dark:prose-invert text-[13px] leading-relaxed text-text-secondary">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selectedRun.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <FileText size={32} className="text-text-quaternary/30 mb-3" />
                  <p className="text-[13px] text-text-tertiary">{loading ? t('common.loading') : t('tasks.noHistory')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
