'use client';

import { useEffect, useRef } from 'react';
import 'quill/dist/quill.snow.css';

export interface QuillEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

const TOOLBAR_OPTIONS = [
  [{ header: [2, 3, false] }],
  ['bold', 'italic', 'underline'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['link'],
  ['clean'],
];

interface QuillInstance {
  root: { innerHTML: string };
  clipboard: { dangerouslyPasteHTML: (html: string, source?: string) => void };
  on: (event: string, handler: () => void) => void;
}

export function QuillEditor({ value, onChange, placeholder, className }: QuillEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<QuillInstance | null>(null);
  const lastValueRef = useRef<string>(value);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof window === 'undefined') return;

    let mounted = true;

    const init = async () => {
      const Quill = (await import('quill')).default;
      if (!mounted || !containerRef.current) return;

      const editor = new Quill(containerRef.current, {
        theme: 'snow',
        placeholder: placeholder ?? 'Write your note…',
        modules: {
          toolbar: TOOLBAR_OPTIONS,
        },
      }) as QuillInstance;

      editorRef.current = editor;

      const initialHtml = value || '';
      lastValueRef.current = initialHtml;
      if (initialHtml) {
        editor.clipboard.dangerouslyPasteHTML(initialHtml);
      }

      editor.on('text-change', () => {
        if (!editorRef.current) return;
        const html = editor.root.innerHTML;
        lastValueRef.current = html;
        onChange(html);
      });
    };

    init();

    return () => {
      mounted = false;
      editorRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- init once on mount

  // Sync value from parent (e.g. when a note is loaded)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (value === lastValueRef.current) return;
    lastValueRef.current = value;
    editor.clipboard.dangerouslyPasteHTML(value || '', 'silent');
  }, [value]);

  return <div ref={containerRef} className={className} />;
}
