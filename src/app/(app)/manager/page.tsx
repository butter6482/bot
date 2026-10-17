import { Suspense } from "react";
import { Manager } from "./manager";

export const metadata = { title: "Unfollow Manager" };

export default function ManagerPage() {
  return (
    <Suspense fallback={null}>
      <Manager />
    </Suspense>
  );
}
