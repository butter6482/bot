import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="bg-grid flex min-h-screen flex-col items-center justify-center px-4">
      <Logo />
      <div className="mt-8 w-full max-w-sm">
        <Suspense fallback={null}>
          <LoginForm googleEnabled={process.env.NEXT_PUBLIC_GOOGLE_AUTH === "true"} />
        </Suspense>
      </div>
      <p className="mt-6 max-w-sm text-center text-xs text-muted">
        We never ask for your Instagram password. This account is only for Unfollow AI.
      </p>
    </main>
  );
}
