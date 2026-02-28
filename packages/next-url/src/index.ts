import { type NextRequest, NextResponse } from "next/server";

export function getCurrentUrl(req: NextRequest): URL {
  const url = new URL(req.nextUrl);
  url.host = req.headers.get("host") || url.host;
  return url;
}

export function getRedirectTarget(
  url: URL,
  paramName = "next",
): NextResponse | URL {
  const nextUrl = new URL(url.searchParams.get(paramName) || "/", url);

  if (
    nextUrl.hostname !== url.hostname ||
    nextUrl.port !== url.port ||
    nextUrl.protocol !== url.protocol
  ) {
    return NextResponse.json(
      {
        status: 400,
        text: "Invalid redirect URL",
      },
      {
        status: 400,
      },
    );
  }

  return nextUrl;
}
