import { Pressable, Text, View } from "react-native";
import { AppIcon, AppText } from "@/components/ui";
import { conjugationForms, type ConjugationSheet } from "@/domain/conjugation";
import { createThemedStyles, radius, spacing, useTheme } from "@/theme";

export function ConjugationTable({
  sheet,
  onSpeak,
}: {
  sheet: ConjugationSheet;
  onSpeak?: (text: string) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const forms = conjugationForms(sheet);
  return (
    <View testID="conjugation-table" style={styles.table}>
      {[false, true].map((plural) => (
        <View key={String(plural)} style={styles.column}>
          <View style={styles.columnHeading}>
            <AppText variant="label" color={colors.primary}>
              {plural ? "Pluriel" : "Singulier"}
            </AppText>
          </View>
          {forms
            .filter((item) => item.plural === plural)
            .map(({ pronoun, form }) => {
              const phrase = pronoun + " " + form;
              const id =
                "conjugation-form-" +
                pronoun +
                (plural && pronoun === "you" ? "-plural" : "");
              const words = (
                <AppText style={styles.phrase}>
                  {pronoun} <Text style={styles.form}>{form}</Text>
                </AppText>
              );
              return onSpeak ? (
                <Pressable
                  key={pronoun}
                  testID={id}
                  accessibilityRole="button"
                  accessibilityLabel={
                    "Écouter " +
                    phrase +
                    (pronoun === "you"
                      ? plural
                        ? ", au pluriel"
                        : ", au singulier"
                      : "")
                  }
                  onPress={() => onSpeak(phrase)}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && styles.pressed,
                  ]}
                >
                  {words}
                  <AppIcon name="volume" color={colors.muted} size={18} />
                </Pressable>
              ) : (
                <View key={pronoun} testID={id} style={styles.row}>
                  {words}
                </View>
              );
            })}
        </View>
      ))}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  table: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  column: {
    flexBasis: 200,
    flexGrow: 1,
    minWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceInset,
    alignSelf: "flex-start",
    padding: spacing.sm,
  },
  columnHeading: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  row: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  phrase: { flex: 1, fontSize: 19, lineHeight: 26 },
  form: { fontWeight: "700" },
  pressed: { backgroundColor: colors.primaryLight },
}));
