export const speechSupported = () =>
  typeof window !== "undefined" &&
  !!window.speechSynthesis &&
  typeof SpeechSynthesisUtterance !== "undefined";
