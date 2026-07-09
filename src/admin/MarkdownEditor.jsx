import { useMemo } from "react";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CodeToggle,
  CreateLink,
  DiffSourceToggleWrapper,
  InsertCodeBlock,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  Separator,
  UndoRedo,
  codeBlockPlugin,
  diffSourcePlugin,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";

export default function MarkdownEditor({ label, description, value, onChange, editorKey }) {
  const plugins = useMemo(
    () => [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      tablePlugin(),
      codeBlockPlugin({ defaultCodeBlockLanguage: "markdown" }),
      diffSourcePlugin({ viewMode: "rich-text" }),
      markdownShortcutPlugin(),
      toolbarPlugin({
        toolbarContents: () => (
          <DiffSourceToggleWrapper>
            <UndoRedo />
            <Separator />
            <BlockTypeSelect />
            <BoldItalicUnderlineToggles />
            <CodeToggle />
            <ListsToggle />
            <Separator />
            <CreateLink />
            <InsertTable />
            <InsertCodeBlock />
            <InsertThematicBreak />
          </DiffSourceToggleWrapper>
        ),
      }),
    ],
    [],
  );

  return (
    <FieldFrame label={label} description={description}>
      <MDXEditor
        key={editorKey}
        className="admin-markdown-editor"
        markdown={value || ""}
        onChange={onChange}
        plugins={plugins}
      />
    </FieldFrame>
  );
}

function FieldFrame({ label, description, children }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium leading-none">{label}</span>
      {children}
      {description ? <span className="text-sm text-muted-foreground">{description}</span> : null}
    </label>
  );
}
