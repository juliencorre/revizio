import React from "react";
import { WebView } from "react-native-webview";
import { apiAuthHeaders } from "@/services/api";
export function PdfDocument({ uri, title }: { uri: string; title: string }) {
  return (
    <WebView
      accessibilityLabel={title}
      source={{ uri, headers: apiAuthHeaders() }}
      style={{ flex: 1, minHeight: 480 }}
      allowFileAccess
    />
  );
}
