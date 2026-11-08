import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LearningProvider } from '@/state/learning-store';
import { colors } from '@/theme';
export default function RootLayout() { return <SafeAreaProvider><SafeAreaView style={{flex:1,backgroundColor:colors.background}}><LearningProvider><StatusBar style="dark"/><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:colors.background}}}/></LearningProvider></SafeAreaView></SafeAreaProvider>; }
