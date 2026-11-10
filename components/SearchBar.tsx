"use client";
// 検索欄と、入力中の候補
import { useEffect, useId, useState } from "react";
import { isValidQuery, normalizeQuery } from "@/lib/normalize";
import { suggest } from "@/lib/suggest";
import type { Brand } from "@/lib/types";
import { useBrands } from "./useBrands";

type Props = { onSearch: (q: string) => void; disabled?: boolean };

export function SearchBar({ onSearch, disabled }: Props) {
  const [input, setInput] = useState("");
  const [touched, setTouched] = useState(false);
  const [candidates, setCandidates] = useState<Brand[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [message, setMessage] = useState("");
  const brands = useBrands(touched);
  const listId = useId();

  // 入力から150ms待って候補を計算する
  useEffect(() => {
    const timer = setTimeout(() => {
      setCandidates(suggest(input, brands, 5));
      setActive(-1);
    }, 150);
    return () => clearTimeout(timer);
  }, [input, brands]);

  function submit(value: string) {
    if (!isValidQuery(normalizeQuery(value))) {
      setMessage("店名を入力してください");
      return;
    }
    setMessage("");
    setOpen(false);
    setInput(value);
    onSearch(value);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const visible = open && candidates.length > 0;
    if (e.key === "ArrowDown" && visible) {
      e.preventDefault();
      setActive((i) => (i + 1) % candidates.length);
    } else if (e.key === "ArrowUp" && visible) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? candidates.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(visible && active >= 0 ? candidates[active].name : input);
    }
  }

  const showList = open && candidates.length > 0;

  return (
    <form
      role="search"
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        submit(input);
      }}
    >
      <div className="flex gap-2">
        <input
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          aria-label="店名"
          placeholder="店名を入力（例：スシロー、サイゼリヤ）"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-4 py-3 text-base text-ink outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setTouched(true);
            setOpen(true);
            setMessage("");
          }}
          onFocus={() => setTouched(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          disabled={disabled}
          className="shrink-0 rounded-lg bg-accent px-5 py-3 font-bold text-on-accent transition hover:brightness-110 disabled:opacity-60"
        >
          検索
        </button>
      </div>
      {message && <p className="mt-2 text-sm text-danger">{message}</p>}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-[1000] mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-lg"
        >
          {candidates.map((b, i) => (
            <li
              key={b.name}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`flex cursor-pointer items-center justify-between px-4 py-3 text-ink ${i === active ? "bg-accent/10" : "hover:bg-accent/5"}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => submit(b.name)}
            >
              <span>{b.name}</span>
              {b.count > 0 && <span className="text-sm text-muted">{b.count.toLocaleString()}店</span>}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
