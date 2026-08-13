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
 * Ids are what let a host address a specific block — to scope an edit to a
 * selection, or to reconcile a change against one clause rather than
 * rewriting the document. Only structural block nodes get one; text nodes and
 * marks are addressed by position, not identity.
 */
const IDENTIFIED_TYPES = [
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "bulletList",
  "orderedList",
  "listItem",
  "horizontalRule",
  "image",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
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
