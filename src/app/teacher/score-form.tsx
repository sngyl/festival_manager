"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Recent = { sid: string; points: number; at: string };

export default function TeacherScoreForm({ gameName }: { gameName: string }) {
  const router = useRouter();
  const [sid, setSid] = useState("");
  const [points, setPoints] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);
  const sidRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!/^[1-9]\d{4}$/.test(sid)) {
      setError("개인식별번호 5자리를 입력하세요.");
      return;
    }
    if (!/^-?\d+$/.test(points)) {
      setError("점수(정수)를 입력하세요.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sid, points: parseInt(points, 10) }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "저장 실패");
        return;
      }
      setRecent((r) =>
        [{ sid, points: parseInt(points, 10), at: new Date().toLocaleTimeString("ko-KR") }, ...r].slice(0, 5),
      );
      setSid("");
      setPoints("");
      sidRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const sidPreview =
    /^[1-9]\d{4}$/.test(sid) &&
    `${sid[0]}학년 ${Number(sid.slice(1, 3))}반 ${Number(sid.slice(3, 5))}번`;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-white px-5 pb-10 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <header className="sticky top-0 z-10 -mx-5 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-5 py-3 backdrop-blur dark:border-zinc-800 dark:bg-black/90">
        <div>
          <div className="text-xs text-zinc-500">선생님 · 게임</div>
          <div className="truncate text-lg font-bold">{gameName}</div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
          >
            리더보드
          </a>
          <button
            onClick={logout}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
          >
            로그아웃
          </button>
        </div>
      </header>

      <form onSubmit={submit} className="mt-6 space-y-5">
        <label className="block">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            개인식별번호 (5자리)
          </span>
          <input
            ref={sidRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={5}
            autoFocus
            autoComplete="off"
            placeholder="G C C N N"
            value={sid}
            onChange={(e) => setSid(e.target.value.replace(/\D/g, "").slice(0, 5))}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-4 text-center font-mono text-3xl tracking-[0.5em] outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
          />
          <span className="mt-1 block h-5 text-sm text-zinc-500">
            {sidPreview || "\u00a0"}
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">점수</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="-?[0-9]*"
            autoComplete="off"
            placeholder="0"
            value={points}
            onChange={(e) => setPoints(e.target.value.replace(/[^\d-]/g, "").slice(0, 6))}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-4 text-center font-mono text-3xl tabular-nums outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
          />
        </label>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-zinc-900 py-4 text-base font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {saving ? "저장 중…" : "점수 저장"}
        </button>
      </form>

      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-zinc-500">최근 입력</h2>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {recent.map((r, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="font-mono">{r.sid}</span>
                <span className="tabular-nums font-semibold">{r.points}</span>
                <span className="text-xs text-zinc-500">{r.at}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
