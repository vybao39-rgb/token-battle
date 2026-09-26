import { isAdminRequest } from "@/lib/admin-auth";
import { getAnalysisArchiveText, listAnalysisArchives, type ArchiveListItem } from "@/lib/analysis-archive";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return Response.json({ message: "Unauthorized." }, { status: 401 });

  let cursor: string | undefined;
  let page: ArchiveListItem[] = [];
  let pageIndex = 0;
  let hasMore = true;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (pageIndex >= page.length && hasMore) {
          const result = await listAnalysisArchives({ cursor, limit: 100 });
          page = result.items;
          pageIndex = 0;
          hasMore = result.hasMore;
          cursor = result.cursor ?? undefined;
          if (!page.length && !hasMore) break;
        }

        const item = page[pageIndex++];
        if (!item) {
          controller.close();
          return;
        }
        const text = await getAnalysisArchiveText(item.pathname);
        if (text) controller.enqueue(encoder.encode(`${text}\n`));
      } catch (error) {
        controller.error(error);
      }
    },
  });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename="dump-risk-archive-${date}.jsonl"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
