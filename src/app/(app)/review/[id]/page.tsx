import { ReviewWorkflow } from "./workflow";

export const metadata = { title: "Review" };

export default async function ReviewPage({ params }: PageProps<"/review/[id]">) {
  const { id } = await params;
  return <ReviewWorkflow batchId={id} />;
}
