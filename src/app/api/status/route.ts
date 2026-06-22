import { NextResponse } from "next/server";
import { OG, resolveMode } from "@/lib/0g/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    mode: resolveMode(),
    chainId: OG.chainId,
    rpcUrl: OG.rpcUrl,
    explorer: OG.explorer,
    storageExplorer: OG.storageExplorer,
  });
}
