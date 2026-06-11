// MIME real (sin el parámetro ;codecs=...) → extensión de archivo para el path
// del bucket voice-obs. Compartido entre el recorder client (voice-recorder.tsx)
// y la route server (/api/observations/voice) para que el ext del path no
// diverja entre cliente y servidor. El bucket whitelistea audio/webm, audio/mp4,
// audio/mpeg.
export function mimeToExt(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  switch (base) {
    case "audio/webm":
      return "webm";
    case "audio/mp4":
    case "audio/x-m4a":
    case "audio/aac":
      return "m4a";
    case "audio/mpeg":
      return "mp3";
    case "audio/ogg":
      return "ogg";
    default:
      // Fallback: segunda mitad del MIME, sin caracteres raros.
      return base.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin";
  }
}
