import { useEffect, useState } from "react";
import { addTaskToShow } from "../services/showsService";

export type TaskPriority = "High" | "Medium" | "Low";

interface ShowPlannerProps {
  showId: string;
}

export default function ShowPlanner({ showId }: ShowPlannerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2200);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const resetForm = () => {
    setTitle("");
    setPriority("Medium");
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);

      console.log("Saving task with priority:", priority);

      await addTaskToShow(showId, {
        title,
        priority,
        status: "To-Do",
      });

      setToast("Task saved");
      resetForm();
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      setToast("Couldn't save task");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="px-4 py-2 bg-purple-600 text-white rounded-md"
      >
        Add Task
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 p-6 rounded-lg w-full max-w-md">
            <h2 className="text-xl text-white mb-4">Add Task</h2>

            <label className="block text-sm text-slate-300 mb-1">
              Task Name
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full mb-4 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white"
            />

            <label className="block text-sm text-slate-300 mb-1">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) =>
                setPriority(e.target.value as TaskPriority)
              }
              className="w-full mb-6 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white"
            >
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsModalOpen(false)}
                disabled={isSaving}
                className="px-4 py-2 bg-slate-700 text-white rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !title.trim()}
                className="px-4 py-2 bg-purple-600 text-white rounded-md"
              >
                {isSaving ? "Saving..." : "Save Task"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white px-4 py-2 rounded shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
