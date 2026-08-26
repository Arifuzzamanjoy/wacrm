import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn utility", () => {
  it("merges single and multiple string class names", () => {
    expect(cn("foo")).toBe("foo");
    expect(cn("foo", "bar", "baz")).toBe("foo bar baz");
  });

  it("handles conditional object inputs", () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe("foo baz");
  });

  it("handles arrays and nested arrays of class names", () => {
    expect(cn(["foo", "bar"], ["baz", ["nested"]])).toBe("foo bar baz nested");
  });

  it("ignores falsy values including null, undefined, false, and empty strings", () => {
    expect(cn("foo", null, undefined, false, "", "bar")).toBe("foo bar");
  });

  it("resolves Tailwind CSS conflicts correctly", () => {
    // padding conflict: later utility wins
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");

    // color conflict
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");

    // background conflict
    expect(cn("bg-red-500", "bg-green-500")).toBe("bg-green-500");
  });

  it("preserves modifier variants during Tailwind merging", () => {
    expect(cn("hover:bg-red-500", "hover:bg-blue-500")).toBe("hover:bg-blue-500");
    expect(cn("bg-red-500", "hover:bg-blue-500")).toBe("bg-red-500 hover:bg-blue-500");
  });

  it("returns an empty string when called with no arguments or empty inputs", () => {
    expect(cn()).toBe("");
    expect(cn(null, undefined, false)).toBe("");
  });
});
