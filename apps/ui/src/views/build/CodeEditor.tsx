import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { yaml, yamlFrontmatter } from "@codemirror/lang-yaml";
import { HighlightStyle, bracketMatching, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";

const language = (path: string): Extension => {
    if (path.endsWith(".json")) return json();
    if (/\.(m|c)?(t|j)sx?$/.test(path)) return javascript({ typescript: /\.(m|c)?tsx?$/.test(path), jsx: path.endsWith("x") });
    if (/\.ya?ml$/.test(path)) return yaml();
    return yamlFrontmatter({ content: markdown() });
};

/* Colors come from the active theme's tokens, so the editor follows io and nyx like the rest of the app. */
const look = EditorView.theme({
    "&": { height: "100%", color: "var(--aspis-term-ink)", backgroundColor: "var(--aspis-term-bg)", font: "var(--aspis-type-code)" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { fontFamily: "var(--aspis-font-mono)", lineHeight: "1.7" },
    ".cm-content": { padding: "var(--aspis-space-3) 0", caretColor: "var(--aspis-accent)" },
    ".cm-gutters": { backgroundColor: "var(--aspis-term-bg)", color: "var(--aspis-term-rule)", border: "none", paddingRight: "var(--aspis-space-2)" },
    ".cm-activeLine": { backgroundColor: "var(--aspis-term-highlight)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--aspis-term-dim)" },
    ".cm-cursor": { borderLeftColor: "var(--aspis-accent)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "var(--aspis-term-highlight) !important" },
    ".cm-matchingBracket": { backgroundColor: "var(--aspis-term-highlight)", outline: "1px solid var(--aspis-term-rule)" },
});

const highlight = HighlightStyle.define([
    { tag: [tags.keyword, tags.operatorKeyword, tags.modifier, tags.definitionKeyword], color: "var(--aspis-syntax-keyword)" },
    { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.heading], color: "var(--aspis-syntax-function)", fontWeight: "500" },
    { tag: [tags.string, tags.number, tags.bool, tags.null, tags.atom], color: "var(--aspis-syntax-literal)" },
    { tag: [tags.propertyName, tags.attributeName, tags.variableName, tags.labelName], color: "var(--aspis-syntax-argument)" },
    { tag: [tags.comment, tags.meta, tags.processingInstruction, tags.contentSeparator], color: "var(--aspis-syntax-comment)" },
    { tag: [tags.emphasis], fontStyle: "italic" },
    { tag: [tags.strong], fontWeight: "600" },
    { tag: [tags.link, tags.url], color: "var(--aspis-syntax-function)", textDecoration: "underline" },
    { tag: [tags.monospace], color: "var(--aspis-syntax-literal)" },
]);

/*
 * The Code mode. The text passed in is the truth; edits flow out through onChange, and a new text coming in (the
 * form changed it, another file was opened) replaces the document without losing the cursor when it can.
 */
export function CodeEditor({ path, value, onChange, onSave }: { path: string; value: string; onChange: (text: string) => void; onSave: () => void }) {
    const host = useRef<HTMLDivElement>(null);
    const view = useRef<EditorView>(undefined);
    const latest = useRef({ onChange, onSave });
    latest.current = { onChange, onSave };

    useEffect(() => {
        const editor = new EditorView({
            parent: host.current!,
            state: EditorState.create({
                doc: value,
                extensions: [
                    lineNumbers(),
                    highlightActiveLineGutter(),
                    highlightActiveLine(),
                    history(),
                    drawSelection(),
                    indentOnInput(),
                    bracketMatching(),
                    EditorState.tabSize.of(4),
                    keymap.of([{ key: "Mod-s", preventDefault: true, run: () => (latest.current.onSave(), true) }, indentWithTab, ...defaultKeymap, ...historyKeymap]),
                    language(path),
                    syntaxHighlighting(highlight),
                    look,
                    EditorView.lineWrapping,
                    EditorView.contentAttributes.of({ "aria-label": path, spellcheck: "false" }),
                    EditorView.updateListener.of((update) => update.docChanged && latest.current.onChange(update.state.doc.toString())),
                ],
            }),
        });
        view.current = editor;
        return () => editor.destroy();
    }, [path]);

    useEffect(() => {
        const editor = view.current;
        if (!editor || editor.state.doc.toString() === value) return;
        const head = Math.min(editor.state.selection.main.head, value.length);
        editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value }, selection: { anchor: head } });
    }, [value]);

    return <div ref={host} className="h-[560px] overflow-hidden rounded-[var(--aspis-radius-inset)] border border-[var(--aspis-line)]" />;
}
