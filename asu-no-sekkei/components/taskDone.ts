import type { ToastAction, ToastTone } from "@/hooks/useToast";
import { actions } from "@/lib/store";
import { formatDuration } from "@/lib/time";

type Notify = (message: string, tone?: ToastTone, action?: ToastAction) => void;

/**
 * タスクの完了を切り替える。目標の工程から作ったタスクを完了にしたら、実績（予定時間）を記録し、工程の進捗を知らせる。
 * 1 回分のタスクを完了しただけでは工程を完了にしない。
 * 推定総時間に実績が届いた（または推定がない）ときだけ、工程も完了にするかを尋ねる。
 */
export function toggleDoneWithPrompt(taskId: string, notify: Notify) {
  const r = actions.toggleDone(taskId);
  if (!r.done || !r.step || r.step.status === "done" || r.step.status === "skipped" || !r.progress) return;
  const p = r.progress;
  const stepId = r.step.id;
  if (p.remainingMinutes !== null && p.remainingMinutes > 0) {
    notify(
      `作業時間を記録しました。工程「${r.step.title}」は実績 ${formatDuration(p.actualMinutes)} / ${formatDuration(p.estimatedMinutes!)}（残り ${formatDuration(p.remainingMinutes)}）。実際の時間は目標画面で修正できます`,
    );
    return;
  }
  notify(`作業時間を記録しました。工程「${r.step.title}」も完了にしますか？`, "info", {
    label: "完了にする",
    run: () => actions.setStepStatus(stepId, "done"),
  });
}
