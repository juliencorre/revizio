import React from "react";
export function PdfDocument({ uri, title }: { uri: string; title: string }) {
  return (
    <iframe
      title={title}
      src={uri}
      style={{
        border: 0,
        width: "100%",
        height: "100%",
        minHeight: 480,
        background: "white",
      }}
    />
  );
}
