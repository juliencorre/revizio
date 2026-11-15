import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useGlobalSearchParams, usePathname } from "expo-router";
import type { ScrollViewInstance } from "react-native";
import type { IconName } from "@/domain/model";
import { AppShell, PageLoading, type NavigationItem } from "./ui";

interface PageOptions {
  subject?: { title: string; color: string; icon: IconName };
  focus?: boolean;
  footer?: ReactNode;
  scrollRef?: RefObject<ScrollViewInstance | null>;
}
interface RegisteredPage {
  key: string;
  owner: symbol;
  options: PageOptions;
}
type RegisterPage = (key: string, options: PageOptions) => () => void;
const PageContext = createContext<RegisterPage | null>(null);
function usePageKey() {
  const path = usePathname();
  const params = useGlobalSearchParams();
  return `${path}?${JSON.stringify(params)}`;
}

/** Routes own their content and actions; their shared navigation stays mounted. */
export function PageShell({
  children,
  subject,
  focus,
  footer,
  scrollRef,
}: PageOptions & { children: ReactNode }) {
  const register = useContext(PageContext);
  const key = usePageKey();
  useLayoutEffect(
    () => register?.(key, { subject, focus, footer, scrollRef }),
    [register, key, subject, focus, footer, scrollRef],
  );
  return <>{children}</>;
}

export function PersistentAppShell({
  children,
  header,
  role,
  navigation,
  loading,
  focus = false,
}: {
  children: ReactNode;
  header?: ReactNode;
  role: "parent" | "child";
  navigation: NavigationItem[];
  loading: boolean;
  focus?: boolean;
}) {
  const key = usePageKey();
  const [page, setPage] = useState<RegisteredPage | null>(null);
  const register = useCallback<RegisterPage>((key, options) => {
    const owner = Symbol();
    setPage({ key, options, owner });
    return () =>
      setPage((current) => (current?.owner === owner ? null : current));
  }, []);
  // A route must never inherit actions or scroll refs from the page it replaces.
  const options = page?.key === key ? page.options : {};
  return (
    <PageContext.Provider value={register}>
      <AppShell
        role={role}
        navigation={navigation}
        subject={options.subject}
        focus={options.focus ?? focus}
        footer={options.footer}
        scrollRef={options.scrollRef}
        contentLoading={loading}
        pageKey={key}
      >
        {header}
        <Suspense fallback={<PageLoading />}>{children}</Suspense>
      </AppShell>
    </PageContext.Provider>
  );
}
