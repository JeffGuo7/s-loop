import { useState } from 'react';
import { TaskList } from './TaskList';
import { CreateTaskModal } from './CreateTaskModal';

export function TasksPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <>
      <div className="flex-1 overflow-y-auto bg-[var(--color-bg)]">
        <TaskList onCreateTask={() => setShowCreateModal(true)} />
      </div>

      {showCreateModal && (
        <CreateTaskModal onClose={() => setShowCreateModal(false)} />
      )}
    </>
  );
}