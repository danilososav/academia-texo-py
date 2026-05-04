import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const driveServiceAccount = process.env.DRIVE_SERVICE_ACCOUNT_JSON ? JSON.parse(process.env.DRIVE_SERVICE_ACCOUNT_JSON) : null;

function getAuthClient() {
  return new google.auth.GoogleAuth({
    credentials: driveServiceAccount,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get("fileId");

  if (!fileId) {
    return new NextResponse("fileId requerido", { status: 400 });
  }

  try {
    const auth = getAuthClient();
    const token = await auth.getAccessToken();

    if (!token) {
      throw new Error("No se pudo obtener token de acceso.");
    }

    const rangeHeader = req.headers.get("range");

    const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;

    const fetchHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (rangeHeader) {
      fetchHeaders["Range"] = rangeHeader;
    }

    const driveRes = await fetch(driveUrl, { headers: fetchHeaders });

    if (!driveRes.ok && driveRes.status !== 206) {
      return new NextResponse("Error al obtener el archivo de Drive.", { status: driveRes.status });
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", driveRes.headers.get("content-type") ?? "application/octet-stream");
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Cache-Control", "public, max-age=3600");

    const contentLength = driveRes.headers.get("content-length");
    if (contentLength) responseHeaders.set("Content-Length", contentLength);

    const contentRange = driveRes.headers.get("content-range");
    if (contentRange) responseHeaders.set("Content-Range", contentRange);

    return new NextResponse(driveRes.body, {
      status: driveRes.status,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("[drive/stream] Error:", message);
    return new NextResponse(`Error de streaming: ${message}`, { status: 500 });
  }
}


