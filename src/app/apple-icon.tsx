import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Icône iOS (écran d'accueil iPhone/iPad). Fond opaque, iOS arrondit tout seul.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1C3557", color: "#ffffff", fontSize: 108, fontWeight: 800, fontFamily: "sans-serif" }}>
        K
      </div>
    ),
    { ...size },
  );
}
