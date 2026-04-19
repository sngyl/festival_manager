"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Role = "teacher" | "admin";

export default function LoginForm() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("teacher");
  const [gameName, setGameName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(password)) {
      setError("비밀번호는 6자리 숫자입니다.");
      return;
    }
    if (role === "teacher" && !gameName.trim()) {
      setError("게임 이름을 입력하세요.");
      return;
    }
    setLoading(true);
    try {
      const endpoint = role === "admin" ? "/api/auth/admin" : "/api/auth/teacher";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(role === "admin" ? { password } : { gameName: gameName.trim(), password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "로그인 실패");
        return;
      }
      router.replace(role === "admin" ? "/admin" : "/teacher");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-white px-5 py-8 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">로그인</h1>
        <a
          href="/"
          className="rounded-md border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          전광판
        </a>
      </div>
      <p className="mt-1 text-sm text-zinc-500">학생은 로그인 없이 순위 확인이 가능합니다.</p>

      <div className="mt-6 grid grid-cols-2 gap-2">
        {(["teacher", "admin"] as Role[]).map((r) => {
          const active = role === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() => {
                setRole(r);
                setError(null);
              }}
              className={`rounded-md border px-4 py-2 text-sm font-semibold transition-colors ${
                active
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
              }`}
            >
              {r === "teacher" ? "선생님" : "관리자"}
            </button>
          );
        })}
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {role === "teacher" ? (
          <label className="block">
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">게임 이름</span>
            <input
              type="text"
              autoComplete="off"
              placeholder="예: 제기차기"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-3 text-base outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
            />
          </label>
        ) : (
          <div className="block">
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">아이디</span>
            <div className="mt-1 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-base text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
              관리자
            </div>
          </div>
        )}

        <label className="block">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">비밀번호 (6자리)</span>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="current-password"
            placeholder="● ● ● ● ● ●"
            value={password}
            onChange={(e) => setPassword(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-3 text-center font-mono text-xl tracking-widest outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
          />
        </label>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-zinc-900 py-3 text-base font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {loading ? "확인 중…" : "로그인"}
        </button>
      </form>
    </div>
  );
}
