import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const driveServiceAccount = process.env.DRIVE_SERVICE_ACCOUNT_JSON
  ? JSON.parse(process.env.DRIVE_SERVICE_ACCOUNT_JSON)
  : null;

function getAuthClient() {
  return new google.auth.GoogleAuth({
    credentials: driveServiceAccount,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get("fileId");

  if (!fileId) {
    return NextResponse.json({ error: "fileId requerido" }, { status: 400 });
  }

  try {
    const auth = getAuthClient();
    const token = await auth.getAccessToken();

    if (!token) {
      throw new Error("No se pudo obtener token de acceso.");
    }

    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true&access_token=${token}`;

    return NextResponse.json({ url }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("[drive/video-url] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
