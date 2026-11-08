import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  View,
} from "react-native";
import { AppText, Button, Card } from "./ui";
import { PdfDocument } from "./pdf-document";
import type { CourseSource } from "@/domain/model";
import { resolveSourceUri, cacheSource } from "@/services/source-cache";
import { apiAuthHeaders } from "@/services/api";
import { colors } from "@/theme";
export function useSourceUri(source?: CourseSource | null) {
  const [uri, setUri] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setUri("");
    setError("");
    if (source?.uri || source?.cachedUri) {
      cacheSource(source)
        .catch(() => source)
        .then(resolveSourceUri)
        .then((value) => {
          if (active) setUri(value);
        })
        .catch(() => {
          if (active)
            setError(
              "Ce document n’est pas disponible. Connecte-toi pour le télécharger à nouveau.",
            );
        });
    }
    return () => {
      active = false;
    };
  }, [source?.id, source?.uri, source?.rotation, source?.cachedUri]);
  return { uri, error };
}
export function SourceThumbnail({
  source,
  height = 126,
}: {
  source: CourseSource;
  height?: number;
}) {
  const { uri } = useSourceUri(source);
  return uri ? (
    <Image
      source={{ uri, headers: apiAuthHeaders() }}
      accessibilityLabel={source.name}
      resizeMode="contain"
      style={{
        height,
        width: "100%",
        borderRadius: 12,
        backgroundColor: colors.surfaceInset,
        transform: [
          { rotate: `${source.storageId ? 0 : source.rotation || 0}deg` },
        ],
      }}
    />
  ) : (
    <View style={{ height, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
export function SourceViewer({
  source,
  onClose,
}: {
  source: CourseSource | null;
  onClose: () => void;
}) {
  const { uri, error } = useSourceUri(source);
  const [zoom, setZoom] = useState(false);
  const image =
    source?.mimeType?.startsWith("image/") ||
    /\.(png|jpe?g|webp|heic)$/i.test(source?.name || "");
  useEffect(() => setZoom(false), [source?.id]);
  return (
    <Modal
      visible={!!source}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          padding: 20,
          backgroundColor: "#252D3DBB",
          justifyContent: "center",
        }}
      >
        <Card
          style={{
            flex: 1,
            maxHeight: 1100,
            maxWidth: 1200,
            width: "100%",
            alignSelf: "center",
            gap: 16,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <AppText variant="heading" style={{ flex: 1, minWidth: 120 }}>
              {source?.name}
            </AppText>
            {image && (
              <Button
                variant="secondary"
                icon="search"
                onPress={() => setZoom(!zoom)}
              >
                {zoom ? "Vue entière" : "Agrandir"}
              </Button>
            )}
            <Button variant="secondary" icon="close" onPress={onClose}>
              Fermer le document
            </Button>
          </View>
          {error ? (
            <AppText color={colors.danger}>{error}</AppText>
          ) : !uri ? (
            <ActivityIndicator color={colors.primary} />
          ) : image ? (
            <ScrollView
              style={{ flex: 1 }}
              horizontal={zoom}
              contentContainerStyle={{ flexGrow: 1 }}
            >
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ flexGrow: 1 }}
              >
                <Image
                  accessibilityLabel={source?.name}
                  source={{ uri, headers: apiAuthHeaders() }}
                  resizeMode="contain"
                  style={{
                    width: zoom ? 1500 : "100%",
                    minHeight: zoom ? 1800 : 500,
                    flex: 1,
                    transform: [
                      {
                        rotate: `${source?.storageId ? 0 : source?.rotation || 0}deg`,
                      },
                    ],
                  }}
                />
              </ScrollView>
            </ScrollView>
          ) : (
            <PdfDocument uri={uri} title={source?.name || "Mon document"} />
          )}
        </Card>
      </View>
    </Modal>
  );
}
