import { describe, expect, test } from "vitest";
import { buildHtml, html, raw } from "./html";

describe.concurrent("raw", () => {
  test("should return escaped string", () => {
    const result = raw("<div>hello</div>");
    expect(result.isEscaped).toBe(true);
  });
});

describe.concurrent("buildHtml", () => {
  test("should return escaped string", async () => {
    const result = await buildHtml`<div>hello</div>`;
    expect(result.isEscaped).toBe(true);
  });

  test("should return escaped string with callbacks", async () => {
    const result = await buildHtml`<div>${raw("hello")}</div>`;
    expect(result.isEscaped).toBe(true);
  });

  test("should call Array.flat", async () => {
    const values = ["Name", ["John", undefined, null], 2, html`<div>${raw("hello")}</div>`];
    const result = await buildHtml`<div>${values}</div>`;
    expect(result.toString()).toBe("<div>NameJohn2<div>hello</div></div>");
  });
});
