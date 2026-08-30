import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ResizableSplitter } from "./resizable-splitter";
import { CollapsibleSection } from "./collapsible-section";

describe("ResizableSplitter Component", () => {
  it("renders with correct ARIA attributes and separator role", () => {
    const onWidthChange = vi.fn();
    const markup = renderToStaticMarkup(
      <ResizableSplitter
        side="left"
        width={320}
        minWidth={240}
        maxWidth={500}
        defaultWidth={320}
        onWidthChange={onWidthChange}
        ariaLabel="Left splitter"
      />
    );

    expect(markup).toContain('role="separator"');
    expect(markup).toContain('aria-orientation="vertical"');
    expect(markup).toContain('aria-valuenow="320"');
    expect(markup).toContain('aria-valuemin="240"');
    expect(markup).toContain('aria-valuemax="500"');
    expect(markup).toContain('aria-label="Left splitter"');
    expect(markup).toContain("cursor-col-resize");
  });

  it("renders right side splitter with default attributes", () => {
    const onWidthChange = vi.fn();
    const markup = renderToStaticMarkup(
      <ResizableSplitter
        side="right"
        width={400}
        onWidthChange={onWidthChange}
      />
    );

    expect(markup).toContain('role="separator"');
    expect(markup).toContain('aria-valuenow="400"');
    expect(markup).toContain('aria-label="right panel resizer"');
  });
});

describe("CollapsibleSection Component", () => {
  it("renders title, badge, action and children when open", () => {
    const markup = renderToStaticMarkup(
      <CollapsibleSection
        title="Tags"
        badge={3}
        defaultOpen={true}
        action={<button>Add</button>}
      >
        <div data-testid="tag-content">Tag Item 1</div>
      </CollapsibleSection>
    );

    expect(markup).toContain("Tags");
    expect(markup).toContain("3");
    expect(markup).toContain("Add");
    expect(markup).toContain("Tag Item 1");
    expect(markup).toContain('aria-expanded="true"');
  });

  it("does not render children when closed", () => {
    const markup = renderToStaticMarkup(
      <CollapsibleSection
        title="Notes"
        defaultOpen={false}
      >
        <div data-testid="secret-note">Secret Content</div>
      </CollapsibleSection>
    );

    expect(markup).toContain("Notes");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("Secret Content");
  });
});
