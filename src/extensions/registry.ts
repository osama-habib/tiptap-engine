// ============================================================================
// Extension Set
//
// Builds the fixed set of Tiptap extensions this engine runs with.
//
// Scope: the engine bundles Tiptap v3 StarterKit plus the additions listed
// below, and nothing else. There is no per-extension selection or
// configuration from the port side — every editor instance loads the same set.
// Adding or changing extensions is a build-time change to this file, not a
// runtime decision.
//
// StarterKit v3 includes:
//   Blockquote, BulletList, CodeBlock, Document, HardBreak, Heading,
//   HorizontalRule, ListItem, OrderedList, Paragraph, Text, Bold, Code,
//   Italic, Link, Strike, Underline, Dropcursor, Gapcursor, Undo/Redo,
//   ListKeymap, TrailingNode
//
// Additions beyond StarterKit:
//   Image, TableKit, TextAlign, UniqueID, BlockDirection
//
// The four additions past Image exist for one reason: ProseMirror drops
// nodes and attributes its schema does not declare. A document authored by a
// Tiptap-based web client carries tables, text alignment, per-node ids, and
// writing direction; an engine built without them does not merely fail to
// render those — it *deletes* them the moment the document is loaded and
// saved back. Where a host saves whole documents rather than diffs, that
// silently destroys content for every other client too. Each addition below
// is therefore a round-trip fidelity requirement, not a feature.
// ============================================================================

import { type AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import UniqueID from "@tiptap/extension-unique-id";
import { BlockDirection } from "./block-direction";

/**
 * Block node types that carry alignment and writing direction.
 *
 * Both are block-level properties, so this deliberately excludes inline
 * nodes and marks. Table cells are included because a cell's content is
 * independently aligned and directed in real documents.
 */
const BLOCK_TYPES = [
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "listItem",
  "bulletList",
  "orderedList",
  "tableCell",
  "tableHeader",
] as const;

/**
 * Node types that carry a stable `id` attribute.
 *
 * Ids are the addressing scheme a host uses to name one block — to scope an
 * edit to a selection, or to point an instruction at a single clause instead of
 * a whole document.
 *
 * **Top-level blocks only.** Nested nodes — list items, table rows, table cells
 * — are deliberately excluded, because the documents this engine loads carry no
 * ids on them. UniqueID *mints* an id wherever the attribute is declared and
 * missing, so declaring it on nested nodes would rewrite every one of them on
 * load and invent ids that no producer of these documents recognises. The
 * result looks harmless and quietly makes the saved document differ from the
 * one that was loaded.
 */
const IDENTIFIED_TYPES = [
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "bulletList",
  "orderedList",
  "horizontalRule",
  "image",
  "table",
] as const;

/**
 * Build the fixed extension set for an editor instance.
 *
 * @returns The array of configured Tiptap extension instances.
 */
export function buildExtensions(): AnyExtension[] {
  return [
    StarterKit,

    /**
     * Image is not part of StarterKit. openOnClick has no meaning for image,
     * but like Link in headless mode, the engine doesn't handle any
     * navigation or interaction — the port owns tap behavior. Image is
     * loaded with defaults; the port supplies src/alt/title via the
     * setImage command.
     */
    Image,

    /**
     * TableKit bundles Table, TableRow, TableCell and TableHeader — all four
     * are required, since a table node whose row or cell types are missing
     * from the schema cannot be parsed at all.
     *
     * resizable is off: column resizing is a pointer-driven affordance that
     * belongs to the port's rendering layer, and the engine has no pixels to
     * measure. Columns still round-trip through the colwidth attribute.
     */
    TableKit.configure({
      table: { resizable: false, allowTableNodeSelection: true },
    }),

    /**
     * TextAlign declares the `textAlign` attribute. Left with no default so
     * an unaligned block stays unaligned through a round trip rather than
     * being stamped with an explicit "left" that the source document never
     * had — which would also fight right-to-left content.
     */
    TextAlign.configure({
      types: [...BLOCK_TYPES],
      defaultAlignment: null,
    }),

    /**
     * UniqueID assigns and preserves the `id` attribute. Free in Tiptap v3
     * (it was a paid extension in v2).
     *
     * Ids must be preserved on documents that already have them, not
     * regenerated: a host that addresses blocks by id would find every
     * reference broken after a save that renumbered them.
     */
    UniqueID.configure({
      types: [...IDENTIFIED_TYPES],

      /**
       * Already the package default, stated explicitly because the whole
       * addressing scheme is this one attribute name: if it ever changed, ids
       * would land under a key nothing reads, and the failure would be silent
       * — rendering stays correct and only block-scoped edits stop working.
       */
      attributeName: "id",
    }),

    /**
     * BlockDirection is hand-written — see ./block-direction.ts for why
     * core's own TextEirection cannot be used: core adds it to every editor
     * automatically but with no options, so it declares no attributes and
     * `dir` is dropped on load; it is not configurable through
     * coreExtensionOptions; and it has no `dirLocked`.
     */
    BlockDirection.configure({
      types: [...BLOCK_TYPES],
      defaultDirection: null,
    }),
  ];
}
