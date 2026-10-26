"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isSignUp = mode === "sign-up";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setPending(true);
    setError(null);
    const { error } = isSignUp
      ? await authClient.signUp.email({ name: String(form.get("name")), email, password })
      : await authClient.signIn.email({ email, password });
    setPending(false);
    if (error) return setError(error.message ?? "Something went wrong");
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">{isSignUp ? "Create your account" : "Sign in"}</h1>
        {isSignUp && <Field name="name" label="Name" autoComplete="name" />}
        <Field name="email" label="Email" type="email" autoComplete="email" />
        <Field
          name="password"
          label="Password"
          type="password"
          minLength={8}
          autoComplete={isSignUp ? "new-password" : "current-password"}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={pending}
          className="w-full rounded-lg bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
        >
          {pending ? "…" : isSignUp ? "Sign up" : "Sign in"}
        </button>
        <p className="text-center text-sm text-neutral-500">
          {isSignUp ? "Already have an account? " : "New here? "}
          <Link href={isSignUp ? "/sign-in" : "/sign-up"} className="underline">
            {isSignUp ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </form>
    </main>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block space-y-1 text-sm">
      <span>{label}</span>
      <input
        required
        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
        {...props}
      />
    </label>
  );
}
