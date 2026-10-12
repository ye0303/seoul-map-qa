import { COMMON_RULES, RULESET_VERSION, THEME_RULE_SETS } from "../../core/rules/registry.ts";
import type { Rule } from "../../core/rules/types.ts";
import { href } from "../route.ts";

export function RulesPage() {
  return (
    <>
      <h1>규칙 안내</h1>
      <p className="lead">모든 공개 테마에 같은 공통 규칙을 적용하고, 담당자가 알려 준 테마별 규칙을 더합니다. 지금 규칙 버전은 {RULESET_VERSION}입니다.</p>
      <ul className="facts">
        <li>
          <strong>오류</strong>: 확실히 잘못된 값입니다. 입력 시스템에서 고쳐 주세요.
        </li>
        <li>
          <strong>의심</strong>: 틀렸을 가능성이 큰 값입니다. 사람이 확인해야 합니다.
        </li>
        <li>
          <strong>정보</strong>: 참고용입니다. 그대로 두어도 됩니다.
        </li>
      </ul>
      <p className="hint">한 규칙이 경우에 따라 다른 등급을 낼 수 있습니다. 등급 기준은 각 규칙 설명에 적었습니다.</p>

      <section>
        <h2>공통 규칙</h2>
        <RuleTable rules={COMMON_RULES} />
      </section>

      {THEME_RULE_SETS.map((set) => (
        <section key={set.themeId}>
          <h2>
            <a href={href.theme(set.themeId)}>{set.themeName}</a> 전용 규칙
          </h2>
          {set.replaces.length > 0 && <p className="hint">이 테마에서는 공통 규칙 {set.replaces.join(", ")} 대신 아래 규칙을 씁니다.</p>}
          <RuleTable rules={set.rules} />
        </section>
      ))}
    </>
  );
}

function RuleTable({ rules }: { readonly rules: readonly Rule[] }) {
  return (
    <div className="table-wrap">
      <table className="rules">
        <thead>
          <tr>
            <th>규칙</th>
            <th>이름</th>
            <th>설명</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id}>
              <td className="nowrap">{rule.id}</td>
              <td>{rule.title}</td>
              <td>{rule.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
