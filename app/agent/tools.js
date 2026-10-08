/* 에이전트가 쓰는 도구: 정의(모델에게 보이는 스키마)와 실행

   실행은 browser(탭 조작)와 ui(사용자에게 묻기) 두 인터페이스를 받습니다.
   그래서 이 파일은 Electron 을 직접 모르고, 테스트에서 가짜로 바꿔 끼울 수 있습니다. */

import {
  snapshotPage, locateElement, focusForTyping, readValue, selectOption, scrollPage, inject,
} from "./page-script.js";

const obj = (properties, required = Object.keys(properties)) => ({
  type: "object", properties, required, additionalProperties: false,
});
const str = (description) => ({ type: "string", description });
const int = (description) => ({ type: "integer", description });
const bool = (description) => ({ type: "boolean", description });

export const TOOL_DEFS = [
  {
    name: "read_page",
    description: "현재 탭의 페이지를 읽습니다. 주소, 제목, 본문 텍스트, 그리고 클릭·입력할 수 있는 요소 목록([번호] 종류 \"이름\")을 돌려줍니다. 행동하기 전과 페이지가 바뀐 뒤에는 항상 먼저 호출하세요.",
    input_schema: obj({}),
  },
  {
    name: "screenshot",
    description: "현재 탭 화면을 이미지로 봅니다. 레이아웃·그림·차트처럼 텍스트만으로 알기 어려울 때만 쓰세요.",
    input_schema: obj({}),
  },
  {
    name: "navigate",
    description: "현재 탭에서 주소로 이동합니다. 검색이 필요하면 검색엔진 주소(예: https://www.google.com/search?q=…)를 직접 쓰세요.",
    input_schema: obj({ url: str("이동할 전체 주소 (https://…)") }),
  },
  {
    name: "click",
    description: "read_page 목록의 요소를 클릭합니다.",
    input_schema: obj({ element_id: int("read_page 에 나온 요소 번호") }),
  },
  {
    name: "type_text",
    description: "입력칸의 기존 내용을 지우고 글자를 입력합니다. submit 이 true 면 입력 후 Enter 를 누릅니다. 비밀번호 칸에는 입력할 수 없습니다(사용자가 직접 입력).",
    input_schema: obj({
      element_id: int("read_page 에 나온 입력칸 번호"),
      text: str("입력할 내용"),
      submit: bool("입력 후 Enter 를 누를지"),
    }),
  },
  {
    name: "select_option",
    description: "선택 목록(select)에서 항목을 고릅니다.",
    input_schema: obj({ element_id: int("select 요소 번호"), option: str("고를 항목의 글자 또는 값") }),
  },
  {
    name: "press_key",
    description: "현재 초점이 있는 곳에 키를 누릅니다.",
    input_schema: obj({ key: { type: "string", enum: ["Enter", "Escape", "Tab", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Backspace", "PageDown", "PageUp"] } }),
  },
  {
    name: "scroll",
    description: "페이지를 스크롤합니다.",
    input_schema: obj({ direction: { type: "string", enum: ["down", "up", "top", "bottom"] } }),
  },
  {
    name: "go_back",
    description: "현재 탭에서 뒤로 갑니다.",
    input_schema: obj({}),
  },
  {
    name: "open_tab",
    description: "새 탭에서 주소를 열고 그 탭으로 전환합니다. 여러 사이트를 비교할 때 씁니다.",
    input_schema: obj({ url: str("열 주소") }),
  },
  {
    name: "switch_tab",
    description: "다른 탭으로 전환합니다. 탭 번호는 read_page 결과의 탭 목록에 있습니다.",
    input_schema: obj({ tab_id: int("탭 번호") }),
  },
  {
    name: "wait",
    description: "페이지가 바뀌기를 잠깐 기다립니다(최대 10초).",
    input_schema: obj({ seconds: { type: "number", description: "기다릴 초 (0.5~10)" } }),
  },
  {
    name: "ask_user",
    description: "작업을 계속하려면 사용자만 알 수 있는 정보(선호, 선택, 로그인 여부 등)가 필요할 때 묻습니다. 답을 기다리는 동안 멈춥니다.",
    input_schema: obj({ question: str("사용자에게 할 질문") }),
  },
  {
    name: "confirm_action",
    description: "되돌리기 어려운 행동(결제·구매·주문, 메시지·메일·글 보내기, 삭제, 예약·신청 확정, 계정 설정 변경, 개인정보 제출) 직전에 반드시 호출해 사용자 허락을 받습니다. 거절되면 그 행동을 하지 마세요.",
    input_schema: obj({ action: str("하려는 행동을 사용자가 이해할 수 있게 한 문장으로 (예: \"쿠팡에서 생수 2L×12개를 13,900원에 주문\")") }),
  },
].map((t) => ({ ...t, strict: true, eager_input_streaming: true }));

// eager_input_streaming 을 켜면 API 가 입력을 검증하지 않으므로 직접 검사합니다.
export function validateInput(name, input) {
  const def = TOOL_DEFS.find((t) => t.name === name);
  if (!def) return `알 수 없는 도구: ${name}`;
  if (!input || typeof input !== "object" || Array.isArray(input)) return "입력이 객체가 아닙니다.";
  const { properties, required } = def.input_schema;
  for (const key of required) if (!(key in input)) return `필수 입력 ${key} 가 없습니다.`;
  for (const [key, value] of Object.entries(input)) {
    const spec = properties[key];
    if (!spec) return `알 수 없는 입력 ${key}`;
    if (spec.type === "integer" && !Number.isInteger(value)) return `${key} 는 정수여야 합니다.`;
    if (spec.type === "number" && typeof value !== "number") return `${key} 는 숫자여야 합니다.`;
    if (spec.type === "string" && typeof value !== "string") return `${key} 는 문자열이어야 합니다.`;
    if (spec.type === "boolean" && typeof value !== "boolean") return `${key} 는 참/거짓이어야 합니다.`;
    if (spec.enum && !spec.enum.includes(value)) return `${key} 는 ${spec.enum.join(", ")} 중 하나여야 합니다.`;
  }
  return null;
}

// 모델이 confirm_action 을 빠뜨려도, 이런 이름의 버튼은 누르기 전에 사용자에게 묻습니다.
const RISKY = /(결제|구매|주문|구입|송금|이체|보내기|전송|발송|게시|등록하기|삭제|탈퇴|해지|예약\s*확정|신청\s*완료|가입\s*완료|\b(buy|purchase|pay|checkout|place order|order now|send|post|publish|delete|remove account|confirm|transfer|subscribe)\b)/i;

export function isRiskyClick(info) {
  if (RISKY.test(info.label || "")) return true;
  // 이름이 없는 제출 버튼은 판단할 수 없으니 결제·주문 폼일 때만 묻습니다.
  return Boolean(info.isSubmit && /(checkout|payment|order|pay|purchase|결제|주문)/i.test(info.formAction || ""));
}

export function normalizeUrl(raw) {
  const t = String(raw).trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) {
    const u = new URL(t);
    if (!/^https?:$/.test(u.protocol)) throw new Error("http(s) 주소만 열 수 있습니다.");
    return u.href;
  }
  return new URL(`https://${t}`).href;
}

function describe(name, input) {
  switch (name) {
    case "read_page": return "페이지 읽기";
    case "screenshot": return "화면 보기";
    case "navigate": return `이동: ${input.url}`;
    case "click": return `클릭 [${input.element_id}]`;
    case "type_text": return `입력 [${input.element_id}]: "${input.text}"${input.submit ? " ⏎" : ""}`;
    case "select_option": return `선택 [${input.element_id}]: ${input.option}`;
    case "press_key": return `키: ${input.key}`;
    case "scroll": return `스크롤 ${({ down: "아래", up: "위", top: "맨 위", bottom: "맨 아래" })[input.direction]}`;
    case "go_back": return "뒤로";
    case "open_tab": return `새 탭: ${input.url}`;
    case "switch_tab": return `탭 전환 #${input.tab_id}`;
    case "wait": return `${input.seconds}초 기다림`;
    case "ask_user": return "사용자에게 질문";
    case "confirm_action": return `허락 요청: ${input.action}`;
    default: return name;
  }
}

/**
 * 도구 하나를 실행하고 tool_result 의 content 를 돌려줍니다.
 * 실패는 { error } 로 돌려 모델이 다른 방법을 찾게 합니다.
 */
export async function runTool(name, input, { browser, ui, state, settings }) {
  ui.emit({ type: "action", label: describe(name, input) });
  const wc = browser.active();
  const exec = (fn, arg) => wc.executeJavaScript(inject(fn, arg), true);

  switch (name) {
    case "read_page": {
      const snap = await exec(snapshotPage, { maxText: 12000 });
      const tabs = browser.list().map((t) => `#${t.id}${t.active ? " (현재)" : ""} ${t.title || ""} — ${t.url}`).join("\n");
      return [
        `주소: ${snap.url}`,
        `제목: ${snap.title}`,
        `스크롤: ${snap.scroll}`,
        `열린 탭:\n${tabs}`,
        `\n상호작용 요소 ${snap.elementCount}개:\n${snap.elements || "(없음)"}`,
        `\n본문${snap.truncated ? " (앞부분만)" : ""}:\n${snap.text}`,
      ].join("\n");
    }

    case "screenshot": {
      const data = await browser.screenshot();
      return [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }];
    }

    case "navigate": {
      await browser.navigate(normalizeUrl(input.url));
      return `이동했습니다: ${browser.active().getURL()} — 제목: ${browser.active().getTitle()}`;
    }

    case "click": {
      const info = await exec(locateElement, input.element_id);
      if (info.error) return { error: info.error };
      if (info.disabled) return { error: `[${input.element_id}] "${info.label}" 은(는) 비활성 상태입니다.` };
      if (settings.confirmRisky && !state.approvedOnce && isRiskyClick(info)) {
        const ok = await ui.confirm(`에이전트가 "${info.label || "제출"}" 버튼을 누르려고 합니다. 허락할까요?`);
        if (!ok) return { error: "사용자가 이 클릭을 거절했습니다. 이 행동을 하지 말고, 필요하면 사용자에게 다른 방법을 물어보세요." };
      }
      state.approvedOnce = false;
      await browser.click(info.x, info.y);
      return `"${info.label || info.tag}" 을(를) 클릭했습니다. 지금 주소: ${browser.active().getURL()}`;
    }

    case "type_text": {
      const info = await exec(locateElement, input.element_id);
      if (info.error) return { error: info.error };
      if (info.password) {
        return { error: "비밀번호 칸에는 에이전트가 입력하지 않습니다. ask_user 로 사용자에게 직접 입력하거나 로그인해 달라고 요청하세요." };
      }
      const focus = await exec(focusForTyping, input.element_id);
      if (focus.error) return { error: focus.error };
      await browser.insertText(input.text);
      if (input.submit) {
        if (settings.confirmRisky && !state.approvedOnce && info.isSubmit && isRiskyClick(info)) {
          const ok = await ui.confirm(`에이전트가 입력 후 "${info.label}" 양식을 제출하려고 합니다. 허락할까요?`);
          if (!ok) return { error: "사용자가 제출을 거절했습니다." };
        }
        state.approvedOnce = false;
        await browser.pressKey("Enter");
      }
      const value = await exec(readValue, input.element_id);
      return `입력했습니다. 현재 값: ${JSON.stringify(value)}${input.submit ? ` / Enter 후 주소: ${browser.active().getURL()}` : ""}`;
    }

    case "select_option": {
      const r = await exec(selectOption, { id: input.element_id, option: input.option });
      return r.error ? { error: r.error } : `"${r.selected}" 을(를) 골랐습니다.`;
    }

    case "press_key":
      await browser.pressKey(input.key);
      return `${input.key} 키를 눌렀습니다.`;

    case "scroll": {
      const r = await exec(scrollPage, { direction: input.direction });
      return `스크롤 위치 ${r.y} / ${r.max}px`;
    }

    case "go_back":
      if (!wc.navigationHistory.canGoBack()) return { error: "뒤로 갈 페이지가 없습니다." };
      await browser.goBack();
      return `뒤로 갔습니다: ${browser.active().getURL()}`;

    case "open_tab": {
      const tab = await browser.openTab(normalizeUrl(input.url));
      return `탭 #${tab.id} 을(를) 열었습니다: ${browser.active().getURL()}`;
    }

    case "switch_tab": {
      if (!browser.switchTo(input.tab_id)) return { error: `탭 #${input.tab_id} 이(가) 없습니다.` };
      return `탭 #${input.tab_id} (${browser.active().getTitle()}) 로 전환했습니다.`;
    }

    case "wait": {
      const s = Math.min(10, Math.max(0.5, input.seconds));
      await new Promise((r) => setTimeout(r, s * 1000));
      return `${s}초 기다렸습니다.`;
    }

    case "ask_user": {
      const answer = await ui.ask(input.question);
      return answer == null ? { error: "사용자가 답하지 않고 작업을 멈췄습니다." } : `사용자 답: ${answer}`;
    }

    case "confirm_action": {
      const ok = await ui.confirm(input.action);
      state.approvedOnce = ok;
      return ok ? "사용자가 허락했습니다. 바로 그 행동 하나만 진행하세요." : "사용자가 거절했습니다. 이 행동을 하지 마세요.";
    }

    default:
      return { error: `알 수 없는 도구: ${name}` };
  }
}
