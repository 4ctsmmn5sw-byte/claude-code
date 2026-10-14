import type { ToastAction, ToastTone } from "@/hooks/useToast";
import { actions } from "@/lib/store";

type Notify = (message: string, tone?: ToastTone, action?: ToastAction) => void;

/**
 * タスクの完了を切り替える。目標の工程から作ったタスクを完了にしたら、
 * 工程も完了にするかをトーストで尋ねる（工程の状態は自動では変えない）。
 */
export function toggleDoneWithPrompt(taskId: string, notify: Notify) {
  const r = actions.toggleDone(taskId);
  if (r.done && r.step && r.step.status !== "done" && r.step.status !== "skipped") {
    const stepId = r.step.id;
    notify(`作業時間を記録しました。工程「${r.step.title}」も完了にしますか？`, "info", {
      label: "完了にする",
      run: () => actions.setStepStatus(stepId, "done"),
    });
  }
}
