import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { createClient } from "@/lib/supabase/server";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requireUser() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new HttpError(503, "Supabase is not configured on this deployment.");
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new HttpError(401, "Authentication required.");
  return { supabase, user };
}

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
  return schema.parse(json);
}

/** Wraps a route handler with uniform error responses. */
export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof ZodError)
        return NextResponse.json(
          { error: "Invalid request.", issues: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
          { status: 400 },
        );
      console.error("[api]", err);
      return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }
  };
}

export function dbError(error: { message: string } | null): void {
  if (error) {
    console.error("[db]", error.message);
    throw new HttpError(500, "Database error.");
  }
}
