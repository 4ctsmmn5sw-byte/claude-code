import type { ToastAction, ToastTone } from "@/hooks/useToast";
import { actions } from "@/lib/store";
import { formatDuration } from "@/lib/time";

type Notify = (message: string, tone?: ToastTone, action?: ToastAction) => void;

/**
 * タスクの完了を切り替える。
 * 目標の工程から作ったタスクを完了にすると、予定時間を実績として 1 件記録する（store.toggleDone）。
 * onCompleted を渡すと、続けて実績時間の確認・修正画面を開く（そこで工程を完了にするかも選べる）。
 * 1 回分のタスクを完了しただけでは工程を完了にしない。
 */
export function toggleDoneWithPrompt(taskId: string, notify: Notify, onCompleted?: (taskId: string) => void) {
  const r = actions.toggleDone(taskId);
  if (!r.done || !r.logId) return;
  if (onCompleted) return onCompleted(taskId);
  if (!r.step || r.step.status === "done" || r.step.status === "skipped" || !r.progress) return;
  const p = r.progress;
  const stepId = r.step.id;
  if (p.remainingMinutes !== null && p.remainingMinutes > 0) {
    notify(`作業時間を記録しました。工程「${r.step.title}」は実績 ${formatDuration(p.actualMinutes)} / ${formatDuration(p.estimatedMinutes!)}（残り ${formatDuration(p.remainingMinutes)}）`);
    return;
  }
  notify(`作業時間を記録しました。工程「${r.step.title}」も完了にしますか？`, "info", {
    label: "完了にする",
    run: () => actions.setStepStatus(stepId, "done"),
  });
}
