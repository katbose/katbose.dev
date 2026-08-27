import { ImageResponse } from "next/og";
export const alt = "Kat Bose — Software Engineer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "white",
        color: "black",
        display: "flex",
        fontSize: 72,
        fontWeight: 700,
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      Kat Bose · Software Engineer
    </div>,
    size,
  );
}
