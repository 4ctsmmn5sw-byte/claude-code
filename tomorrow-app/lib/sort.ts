import { timeToMinutes } from "./date";
import type { Priority, Task } from "./types";

const PRIORITY_SCORE: Record<Priority, number> = { high: 3, medium: 2, low: 1 };

/**
 * おすすめ度スコア（大きいほど先に取り組む）
 * - 締切: 早い時刻ほど高い（0〜4点）。締切なしは 0 点
 * - 重要度: 高 3 / 中 2 / 低 1 点を 1.5 倍
 * - 所要時間: 短いほど着手しやすいので少し加点（0〜1点）
 */
export function recommendScore(task: Task): number {
  const deadline = timeToMinutes(task.deadline);
  const deadlineScore = deadline === null ? 0 : 4 * (1 - deadline / (24 * 60));
  const priorityScore = PRIORITY_SCORE[task.priority] * 1.5;
  const durationScore = 1 - Math.min(task.estimatedMinutes, 240) / 240;
  return deadlineScore + priorityScore + durationScore;
}

/** 未完了をおすすめ順に並べ、完了済みは末尾にまとめる */
export function sortByRecommendation(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const diff = recommendScore(b) - recommendScore(a);
    if (diff !== 0) return diff;
    return a.createdAt - b.createdAt;
  });
}
