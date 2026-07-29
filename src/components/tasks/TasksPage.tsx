import { useState } from 'react';
import { TaskList } from './TaskList';
import { CreateTaskModal } from './CreateTaskModal';
import { ApprovalInbox } from './ApprovalInbox';

export function TasksPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <>
      <div className="flex flex-1 min-h-0 flex-col bg-[var(--color-bg)]">
        <ApprovalInbox />
        <div className="min-h-0 flex-1">
          <TaskList onCreateTask={() => setShowCreateModal(true)} />
        </div>
      </div>

      {showCreateModal && (
        <CreateTaskModal onClose={() => setShowCreateModal(false)} />
      )}
    </>
  );
}
