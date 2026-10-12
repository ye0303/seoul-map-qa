import { ErrorBox } from "./components/common.tsx";
import { DepartmentPage } from "./pages/DepartmentPage.tsx";
import { DiffPage } from "./pages/DiffPage.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { RulesPage } from "./pages/RulesPage.tsx";
import { ThemePage } from "./pages/ThemePage.tsx";
import { href, useRoute, type Route } from "./route.ts";

export function App() {
  const route = useRoute();
  return (
    <>
      <header className="site-header">
        <div className="wrap">
          <a className="brand" href={href.home()}>
            스마트서울맵 테마 검증
          </a>
          <nav aria-label="주 메뉴">
            <a href={href.home()} aria-current={route.page === "home" ? "page" : undefined}>
              검사 현황
            </a>
            <a href={href.rules()} aria-current={route.page === "rules" ? "page" : undefined}>
              규칙 안내
            </a>
          </nav>
        </div>
      </header>
      <main className="wrap">
        <Page route={route} />
      </main>
      <footer className="site-footer">
        <div className="wrap">스마트서울맵 OpenAPI의 공개 테마를 자동으로 검사한 결과입니다. 데이터 수정은 테마 입력 시스템에서 합니다.</div>
      </footer>
    </>
  );
}

function Page({ route }: { readonly route: Route }) {
  switch (route.page) {
    case "home":
      return <HomePage />;
    case "department":
      return <DepartmentPage key={route.department} department={route.department} />;
    case "theme":
      return <ThemePage key={route.themeId} themeId={route.themeId} tab={route.tab} />;
    case "diff":
      return <DiffPage key={`${route.themeId}|${route.from}|${route.to}`} themeId={route.themeId} from={route.from} to={route.to} />;
    case "rules":
      return <RulesPage />;
    case "notFound":
      return <ErrorBox message="없는 화면입니다. 위의 ‘검사 현황’으로 돌아가 주세요." />;
  }
}
