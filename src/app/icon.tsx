import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Icône de l'app (favicon + manifeste). Fond KinouClean, "K" blanc.
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1C3557", color: "#ffffff", fontSize: 300, fontWeight: 800, fontFamily: "sans-serif" }}>
        K
      </div>
    ),
    { ...size },
  );
}
