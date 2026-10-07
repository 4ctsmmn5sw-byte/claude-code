import type { Task, TaskInput } from "@/lib/types";
import { TaskItem } from "./TaskItem";

interface Props {
  tasks: Task[];
  onToggle: (id: string) => void;
  onUpdate: (id: string, input: TaskInput) => void;
  onDelete: (id: string) => void;
}

export function TaskList({ tasks, onToggle, onUpdate, onDelete }: Props) {
  if (tasks.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-10 text-center text-sm text-neutral-400">
        まだタスクがありません。
        <br />
        明日やることを1つ追加してみましょう。
      </p>
    );
  }

  let rank = 0;
  return (
    <ul className="space-y-2">
      {tasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          lead={task.completed ? null : `${++rank}.`}
          onToggle={onToggle}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
