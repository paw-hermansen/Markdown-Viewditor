// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { scopeSubtreeIds } from "../id-scope";

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

function ids(root: Element): (string | null)[] {
  return [...root.querySelectorAll("[id]")].map((el) => el.getAttribute("id"));
}

describe("scopeSubtreeIds", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renames every id in the subtree with the prefix", () => {
    const root = mount(
      '<svg id="diagram"><defs><marker id="arrow"></marker></defs></svg>',
    );
    const map = scopeSubtreeIds(root, "p1-");
    expect(ids(root)).toEqual(["p1-diagram", "p1-arrow"]);
    expect(map.get("diagram")).toBe("p1-diagram");
    expect(map.get("arrow")).toBe("p1-arrow");
  });

  it("rewrites unquoted url(#…) references in attributes", () => {
    const root = mount(
      '<svg><defs><marker id="arrow"></marker></defs>' +
        '<path marker-end="url(#arrow)" fill="url(#arrow)"></path></svg>',
    );
    scopeSubtreeIds(root, "p1-");
    const path = root.querySelector("path")!;
    expect(path.getAttribute("marker-end")).toBe("url(#p1-arrow)");
    expect(path.getAttribute("fill")).toBe("url(#p1-arrow)");
  });

  it("rewrites quoted url(\"#…\") and url('#…') references", () => {
    const root = mount(
      '<svg><defs><marker id="arrow"></marker></defs>' +
        "<path style=\"marker-end: url('#arrow'); fill: url( &quot;#arrow&quot; )\"></path></svg>",
    );
    scopeSubtreeIds(root, "p1-");
    const path = root.querySelector("path")!;
    expect(path.getAttribute("style")).toContain("url('#p1-arrow')");
    expect(path.getAttribute("style")).toContain('url( "#p1-arrow" )');
  });

  it("rewrites href and xlink:href fragment references", () => {
    const root = mount(
      '<div><span id="target"></span><a href="#target">x</a>' +
        '<svg><use xlink:href="#target"></use></svg></div>',
    );
    scopeSubtreeIds(root, "p1-");
    expect(root.querySelector("a")!.getAttribute("href")).toBe("#p1-target");
    expect(root.querySelector("use")!.getAttribute("xlink:href")).toBe(
      "#p1-target",
    );
  });

  it("rewrites idref attributes (for, aria-*) token by token", () => {
    const root = mount(
      '<div><span id="a"></span><span id="b"></span>' +
        '<label for="a b"></label><div aria-labelledby="a b"></div></div>',
    );
    scopeSubtreeIds(root, "p1-");
    expect(root.querySelector("label")!.getAttribute("for")).toBe("p1-a p1-b");
    expect(
      root.querySelector("[aria-labelledby]")!.getAttribute("aria-labelledby"),
    ).toBe("p1-a p1-b");
  });

  it("rewrites url(#…) and #id selectors inside <style> elements", () => {
    const root = mount(
      '<svg id="root"><defs><marker id="arrow"></marker></defs>' +
        "<style>#root .marker { fill: red; } #arrow path { stroke: none; }" +
        " .x { marker-end: url(#arrow); }</style></svg>",
    );
    scopeSubtreeIds(root, "p1-");
    const css = root.querySelector("style")!.textContent!;
    expect(css).toContain("#p1-root .marker");
    expect(css).toContain("#p1-arrow path");
    expect(css).toContain("url(#p1-arrow)");
    expect(css).not.toMatch(/#root\b/);
    expect(css).not.toMatch(/#arrow\b/);
  });

  it("leaves references to ids outside the subtree untouched", () => {
    mount('<div id="outside"></div>');
    const root = mount(
      '<a href="#outside">x</a><div aria-controls="outside"></div>',
    );
    scopeSubtreeIds(root, "p1-");
    expect(root.querySelector("a")!.getAttribute("href")).toBe("#outside");
    expect(
      root.querySelector("[aria-controls]")!.getAttribute("aria-controls"),
    ).toBe("outside");
    expect(document.getElementById("outside")).not.toBeNull();
  });

  it("makes duplicate ids inside the subtree unique, first occurrence wins", () => {
    const root = mount('<i id="dup"></i><b id="dup"></b><a href="#dup">x</a>');
    scopeSubtreeIds(root, "p1-");
    expect(ids(root)).toEqual(["p1-dup", "p1-dup-2"]);
    expect(root.querySelector("a")!.getAttribute("href")).toBe("#p1-dup");
  });

  it("does not rename the root element itself", () => {
    const root = mount('<div id="root"><i id="child"></i></div>').querySelector(
      "#root",
    )!;
    scopeSubtreeIds(root, "p1-");
    expect(root.id).toBe("root");
    expect(ids(root)).toEqual(["p1-child"]);
  });

  it("is a no-op when the subtree has no ids", () => {
    const root = mount('<p style="color: red">hi</p><a href="#nowhere">x</a>');
    const map = scopeSubtreeIds(root, "p1-");
    expect(map.size).toBe(0);
    expect(root.innerHTML).toBe(
      '<p style="color: red">hi</p><a href="#nowhere">x</a>',
    );
  });

  it("survives ids containing regular-expression metacharacters", () => {
    const root = mount(
      '<svg><defs><marker id="a.b(c"></marker></defs>' +
        "<style>#a.b(c path { fill: red; }</style>" +
        '<path marker-end="url(#a.b(c)"></path></svg>',
    );
    scopeSubtreeIds(root, "p1-");
    expect(root.querySelector("path")!.getAttribute("marker-end")).toBe(
      "url(#p1-a.b(c)",
    );
    expect(root.querySelector("style")!.textContent).toContain(
      "#p1-a.b(c path",
    );
  });
});
