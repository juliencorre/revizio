import { Redirect, useLocalSearchParams } from "expo-router";
import { vocabularyLanguage } from "@/domain/vocabulary";
import { subjectHref } from "@/features/parent/subject-navigation";

export default function ParentVocabulary() {
  const { language } = useLocalSearchParams<{ language?: string }>();
  return (
    <Redirect href={subjectHref(vocabularyLanguage(language), "vocabulaire")} />
  );
}
