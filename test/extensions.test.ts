// ============================================================================
// Extension set: round-trip fidelity
//
// These tests exist because of one ProseMirror behaviour: nodes and
// attributes the schema does not declare are dropped silently on load. A host
// that saves whole documents rather than diffs will then persist the stripped
// version, destroying content that other clients authored. So for every
// addition past StarterKit, the thing worth asserting is not "the command
// works" but "loading and re-reading a document does not lose it".
// ============================================================================

import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import { buildExtensions } from "../src/extensions/registry";

const openEditors: Editor[] = [];

function editor() {
  const instance = new Editor({ extensions: buildExtensions() });
  openEditors.push(instance);
  return instance;
}

/**
 * Destroy every editor a test created.
 *
 * Not hygiene — required. ProseMirror's DOMObserver schedules a flush on a
 * timer, and an editor left alive fires it after vitest has torn down jsdom,
 * where `document` no longer exists. Vitest reports that as an unhandled error
 * and warns it can produce false positives.
 */
afterEach(() => {
  while (openEditors.length) openEditors.pop()?.destroy();
});

/**
 * A fragment in the shape real documents arrive in: right-to-left headings
 * with an explicit direction lock and alignment, and a table with a header
 * row.
 */
const DOCUMENT_HTML = `<h1 dir="rtl" data-dir-locked="true" style="text-align:center">عقد عمل</h1>
<p dir="rtl">بسم الله</p>
<table><tbody>
<tr><th dir="rtl">البيان</th><th>الطرف الأول</th></tr>
<tr><td dir="rtl">الاسم</td><td>[اسم صاحب العمل]</td></tr>
</tbody></table>`;

describe("extension set", () => {
  it("registers no duplicate extension names", () => {
    const names = editor().extensionManager.extensions.map((e) => e.name);
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);

    /**
     * Guards against re-introducing a same-named extension alongside one of
     * core's automatic ones — the failure that made a hand-rolled
     * textDirection collide with core's inert TextDirection.
     */
    expect(duplicates).toEqual([]);
  });

  it("exposes table, alignment, id and direction commands", () => {
    const commands = Object.keys(editor().commands);

    expect(commands).toContain("insertTable");
    expect(commands).toContain("setTextAlign");
    expect(commands).toContain("setBlockDirection");
    expect(commands).toContain("setBlockDirectionLocked");
  });
});

describe("round-trip fidelity", () => {
  it("preserves table nodes", () => {
    const e = editor();
    e.commands.setContent(DOCUMENT_HTML);
    const json = JSON.stringify(e.getJSON());

    // All four table node types must survive; a table whose row or cell type
    // is missing from the schema cannot be parsed at all.
    expect(json).toContain('"table"');
    expect(json).toContain('"tableRow"');
    expect(json).toContain('"tableHeader"');
    expect(json).toContain('"tableCell"');
  });

  it("preserves dir, dirLocked, textAlign and id on a block", () => {
    const e = editor();
    e.commands.setContent(DOCUMENT_HTML);
    const heading = e.getJSON().content?.[0] as
      | { attrs?: Record<string, unknown> }
      | undefined;

    expect(heading?.attrs?.dir).toBe("rtl");
    expect(heading?.attrs?.dirLocked).toBe(true);
    expect(heading?.attrs?.textAlign).toBe("center");
    expect(typeof heading?.attrs?.id).toBe("string");
  });

  it("preserves cell-level direction inside a table", () => {
    const e = editor();
    e.commands.setContent(DOCUMENT_HTML);

    // Cells carry their own direction in real documents, which is why
    // tableCell/tableHeader are in the configured block types.
    const html = e.getHTML();
    expect(html).toMatch(/<t[hd][^>]*dir="rtl"/);
  });

  it("leaves an undirected document undirected", () => {
    const e = editor();
    e.commands.setContent("<p>plain</p>");
    const paragraph = e.getJSON().content?.[0] as
      | { attrs?: Record<string, unknown> }
      | undefined;

    // defaultDirection is null so a document that never had a direction is
    // not stamped with one on its first save.
    expect(paragraph?.attrs?.dir).toBeNull();
    expect(e.getHTML()).not.toContain("dir=");
  });

  it("normalizes an unsupported direction to inherit", () => {
    const e = editor();
    e.commands.setContent('<p dir="auto">مرحبا</p>');
    const paragraph = e.getJSON().content?.[0] as
      | { attrs?: Record<string, unknown> }
      | undefined;

    // `auto` is valid HTML but needs text measurement to resolve, which a
    // headless engine cannot do — it degrades to inherit rather than being
    // passed through as a value no renderer can act on.
    expect(paragraph?.attrs?.dir).toBeNull();
  });

  it("keeps ids stable across a save", () => {
    const e = editor();
    e.commands.setContent(DOCUMENT_HTML);
    const first = JSON.stringify(e.getJSON());

    e.commands.setContent(first ? JSON.parse(first) : undefined);
    const second = e.getJSON();

    // Ids must be preserved rather than regenerated: a host that addresses
    // blocks by id would find every reference broken by a renumbering save.
    const idOf = (doc: typeof second) =>
      (doc.content?.[0] as { attrs?: { id?: string } } | undefined)?.attrs?.id;
    expect(idOf(second)).toBe(idOf(JSON.parse(first)));
  });
});

describe("id placement", () => {
  /**
   * Walk every node in a document, reporting each type and whether it carries
   * an id. Nested nodes are what this group is about, so the walk cannot stop
   * at the top level.
   */
  function idsByType(node: Record<string, unknown>): Array<[string, boolean]> {
    const found: Array<[string, boolean]> = [];

    const visit = (n: Record<string, unknown>) => {
      const type = n.type;
      if (typeof type === "string" && type !== "doc" && type !== "text") {
        const attrs = n.attrs as Record<string, unknown> | undefined;
        found.push([type, typeof attrs?.id === "string"]);
      }
      for (const child of (n.content as Array<Record<string, unknown>>) ?? []) {
        visit(child);
      }
    };

    visit(node);
    return found;
  }

  it("puts ids on top-level blocks and never on nested nodes", () => {
    const e = editor();
    e.commands.setContent(DOCUMENT_HTML);
    const types = idsByType(e.getJSON() as Record<string, unknown>);

    const withId = (type: string) =>
      types.filter(([t]) => t === type).map(([, hasId]) => hasId);

    // The addressing scheme: a host names a block by its id, so top-level
    // blocks must have one.
    expect(withId("heading")).not.toContain(false);
    expect(withId("paragraph")).not.toContain(false);
    expect(withId("table")).not.toContain(false);

    /**
     * And nested nodes must NOT. UniqueID mints an id wherever the attribute is
     * declared and absent, so declaring it here would rewrite every list item,
     * row and cell on load and invent ids no document producer knows. Nothing
     * would appear broken — the saved document would just silently differ from
     * the loaded one.
     */
    expect(withId("listItem")).not.toContain(true);
    expect(withId("tableRow")).not.toContain(true);
    expect(withId("tableCell")).not.toContain(true);
    expect(withId("tableHeader")).not.toContain(true);
  });

  it("leaves a loaded document's nested nodes untouched", () => {
    const e = editor();
    e.commands.setContent(DOCUMENT_HTML);
    const loaded = JSON.stringify(e.getJSON());

    e.commands.setContent(JSON.parse(loaded));

    // Loading and re-reading must be a fixed point for the parts of the tree
    // the engine does not own, or every open would look like an edit.
    expect(JSON.stringify(e.getJSON())).toBe(loaded);
  });
});
